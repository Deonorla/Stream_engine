const { spawn, spawnSync } = require("child_process");

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const dockerCmd = isWindows ? "docker.exe" : "docker";

const DEFAULT_POSTGRES_CONTAINER = process.env.STREAM_ENGINE_POSTGRES_CONTAINER || "stream-engine-postgres";
const DEFAULT_POSTGRES_IMAGE = process.env.STREAM_ENGINE_POSTGRES_IMAGE || "postgres:16";
const DEFAULT_POSTGRES_USER = process.env.STREAM_ENGINE_POSTGRES_USER || "postgres";
const DEFAULT_POSTGRES_PASSWORD = process.env.STREAM_ENGINE_POSTGRES_PASSWORD || "postgres";
const DEFAULT_POSTGRES_DB = process.env.STREAM_ENGINE_POSTGRES_DB || "stream_engine";
const DEFAULT_POSTGRES_HOST_PORT = Number(process.env.STREAM_ENGINE_POSTGRES_PORT || 5432);
const DEFAULT_POSTGRES_URL = `postgres://${DEFAULT_POSTGRES_USER}:${DEFAULT_POSTGRES_PASSWORD}@127.0.0.1:${DEFAULT_POSTGRES_HOST_PORT}/${DEFAULT_POSTGRES_DB}`;
const shouldAutoStartPostgres = !["0", "false", "no", "off"].includes(
    String(process.env.STREAM_ENGINE_AUTO_START_POSTGRES || "true").trim().toLowerCase()
);

function printHelp() {
    console.log(
        [
            "Usage:",
            "  node scripts/dev-stack.js",
            "",
            "Starts the required local apps together:",
            "  - Docker Postgres on :5432 (unless STREAM_ENGINE_AUTO_START_POSTGRES=false)",
            "  - Stream Engine backend on :3001",
            "  - Stream Engine frontend (Vite) on :5173",
        ].join("\n")
    );
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
}

const processes = [];
let shuttingDown = false;

function runSync(command, args, options = {}) {
    const { inheritStdIo = false, env = process.env } = options;
    return spawnSync(command, args, {
        env,
        encoding: "utf8",
        stdio: inheritStdIo ? "inherit" : ["ignore", "pipe", "pipe"],
    });
}

function commandExists(command) {
    const result = runSync(command, ["--version"]);
    return result.status === 0;
}

function dockerDaemonReady() {
    const result = runSync(dockerCmd, ["info"]);
    return result.status === 0;
}

function inspectContainerRunning(name) {
    const result = runSync(dockerCmd, ["inspect", "-f", "{{.State.Running}}", name]);
    if (result.status !== 0) return null;
    return String(result.stdout || "").trim() === "true";
}

function ensureContainerRunning(name) {
    const running = inspectContainerRunning(name);
    if (running === true) return;

    if (running === false) {
        const startResult = runSync(dockerCmd, ["start", name]);
        if (startResult.status !== 0) {
            throw new Error(startResult.stderr || startResult.stdout || `Failed to start Docker container ${name}.`);
        }
        return;
    }

    const runResult = runSync(dockerCmd, [
        "run",
        "--name", name,
        "-e", `POSTGRES_USER=${DEFAULT_POSTGRES_USER}`,
        "-e", `POSTGRES_PASSWORD=${DEFAULT_POSTGRES_PASSWORD}`,
        "-e", `POSTGRES_DB=${DEFAULT_POSTGRES_DB}`,
        "-p", `${DEFAULT_POSTGRES_HOST_PORT}:5432`,
        "-d",
        DEFAULT_POSTGRES_IMAGE,
    ]);
    if (runResult.status !== 0) {
        throw new Error(runResult.stderr || runResult.stdout || `Failed to create Docker container ${name}.`);
    }
}

async function waitForPostgresReady(name, timeoutMs = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const ready = runSync(dockerCmd, ["exec", name, "pg_isready", "-U", DEFAULT_POSTGRES_USER, "-d", DEFAULT_POSTGRES_DB]);
        if (ready.status === 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error(`Postgres container ${name} did not become ready within ${Math.floor(timeoutMs / 1000)}s.`);
}

async function ensureLocalPostgres() {
    if (!shouldAutoStartPostgres) {
        return {
            postgresUrl: process.env.POSTGRES_URL || "",
            source: "env-only",
        };
    }

    if (!commandExists(dockerCmd)) {
        throw new Error("Docker CLI is not installed or not on PATH.");
    }

    if (!dockerDaemonReady()) {
        throw new Error("Docker daemon is not running. Start Docker Desktop and retry.");
    }

    ensureContainerRunning(DEFAULT_POSTGRES_CONTAINER);
    await waitForPostgresReady(DEFAULT_POSTGRES_CONTAINER);
    return {
        postgresUrl: DEFAULT_POSTGRES_URL,
        source: "docker",
    };
}

function stopAll(exitCode = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    for (const child of processes) {
        if (!child.killed) {
            child.kill("SIGTERM");
        }
    }

    setTimeout(() => {
        for (const child of processes) {
            if (!child.killed) {
                child.kill("SIGKILL");
            }
        }
        process.exit(exitCode);
    }, 1500).unref();
}

function run(name, args) {
    const env = {
        ...process.env,
    };
    if (name === "backend" && process.env.STREAM_ENGINE_DEVSTACK_POSTGRES_URL) {
        env.POSTGRES_URL = process.env.STREAM_ENGINE_DEVSTACK_POSTGRES_URL;
    }

    const child = spawn(npmCmd, args, {
        stdio: "inherit",
        env,
    });

    child.on("exit", (code, signal) => {
        if (shuttingDown) {
            return;
        }

        if (signal) {
            console.log(`[${name}] exited from signal ${signal}`);
            stopAll(1);
            return;
        }

        if (code !== 0) {
            console.log(`[${name}] exited with code ${code}`);
            stopAll(code || 1);
            return;
        }

        console.log(`[${name}] exited cleanly`);
        stopAll(0);
    });

    child.on("error", (error) => {
        console.error(`[${name}] failed to start:`, error.message || error);
        stopAll(1);
    });

    processes.push(child);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

async function main() {
    try {
        const postgres = await ensureLocalPostgres();
        if (postgres.postgresUrl) {
            process.env.STREAM_ENGINE_DEVSTACK_POSTGRES_URL = postgres.postgresUrl;
        }
        if (postgres.source === "docker") {
            console.log(`Postgres ready in Docker container '${DEFAULT_POSTGRES_CONTAINER}'`);
            console.log(`Using POSTGRES_URL=${postgres.postgresUrl}`);
        } else {
            console.log("Postgres auto-start disabled; using POSTGRES_URL from environment.");
        }
    } catch (error) {
        console.error("[dev-stack] Failed to prepare Postgres:", error.message || error);
        process.exit(1);
        return;
    }

    console.log("Starting Stream Engine backend and frontend...");

    run("backend", ["--prefix", "server", "start"]);
    run("frontend", ["--prefix", "vite-project", "run", "dev", "--", "--host"]);
}

void main();

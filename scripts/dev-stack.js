const { spawn } = require("child_process");

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

function printHelp() {
    console.log(
        [
            "Usage:",
            "  node scripts/dev-stack.js",
            "",
            "Starts the required local apps together:",
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
    const child = spawn(npmCmd, args, {
        stdio: "inherit",
        env: process.env,
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

console.log("Starting Stream Engine backend and frontend...");

run("backend", ["--prefix", "server", "start"]);
run("frontend", ["--prefix", "vite-project", "run", "dev", "--", "--host"]);

const crypto = require("crypto");

/**
 * Parse a human-readable decimal string into the smallest unit (bigint).
 * e.g. parseUnits("1.5", 7) => 15000000n
 */
function parseUnits(value, decimals = 7) {
    const str = String(value);
    const [whole = "0", frac = ""] = str.split(".");
    const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
    return BigInt(whole + padded);
}

/**
 * Format a bigint from smallest unit into a human-readable decimal string.
 * e.g. formatUnits(15000000n, 7) => "1.5"
 */
function formatUnits(value, decimals = 7) {
    const str = String(value).padStart(decimals + 1, "0");
    const whole = str.slice(0, str.length - decimals) || "0";
    const frac = str.slice(str.length - decimals).replace(/0+$/, "") || "0";
    return `${whole}.${frac}`;
}

/**
 * SHA-256 hash of a UTF-8 string, returned as a 0x-prefixed hex string.
 */
function sha256Hex(value) {
    return "0x" + crypto.createHash("sha256").update(value || "", "utf8").digest("hex");
}

module.exports = { parseUnits, formatUnits, sha256Hex };

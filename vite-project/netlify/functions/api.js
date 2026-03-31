"use strict";

function resolveBackendBaseUrl() {
    return (
        process.env.STREAM_ENGINE_NETLIFY_BACKEND_URL
        || process.env.STREAM_ENGINE_SESSION_API_URL
        || process.env.VITE_RWA_API_URL
        || ""
    ).replace(/\/$/, "");
}

exports.handler = async (event) => {
    const backendBaseUrl = resolveBackendBaseUrl();
    if (!backendBaseUrl) {
        return {
            statusCode: 503,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                error: "Backend URL is not configured.",
                code: "backend_unavailable",
            }),
        };
    }

    const path = (event.path || "").replace(/^\/\.netlify\/functions\/api/, "");
    const targetUrl = `${backendBaseUrl}${path || "/"}${event.rawQuery ? `?${event.rawQuery}` : ""}`;
    const requestHeaders = { ...(event.headers || {}) };
    delete requestHeaders.host;
    delete requestHeaders["x-forwarded-host"];

    const response = await fetch(targetUrl, {
        method: event.httpMethod || "GET",
        headers: requestHeaders,
        body: event.body && !["GET", "HEAD"].includes(event.httpMethod || "GET")
            ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body)
            : undefined,
    });

    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    const headers = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return {
        statusCode: response.status,
        headers,
        body: bodyBuffer.toString("base64"),
        isBase64Encoded: true,
    };
};

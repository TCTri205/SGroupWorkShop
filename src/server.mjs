import "dotenv/config";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { invokeAssistantGraph } from "./lib/langgraph/assistant-graph.mjs";
import { initializeClients } from "./lib/mcp-client-manager.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new Error("Invalid JSON body");
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const rawPathname = url.pathname === "/" ? "/index.html" : url.pathname;
  let pathname;

  try {
    pathname = decodeURIComponent(rawPathname);
  } catch (error) {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);

  // Path traversal protection: ensure resolved path is within PUBLIC_DIR
  const normalizedPublic = path.normalize(PUBLIC_DIR);
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(normalizedPublic + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
    response.end(data);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "Not Found" : "Internal Server Error");
  }
}

async function requestListener(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await readJsonBody(request);
      const message = String(body.message ?? "").trim();
      const sessionId = String(body.sessionId ?? "").trim() || undefined;

      if (!message) {
        sendJson(response, 400, { error: "message is required" });
        return;
      }

      const payload = await invokeAssistantGraph({ message, channel: "web", sessionId });
      sendJson(response, 200, payload);
    } catch (error) {
      console.error("[server] Chat API error:", error);
      if (error instanceof Error && error.message === "Invalid JSON body") {
        sendJson(response, 400, { error: "invalid_json_body" });
        return;
      }
      sendJson(response, 500, { error: "internal_server_error" });
    }
    return;
  }

  if (request.method === "GET") {
    await serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method Not Allowed");
}

export function createServer() {
  return http.createServer((request, response) => {
    requestListener(request, response).catch((error) => {
      console.error("[server] Unhandled request error:", error);
      response.writeHead(500);
      response.end("Internal Server Error");
    });
  });
}

async function main() {
  await initializeClients();
  const server = createServer();
  const port = Number(process.env.PORT || 3000);

  server.listen(port, () => {
    console.error(`SGroup web server listening on http://localhost:${port}`);
  });
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

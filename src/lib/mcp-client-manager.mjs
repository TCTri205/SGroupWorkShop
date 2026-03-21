import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";

const configPath = path.resolve(process.cwd(), "mcp-config.json");
const clients = new Map();
let availableExternalTools = [];

export async function initializeClients() {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    const servers = config.mcpServers || {};

    for (const [name, serverConfig] of Object.entries(servers)) {
      try {
        console.log(`[mcp-client] Connecting to ${name}...`);
        const env = { ...process.env };
        for (const [key, val] of Object.entries(serverConfig.env || {})) {
          if (val) {
            env[key] = val;
          }
        }
        
        // Remove undefined from shell environment to prevent throwing Error: Invalid args
        for (const envKey of Object.keys(env)) {
            if (env[envKey] === undefined) {
                delete env[envKey];
            }
        }

        const transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args || [],
          env
        });

        const client = new Client(
          { name: "sgroup-chatbot-mcp", version: "1.0.0" },
          { capabilities: {} }
        );

        await client.connect(transport);
        const { tools } = await client.listTools();
        
        clients.set(name, { client, transport, tools: tools ?? [] });
        console.log(`[mcp-client] Connected to ${name}. Loaded ${(tools ?? []).length} tools.`);

        for (const tool of (tools ?? [])) {
          availableExternalTools.push({
            serverName: name,
            tool
          });
        }
      } catch (err) {
        console.error(`[mcp-client] Failed to connect to ${name}:`, err.message);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`[mcp-client] Failed to load config from ${configPath}:`, error.message);
    }
  }
}

export function getAvailableExternalTools() {
  // Returns LangGraph-friendly MCP tools
  return availableExternalTools.map(t => t.tool);
}

export async function executeExternalTool(toolName, args) {
  const match = availableExternalTools.find(t => t.tool.name === toolName);
  if (!match) {
    throw new Error(`External tool ${toolName} not found.`);
  }

  const { serverName } = match;
  const clientInfo = clients.get(serverName);
  if (!clientInfo) {
    throw new Error(`Client for server ${serverName} is not connected.`);
  }

  const result = await clientInfo.client.callTool({
    name: toolName,
    arguments: args
  });

  return result;
}

export async function cleanupClients() {
  for (const [name, clientInfo] of clients.entries()) {
    try {
      await clientInfo.transport.close();
      console.log(`[mcp-client] Closed connection to ${name}.`);
    } catch (err) {
      console.error(`[mcp-client] Error closing ${name}:`, err.message);
    }
  }
  clients.clear();
  availableExternalTools = [];
}

import { initializeClients, getAvailableExternalTools } from "../src/lib/mcp-client-manager.mjs";
import dotenv from "dotenv";

dotenv.config();

async function inspect() {
  console.log("Initializing MCP Clients...");
  await initializeClients();
  
  const tools = getAvailableExternalTools();
  console.log(`Found ${tools.length} tools:`);
  
  for (const tool of tools) {
    console.log(`\n--- ${tool.name} ---`);
    console.log(`Description: ${tool.description}`);
    console.log(`Arguments Schema:`, JSON.stringify(tool.inputSchema, null, 2));
  }
  
  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});

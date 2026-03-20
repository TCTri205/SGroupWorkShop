import { randomUUID } from "node:crypto";

import { searchKnowledge } from "./knowledge.mjs";
import { invokeAssistantGraph } from "./langgraph/assistant-graph.mjs";
import { queryNews, queryWeather, queryWebSearch } from "./providers.mjs";

function safeTrim(value) {
  return String(value ?? "").trim();
}

export function formatTextContent(text) {
  return {
    content: [{ type: "text", text: String(text ?? "") }],
    isError: false
  };
}

export function formatErrorContent(message) {
  return {
    content: [{ type: "text", text: `Error: ${String(message ?? "Unknown error")}` }],
    isError: true
  };
}

function buildKnowledgeSummary(records) {
  if (!records.length) {
    return "Khong tim thay ket qua phu hop.";
  }

  return records
    .slice(0, 3)
    .map((record, index) => `${index + 1}. ${record.title}\n${record.content}`)
    .join("\n\n");
}

export const TOOLS = [
  {
    name: "get_weather",
    description: "Lay thong tin thoi tiet theo dia diem.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Ten thanh pho hoac dia diem." }
      },
      required: ["location"]
    }
  },
  {
    name: "get_news",
    description: "Lay tin tuc theo danh muc.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Danh muc tin tuc, vi du cong-nghe." }
      },
      required: ["category"]
    }
  },
  {
    name: "search_it_knowledge",
    description: "Tim kiem thong tin cong nghe tu nguon ben ngoai.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Chu de can tim kiem." }
      },
      required: ["topic"]
    }
  },
  {
    name: "search_sgroup_knowledge",
    description: "Tra cuu tri thuc noi bo cua SGroup va AI Team.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Tu khoa tim kiem noi bo." }
      },
      required: ["query"]
    }
  },
  {
    name: "run_sgroup_assistant",
    description: "Chay tro ly noi bo de route va tong hop cau tra loi.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Tin nhan cua nguoi dung." },
        sessionId: { type: "string", description: "Ma phien lam viec tuy chon." }
      },
      required: ["message"]
    }
  }
];

export const RESOURCES = [
  {
    uri: "sgroup://knowledge/ai-team",
    name: "AI Team Knowledge",
    description: "Tong hop tri thuc noi bo ve AI Team.",
    mimeType: "text/plain"
  },
  {
    uri: "sgroup://knowledge/sgroup-overview",
    name: "SGroup Overview",
    description: "Tong quan tri thuc noi bo ve SGroup.",
    mimeType: "text/plain"
  }
];

export async function ensureClientsInitialized() {
  return;
}

export async function listAllTools() {
  return TOOLS;
}

export async function callMcpTool(name, args) {
  return executeTool(name, args);
}

export async function executeTool(name, args = {}) {
  try {
    switch (name) {
      case "get_weather": {
        const location = safeTrim(args.location);
        if (!location) {
          return formatErrorContent("location is required");
        }
        const result = await queryWeather(location);
        return formatTextContent("## Thoi tiet hien tai\n\n" + result.message);
      }
      case "get_news": {
        const category = safeTrim(args.category);
        if (!category) {
          return formatErrorContent("category is required");
        }
        const result = await queryNews(category);
        return formatTextContent(result.message);
      }
      case "search_it_knowledge": {
        const topic = safeTrim(args.topic);
        if (!topic) {
          return formatErrorContent("topic is required");
        }
        const result = await queryWebSearch(topic);
        return formatTextContent(result.message);
      }
      case "search_sgroup_knowledge": {
        const query = safeTrim(args.query);
        if (!query) {
          return formatErrorContent("query is required");
        }

        const aiTeamResults = searchKnowledge("ai-team", query);
        const sgroupResults = searchKnowledge("sgroup", query);
        const text = [
          "AI Team:\n" + buildKnowledgeSummary(aiTeamResults),
          "SGroup:\n" + buildKnowledgeSummary(sgroupResults)
        ].join("\n\n");

        return formatTextContent(text);
      }
      case "run_sgroup_assistant": {
        const message = safeTrim(args.message);
        if (!message) {
          return formatErrorContent("message is required");
        }

        const sessionId = safeTrim(args.sessionId) || randomUUID();
        const payload = await invokeAssistantGraph({ message, channel: "mcp", sessionId });
        const toolNames = payload.response?.mcp?.toolNames ?? [];
        const text = [
          `Route: ${payload.route.intent}`,
          `Agent: ${payload.route.agent}`,
          toolNames.length ? `Tools: ${toolNames.join(", ")}` : "Tools: none",
          `Session: ${sessionId}`,
          "",
          payload.response.message
        ].join("\n");

        return formatTextContent(text);
      }
      default:
        return formatErrorContent(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return formatErrorContent(error?.message ?? "Tool execution failed");
  }
}

export async function handleReadResource(uri) {
  switch (uri) {
    case "sgroup://knowledge/ai-team": {
      const records = searchKnowledge("ai-team", "AI Team");
      return {
        contents: [{ uri, mimeType: "text/plain", text: buildKnowledgeSummary(records) }]
      };
    }
    case "sgroup://knowledge/sgroup-overview": {
      const records = searchKnowledge("sgroup", "SGroup");
      return {
        contents: [{ uri, mimeType: "text/plain", text: buildKnowledgeSummary(records) }]
      };
    }
    default:
      return formatErrorContent(`Resource not found: ${uri}`);
  }
}

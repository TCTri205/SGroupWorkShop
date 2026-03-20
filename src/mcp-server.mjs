import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { TOOLS, RESOURCES, executeTool, handleReadResource } from "./lib/mcp-runtime.mjs";

export const PROMPTS = [
  {
    name: "tom-tat-du-an-sgroup",
    description: "Tom tat cac du an AI Team va SGroup hien tai",
    arguments: []
  },
  {
    name: "bao-cao-sang-nay",
    description: "Bao cao thoi tiet va diem tin cong nghe sang nay",
    arguments: [
      {
        name: "city",
        description: "Ten thanh pho can xem thoi tiet (mac dinh: Ha Noi)",
        required: false
      }
    ]
  },
  {
    name: "tra-cuu-kien-thuc-it",
    description: "Tra cuu kien thuc IT tu nguon tai lieu tin cay",
    arguments: [
      {
        name: "topic",
        description: "Chu de cong nghe can tra cuu",
        required: true
      }
    ]
  },
  {
    name: "tom-tat-ai-team",
    description: "Tom tat cau truc AI Team tu resource noi bo",
    arguments: []
  },
  {
    name: "tom-tat-sgroup-overview",
    description: "Tom tat thong tin tong quan ve SGroup tu resource noi bo",
    arguments: []
  },
  {
    name: "nghien-cuu-chu-de-noi-bo",
    description: "Tong hop nghien cuu chu de cong nghe va lien he voi tri thuc noi bo",
    arguments: [
      {
        name: "topic",
        description: "Chu de cong nghe can nghien cuu",
        required: true
      }
    ]
  },
  {
    name: "hoi-dap-da-buoc-sgroup",
    description: "Chay tro ly LangGraph cho cau hoi tong hop hoac da buoc",
    arguments: [
      {
        name: "message",
        description: "Cau hoi tong hop cua nguoi dung",
        required: true
      }
    ]
  }
];

export function getPromptMessages(name, args) {
  switch (name) {
    case "tom-tat-du-an-sgroup":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: "Hay su dung tool search_sgroup_knowledge de tim kiem thong tin ve cac du an va module cua AI Team SGroup. Sau do tom tat ngan gon: muc tieu tong the, cac module chinh dang phat trien, va trang thai hien tai cua tung module."
          }
        }
      ];

    case "bao-cao-sang-nay": {
      const city = String(args?.city ?? "").trim() || "Ha Noi";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hay thuc hien theo thu tu:\n1. Dung tool get_weather voi location="${city}" de lay thoi tiet buoi sang.\n2. Dung tool get_news voi category="cong-nghe" de lay diem tin cong nghe moi nhat.\nSau do trinh bay ket qua thanh ban bao cao buoi sang gon gang, de doc.`
          }
        }
      ];
    }

    case "tra-cuu-kien-thuc-it": {
      const topic = String(args?.topic ?? "").trim() || "JavaScript async await";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hay dung tool search_it_knowledge voi topic="${topic}" de tra cuu thong tin tu nguon tai lieu tin cay. Sau do tom tat ngan gon cac khai niem chinh, best practices quan trong, va liet ke nguon doc them.`
          }
        }
      ];
    }

    case "tom-tat-ai-team":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: "Hay doc resource sgroup://knowledge/ai-team, sau do tom tat cau truc AI Team, cac du an chinh, cac module dang phat trien, va moi lien he giua chung thanh mot ban tong quan ngan gon."
          }
        }
      ];

    case "tom-tat-sgroup-overview":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: "Hay doc resource sgroup://knowledge/sgroup-overview, sau do tom tat lich su, su menh, tam nhin, va cac diem noi bat quan trong cua SGroup thanh mot ban gioi thieu ngan gon."
          }
        }
      ];

    case "nghien-cuu-chu-de-noi-bo": {
      const topic = String(args?.topic ?? "").trim() || "AI chatbot";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hay thuc hien theo thu tu:\n1. Dung tool search_it_knowledge voi topic="${topic}" de lay tong quan ky thuat va nguon tham khao ben ngoai.\n2. Dung tool search_sgroup_knowledge de tim cac du an, module, hoac thanh phan noi bo lien quan den "${topic}".\n3. Tong hop thanh mot ban nghien cuu ngan gon gom: tong quan ky thuat, lien he voi he thong noi bo, co hoi ap dung, va danh sach nguon tham khao.`
          }
        }
      ];
    }

    case "hoi-dap-da-buoc-sgroup": {
      const message = String(args?.message ?? "").trim() || "MCP co the ap dung cho chatbot noi bo cua SGroup khong?";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hay dung tool run_sgroup_assistant voi message="${message}" de route, goi capability phu hop va tong hop cau tra loi cuoi cung.`
          }
        }
      ];
    }

    default:
      throw new Error(`Prompt khong ton tai: ${name}`);
  }
}

function createPromptErrorMessages(message) {
  return [
    {
      role: "assistant",
      content: {
        type: "text",
        text: `Error: ${message}`
      }
    }
  ];
}

const server = new Server(
  {
    name: "sgroup-mcp-server",
    version: "2.0.0"
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    return await executeTool(name, args);
  } catch (error) {
    console.error("[mcp-server] Tool execution error:", error);
    return {
      content: [{ type: "text", text: "Error: Tool execution failed" }],
      isError: true
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    const { uri } = request.params;
    return await handleReadResource(uri);
  } catch (error) {
    console.error("[mcp-server] Resource read error:", error);
    return {
      content: [{ type: "text", text: "Error: Resource read failed" }],
      isError: true
    };
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: PROMPTS };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const messages = getPromptMessages(name, args);
    return { messages };
  } catch (error) {
    console.error("[mcp-server] Prompt error:", error);
    return {
      messages: createPromptErrorMessages("Prompt failed")
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SGroup MCP Server running on stdio");
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

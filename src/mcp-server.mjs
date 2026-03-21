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
import { initializeClients } from "./lib/mcp-client-manager.mjs";

export const PROMPTS = [
  {
    name: "tom-tat-du-an-sgroup",
    description: "Tóm tắt các dự án AI Team và SGroup hiện tại",
    arguments: []
  },
  {
    name: "bao-cao-sang-nay",
    description: "Báo cáo thời tiết và điểm tin công nghệ sáng nay",
    arguments: [
      {
        name: "city",
        description: "Tên thành phố cần xem thời tiết (mặc định: Hà Nội)",
        required: false
      }
    ]
  },
  {
    name: "tra-cuu-kien-thuc-it",
    description: "Tra cứu kiến thức IT từ nguồn tài liệu tin cậy",
    arguments: [
      {
        name: "topic",
        description: "Chủ đề công nghệ cần tra cứu",
        required: true
      }
    ]
  },
  {
    name: "tom-tat-ai-team",
    description: "Tóm tắt cấu trúc AI Team từ resource nội bộ",
    arguments: []
  },
  {
    name: "tom-tat-sgroup-overview",
    description: "Tóm tắt thông tin tổng quan về SGroup từ resource nội bộ",
    arguments: []
  },
  {
    name: "nghien-cuu-chu-de-noi-bo",
    description: "Tổng hợp nghiên cứu chủ đề công nghệ và liên hệ với tri thức nội bộ",
    arguments: [
      {
        name: "topic",
        description: "Chủ đề công nghệ cần nghiên cứu",
        required: true
      }
    ]
  },
  {
    name: "hoi-dap-da-buoc-sgroup",
    description: "Chạy trợ lý LangGraph cho câu hỏi tổng hợp hoặc đa bước",
    arguments: [
      {
        name: "message",
        description: "Câu hỏi tổng hợp của người dùng",
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
            text: "Hãy sử dụng tool search_sgroup_knowledge để tìm kiếm thông tin về các dự án và module của AI Team SGroup. Sau đó tóm tắt ngắn gọn: mục tiêu tổng thể, các module chính đang phát triển, và trạng thái hiện tại của từng module."
          }
        }
      ];

    case "bao-cao-sang-nay": {
      const city = String(args?.city ?? "").trim() || "Hà Nội";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hãy thực hiện theo thứ tự:\n1. Dùng tool get_weather với location="${city}" để lấy thời tiết buổi sáng.\n2. Dùng tool get_news với category="cong-nghe" để lấy điểm tin công nghệ mới nhất.\nSau đó trình bày kết quả thành bản báo cáo buổi sáng gọn gàng, dễ đọc.`
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
            text: `Hãy dùng tool search_it_knowledge với topic="${topic}" để tra cứu thông tin từ nguồn tài liệu tin cậy. Sau đó tóm tắt ngắn gọn các khái niệm chính, best practices quan trọng, và liệt kê nguồn đọc thêm.`
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
            text: "Hãy đọc resource sgroup://knowledge/ai-team, sau đó tóm tắt cấu trúc AI Team, các dự án chính, các module đang phát triển, và mối liên hệ giữa chúng thành một bản tổng quan ngắn gọn."
          }
        }
      ];

    case "tom-tat-sgroup-overview":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: "Hãy đọc resource sgroup://knowledge/sgroup-overview, sau đó tóm tắt lịch sử, sứ mệnh, tầm nhìn, và các điểm nổi bật quan trọng của SGroup thành một bản giới thiệu ngắn gọn."
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
            text: `Hãy thực hiện theo thứ tự:\n1. Dùng tool search_it_knowledge với topic="${topic}" để lấy tổng quan kỹ thuật và nguồn tham khảo bên ngoài.\n2. Dùng tool search_sgroup_knowledge để tìm các dự án, module, hoặc thành phần nội bộ liên quan đến "${topic}".\n3. Tổng hợp thành một bản nghiên cứu ngắn gọn gồm: tổng quan kỹ thuật, liên hệ với hệ thống nội bộ, cơ hội áp dụng, và danh sách nguồn tham khảo.`
          }
        }
      ];
    }

    case "hoi-dap-da-buoc-sgroup": {
      const message = String(args?.message ?? "").trim() || "MCP có thể áp dụng cho chatbot nội bộ của SGroup không?";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hãy dùng tool run_sgroup_assistant với message="${message}" để route, gọi capability phù hợp và tổng hợp câu trả lời cuối cùng.`
          }
        }
      ];
    }

    default:
      throw new Error(`Prompt không tồn tại: ${name}`);
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
  await initializeClients();
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

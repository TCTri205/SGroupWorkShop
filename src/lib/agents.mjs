import { searchKnowledge } from "./knowledge.mjs";
import { queryNews, queryWeather, queryWebSearch } from "./providers.mjs";

function formatConfidence(value) {
  return Number(value.toFixed(2));
}

function uniqueCitations(citations = []) {
  const seen = new Set();
  return citations.filter((citation) => {
    const key = `${citation.title}|${citation.url}`;
    if (!citation.url || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildResponse({ message, citations = [], webUrl = "", statusSteps = [], mcp = null }) {
  return {
    message,
    citations: uniqueCitations(citations),
    webUrl,
    statusSteps,
    mcp
  };
}

function buildKnowledgeMarkdown(query, aiTeamResults, sgroupResults) {
  let markdown = `## Tri thuc noi bo lien quan\n\n**Truy van:** ${query}\n\n`;

  if (aiTeamResults.length > 0) {
    markdown += "### AI Team\n";
    aiTeamResults.slice(0, 2).forEach((record, index) => {
      markdown += `${index + 1}. **${record.title}**\n${record.content}\n\n`;
    });
  }

  if (sgroupResults.length > 0) {
    markdown += "### SGroup\n";
    sgroupResults.slice(0, 2).forEach((record, index) => {
      markdown += `${index + 1}. **${record.title}**\n${record.content}\n\n`;
    });
  }

  if (aiTeamResults.length === 0 && sgroupResults.length === 0) {
    markdown += "Chưa tìm thấy bản ghi phù hợp trong kho tri thức nội bộ.";
  }

  return markdown.trim();
}

export async function handleWeatherAgent(args, route) {
  const result = await queryWeather(args.location);
  return buildResponse({
    message: `## Thời tiết hiện tại\n\n${result.message}\n\n[Nguồn tham khảo](${result.webUrl})`,
    citations: result.citations,
    webUrl: result.webUrl,
    statusSteps: [
      "Đã phân loại intent thời tiết.",
      `Đã gọi MCP tool ${route.toolName}.`,
      result.fallbackUsed ? "Đang dùng fallback an toàn do thiếu hoặc lỗi provider." : "Đã lấy dữ liệu từ provider chính."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleNewsAgent(args, route) {
  const result = await queryNews(args);
  return buildResponse({
    message: `## Tin tức mới nhất\n\n${result.message}\n\n[Nguồn tham khảo](${result.webUrl})`,
    citations: result.citations,
    webUrl: result.webUrl,
    statusSteps: [
      "Đã phân loại intent tin tức.",
      `Đã gọi MCP tool ${route.toolName}.`,
      result.fallbackUsed ? "Đang dùng RSS/mock fallback an toàn." : "Đã lấy dữ liệu từ provider chính."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleItAgent(args, route) {
  const result = await queryWebSearch(args.topic);
  return buildResponse({
    message: `## Kiến thức IT\n\n${result.message}\n\n[Nguồn tham khảo](${result.webUrl})`,
    citations: result.citations,
    webUrl: result.webUrl,
    statusSteps: [
      "Đã phân loại intent nghiên cứu IT.",
      `Đã gọi MCP tool ${route.toolName}.`,
      result.fallbackUsed ? "Đang dùng fallback an toàn do chưa cấu hình provider." : "Đã lấy kết quả tìm kiếm từ provider chính."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleSgroupAgent(args, route) {
  const aiTeamResults = searchKnowledge("ai-team", args.query);
  const sgroupResults = searchKnowledge("sgroup", args.query);

  return buildResponse({
    message: buildKnowledgeMarkdown(args.query, aiTeamResults, sgroupResults),
    statusSteps: [
      "Đã phân loại intent tri thức nội bộ.",
      `Đã gọi MCP tool ${route.toolName}.`,
      aiTeamResults.length || sgroupResults.length ? "Đã tổng hợp kết quả từ kho tri thức nội bộ." : "Không có bản ghi khớp, đã trả về kết quả an toàn."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleMixedResearchAgent(args, route) {
  const external = await queryWebSearch(args.topic);
  const aiTeamResults = searchKnowledge("ai-team", args.query);
  const sgroupResults = searchKnowledge("sgroup", args.query);
  const internalSummary = buildKnowledgeMarkdown(args.query, aiTeamResults, sgroupResults);

  return buildResponse({
    message: `## Nghiên cứu tổng hợp\n\n### Tổng quan kỹ thuật\n${external.message}\n\n### Liên hệ hệ thống nội bộ\n${internalSummary}`,
    citations: external.citations,
    webUrl: external.webUrl,
    statusSteps: [
      "Đã phân loại intent nghiên cứu kết hợp.",
      "Đã gọi MCP tool search_it_knowledge.",
      "Đã gọi MCP tool search_sgroup_knowledge.",
      "Đã hợp nhất nguồn bên ngoài và tri thức nội bộ."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleGeneralAgent() {
  return buildResponse({
    message: "Tôi có thể hỗ trợ tri thức SGroup/AI Team, thời tiết, tin tức và nghiên cứu IT. Hãy đặt câu hỏi cụ thể hơn, ví dụ: `giới thiệu AI Team`, `thời tiết Hà Nội`, `tin công nghệ`, hoặc `tìm hiểu MCP`.",
    statusSteps: [
      "Đã phân loại intent tổng quan.",
      "Không cần gọi MCP tool chuyên biệt cho câu hỏi hiện tại."
    ],
    mcp: { toolName: null, confidence: 0.55 }
  });
}

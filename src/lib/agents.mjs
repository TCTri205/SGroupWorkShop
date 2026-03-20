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
    markdown += "Chua tim thay ban ghi phu hop trong kho tri thuc noi bo.";
  }

  return markdown.trim();
}

export async function handleWeatherAgent(args, route) {
  const result = await queryWeather(args.location);
  return buildResponse({
    message: `## Thoi tiet hien tai\n\n${result.message}\n\n[Nguon tham khao](${result.webUrl})`,
    citations: result.citations,
    webUrl: result.webUrl,
    statusSteps: [
      "Da phan loai intent thoi tiet.",
      `Da goi MCP tool ${route.toolName}.`,
      result.fallbackUsed ? "Dang dung fallback an toan do thieu hoac loi provider." : "Da lay du lieu tu provider chinh."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleNewsAgent(args, route) {
  const result = await queryNews(args.category);
  return buildResponse({
    message: `## Tin tuc moi nhat\n\n${result.message}\n\n[Nguon tham khao](${result.webUrl})`,
    citations: result.citations,
    webUrl: result.webUrl,
    statusSteps: [
      "Da phan loai intent tin tuc.",
      `Da goi MCP tool ${route.toolName}.`,
      result.fallbackUsed ? "Dang dung RSS/mock fallback an toan." : "Da lay du lieu tu provider chinh."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleItAgent(args, route) {
  const result = await queryWebSearch(args.topic);
  return buildResponse({
    message: `## Kien thuc IT\n\n${result.message}\n\n[Nguon tham khao](${result.webUrl})`,
    citations: result.citations,
    webUrl: result.webUrl,
    statusSteps: [
      "Da phan loai intent nghien cuu IT.",
      `Da goi MCP tool ${route.toolName}.`,
      result.fallbackUsed ? "Dang dung fallback an toan do chua cau hinh provider." : "Da lay ket qua tim kiem tu provider chinh."
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
      "Da phan loai intent tri thuc noi bo.",
      `Da goi MCP tool ${route.toolName}.`,
      aiTeamResults.length || sgroupResults.length ? "Da tong hop ket qua tu kho tri thuc noi bo." : "Khong co ban ghi khop, da tra ve ket qua an toan."
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
    message: `## Nghien cuu tong hop\n\n### Tong quan ky thuat\n${external.message}\n\n### Lien he he thong noi bo\n${internalSummary}`,
    citations: external.citations,
    webUrl: external.webUrl,
    statusSteps: [
      "Da phan loai intent nghien cuu ket hop.",
      "Da goi MCP tool search_it_knowledge.",
      "Da goi MCP tool search_sgroup_knowledge.",
      "Da hop nhat nguon ben ngoai va tri thuc noi bo."
    ],
    mcp: { toolName: route.toolName, confidence: formatConfidence(route.confidence) }
  });
}

export async function handleGeneralAgent() {
  return buildResponse({
    message: "Toi co the ho tro tri thuc SGroup/AI Team, thoi tiet, tin tuc va nghien cuu IT. Hay dat cau hoi cu the hon, vi du: `gioi thieu AI Team`, `thoi tiet Ha Noi`, `tin cong nghe`, hoac `tim hieu MCP`.",
    statusSteps: [
      "Da phan loai intent tong quan.",
      "Khong can goi MCP tool chuyen biet cho cau hoi hien tai."
    ],
    mcp: { toolName: null, confidence: 0.55 }
  });
}

import { searchKnowledge } from "./knowledge.mjs";
import { queryNews, queryWeather, queryWebSearch } from "./providers.mjs";
import fs from "node:fs/promises";
import path from "node:path";

function uniqueCitations(citations = []) {
  const seen = new Set();
  return citations.filter((citation) => {
    if (!citation?.url) {
      return false;
    }
    const key = `${citation.title}|${citation.url}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildInternalItems(domain, records) {
  return records.map((record) => ({
    domain,
    title: record.title,
    summary: record.summary,
    content: record.content,
    module: record.module ?? null
  }));
}

export async function getWeatherRaw(location) {
  const result = await queryWeather(location);
  return {
    kind: "weather",
    summary: result.message,
    items: [],
    citations: uniqueCitations(result.citations),
    webUrl: result.webUrl,
    fallbackUsed: result.fallbackUsed,
    metadata: { location }
  };
}

export async function getNewsRaw(request) {
  const result = await queryNews(request);
  const normalizedRequest = typeof request === "string" ? { category: request } : { ...(request ?? {}) };
  return {
    kind: "news",
    summary: result.message,
    items: [],
    citations: uniqueCitations(result.citations),
    webUrl: result.webUrl,
    fallbackUsed: result.fallbackUsed,
    metadata: normalizedRequest
  };
}

export async function searchItKnowledgeRaw(topic) {
  const result = await queryWebSearch(topic);
  return {
    kind: "it-research",
    summary: result.message,
    items: [],
    citations: uniqueCitations(result.citations),
    webUrl: result.webUrl,
    fallbackUsed: result.fallbackUsed,
    metadata: { topic }
  };
}

export async function searchSgroupKnowledgeRaw(query) {
  const aiTeamResults = searchKnowledge("ai-team", query);
  const sgroupResults = searchKnowledge("sgroup", query);
  const items = [...buildInternalItems("ai-team", aiTeamResults), ...buildInternalItems("sgroup", sgroupResults)];
  const summary =
    items.length > 0
      ? `Dạ, mình tìm thấy ${items.length} bản ghi tri thức nội bộ liên quan đến "${query}".`
      : `Dạ, hiện mình chưa tìm thấy bản ghi tri thức nội bộ nào phù hợp với từ khóa "${query}".`;

  return {
    kind: "sgroup-knowledge",
    summary,
    items,
    citations: [],
    webUrl: "",
    fallbackUsed: false,
    metadata: {
      query,
      counts: {
        aiTeam: aiTeamResults.length,
        sgroup: sgroupResults.length
      }
    }
  };
}

export function collectCitations(results = []) {
  return uniqueCitations(results.flatMap((result) => result.citations ?? []));
}

export function pickPrimaryWebUrl(results = []) {
  return results.find((result) => result.webUrl)?.webUrl ?? "";
}

export function summarizeFallbackUsage(results = []) {
  return results.some((result) => result.fallbackUsed);
}

export async function readProjectDocumentRaw(filename) {
  try {
    const docsDir = path.resolve(process.cwd(), "data", "docs");
    const filePath = path.resolve(docsDir, filename);

    if (!filePath.startsWith(docsDir)) {
      throw new Error(`Invalid access attempt for file: ${filename}`);
    }

    const content = await fs.readFile(filePath, "utf-8");
    return {
      kind: "project-document",
      summary: `Nội dung tài liệu kỹ thuật ${filename}.`,
      items: [content],
      citations: [],
      webUrl: "",
      fallbackUsed: false,
      metadata: { filename }
    };
  } catch (error) {
    throw new Error(`Cannot read project document ${filename}: ${error.message}`);
  }
}

import { searchKnowledge } from "./knowledge.mjs";
import { queryNews, queryWeather, queryWebSearch } from "./providers.mjs";

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

export async function getNewsRaw(category) {
  const result = await queryNews(category);
  return {
    kind: "news",
    summary: result.message,
    items: [],
    citations: uniqueCitations(result.citations),
    webUrl: result.webUrl,
    fallbackUsed: result.fallbackUsed,
    metadata: { category }
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
      ? `Dạ, mình tìm thấy ${items.length} bản ghi trí thức nội bộ liên quan đến "${query}".`
      : `Dạ, hiện mình chưa tìm thấy bản ghi trí thức nội bộ nào phù hợp với từ khóa "${query}".`;

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

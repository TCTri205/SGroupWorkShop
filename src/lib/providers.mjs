import "dotenv/config";
import { cacheGet, cacheSet } from "./cache.mjs";

const WEATHER_TTL = 600;
const NEWS_TTL = 900;
const SEARCH_TTL = 3600;
const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);

const RSS_FEEDS = {
  "cong-nghe": "https://vnexpress.net/rss/so-hoa.rss",
  "kinh-te": "https://vnexpress.net/rss/kinh-doanh.rss",
  "the-thao": "https://vnexpress.net/rss/the-thao.rss",
  "doi-song": "https://vnexpress.net/rss/suc-khoe.rss",
  "tong-hop": "https://vnexpress.net/rss/tin-moi-nhat.rss"
};

const NEWS_CATEGORY_MAP = {
  "cong-nghe": "technology",
  "kinh-te": "business",
  "the-thao": "sports",
  "doi-song": "health",
  "tong-hop": "general"
};

function buildCitation(title, url) {
  return { title, url };
}

function decodeXmlEntities(text = "") {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text = "") {
  return decodeXmlEntities(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRssTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) {
    return null;
  }

  const value = stripHtml(match[1] ?? "");
  return value || null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackResult(message, webUrl, fallbackUsed = true, error) {
  return {
    message,
    citations: webUrl ? [buildCitation("Nguồn tham khảo", webUrl)] : [],
    webUrl: webUrl ?? "",
    fallbackUsed,
    ...(error ? { error } : {})
  };
}

async function fetchNewsFromNewsApi(category, apiKey) {
  const engCategory = NEWS_CATEGORY_MAP[category] ?? "general";
  const url = `https://newsapi.org/v2/top-headlines?category=${engCategory}&language=vi&pageSize=5&apiKey=${apiKey}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`NewsAPI gặp lỗi ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const articles = data.articles ?? [];

  if (articles.length === 0) {
    return {
      message: `Dạ, hiện tại mình không tìm thấy tin tức nào cho danh mục "${category}".`,
      citations: [],
      webUrl: "",
      fallbackUsed: false
    };
  }

  const headlines = articles
    .map((article, index) => `${index + 1}. **[${article.title}](${article.url})** - *${article.source?.name ?? ""}*`)
    .join("\n");

  return {
    message: `Đây là các tin tức mới nhất về chủ đề ${engCategory}:\n\n${headlines}`,
    citations: articles.map((article) => buildCitation(article.title, article.url)),
    webUrl: articles[0]?.url ?? "",
    fallbackUsed: false
  };
}

async function fetchNewsFromRss(category) {
  const feedUrl = RSS_FEEDS[category] ?? RSS_FEEDS["tong-hop"];
  const response = await fetchWithTimeout(feedUrl);

  if (!response.ok) {
    throw new Error(`RSS feed gặp lỗi ${response.status}: ${response.statusText}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, 5)
    .map((match) => {
      const item = match[1];
      return {
        title: extractRssTag(item, "title"),
        url: extractRssTag(item, "link"),
        source: "RSS"
      };
    })
    .filter((item) => item.title && item.url);

  if (items.length === 0) {
    return {
      message: `Dạ, mình không tìm thấy tin tức nào cho danh mục "${category}" từ nguồn RSS.`,
      citations: [],
      webUrl: feedUrl,
      fallbackUsed: true
    };
  }

  const headlines = items
    .map((item, index) => `${index + 1}. **[${item.title}](${item.url})** - *${item.source}*`)
    .join("\n");

  return {
    message: `Cập nhật tin tức mới nhất từ RSS (${category}):\n\n${headlines}`,
    citations: items.map((item) => buildCitation(item.title, item.url)),
    webUrl: items[0]?.url ?? feedUrl,
    fallbackUsed: true
  };
}

export async function queryWeather(location) {
  const cacheKey = `weather:${location.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return {
      message: `[Dữ liệu mẫu] Thời tiết tại ${location}: Trời nắng nhẹ, nhiệt độ khoảng 31°C, độ ẩm 62%. (Lưu ý: Hệ thống chưa cấu hình OPENWEATHER_API_KEY)`,
      citations: [buildCitation("OpenWeatherMap", "https://openweathermap.org/")],
      webUrl: "https://openweathermap.org/",
      fallbackUsed: true
    };
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric&lang=vi`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`OpenWeather API loi ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const desc = data.weather?.[0]?.description ?? "khong ro";
    const temp = data.main?.temp ?? "N/A";
    const humidity = data.main?.humidity ?? "N/A";
    const feelsLike = data.main?.feels_like ?? "N/A";
    const wind = data.wind?.speed ?? "N/A";
    const cityName = data.name ?? location;

    const result = {
      message: `Thông tin thời tiết tại **${cityName}**: ${desc}, nhiệt độ **${temp}°C** (cảm giác thực tế như ${feelsLike}°C), độ ẩm **${humidity}%**, tốc độ gió ${wind} m/s.`,
      citations: [buildCitation(`Thời tiết ${cityName} - OpenWeatherMap`, `https://openweathermap.org/city/${data.id}`)],
      webUrl: `https://openweathermap.org/city/${data.id}`,
      fallbackUsed: false
    };

    cacheSet(cacheKey, result, WEATHER_TTL);
    return result;
  } catch (error) {
    return buildFallbackResult(
      `[Fallback] Rất tiếc, mình không thể lấy dữ liệu thời tiết trực tiếp cho ${location} lúc này.`,
      "https://openweathermap.org/",
      true,
      error?.message
    );
  }
}

export async function queryNews(category) {
  const cacheKey = `news:${category}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.NEWS_API_KEY;
  let result;

  try {
    result = apiKey
      ? await fetchNewsFromNewsApi(category, apiKey)
      : await fetchNewsFromRss(category);
  } catch (primaryError) {
    if (apiKey) {
      try {
        result = await fetchNewsFromRss(category);
      } catch (secondaryError) {
        result = buildFallbackResult(
          `[Fallback] Hiện tại mình không thể lấy tin tức cho danh mục "${category}".`,
          RSS_FEEDS[category] ?? RSS_FEEDS["tong-hop"],
          true,
          secondaryError?.message ?? primaryError?.message
        );
      }
    } else {
      result = buildFallbackResult(
        `[Dữ liệu mẫu] Tin tức về "${category}": Không thể tải RSS feed và hệ thống chưa cấu hình NEWS_API_KEY.`,
        RSS_FEEDS[category] ?? RSS_FEEDS["tong-hop"],
        true,
        primaryError?.message
      );
    }
  }

  cacheSet(cacheKey, result, NEWS_TTL);
  return result;
}

export async function queryWebSearch(query) {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.EXA_API_KEY;
  const googleUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);

  if (!apiKey) {
    return {
      message: `[Dữ liệu mẫu] Kết quả nghiên cứu IT cho "${query}": Hệ thống hiện chưa cấu hình EXA_API_KEY.`,
      citations: [buildCitation("Tìm kiếm Google", googleUrl)],
      webUrl: googleUrl,
      fallbackUsed: true
    };
  }

  try {
    const response = await fetchWithTimeout("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        query,
        type: "auto",
        num_results: 5,
        contents: {
          text: {
            max_characters: 4000
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Exa API loi ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.results ?? [];

    if (results.length === 0) {
      return {
        message: `Dạ, mình không tìm thấy kết quả nào cho truy vấn "${query}".`,
        citations: [],
        webUrl: "",
        fallbackUsed: false
      };
    }

    const items = results
      .map((result, index) => {
        const snippet = String(result.text ?? result.highlights?.join(" ") ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);
        return `${index + 1}. **[${result.title}](${result.url})**\n   ${snippet}${snippet ? "..." : ""}`;
      })
      .join("\n\n");

    const responsePayload = {
      message: `Dưới đây là một số kết quả tìm kiếm IT cho từ khóa **"${query}"**:\n\n${items}`,
      citations: results.map((result) => buildCitation(result.title, result.url)),
      webUrl: results[0]?.url ?? "",
      fallbackUsed: false
    };

    cacheSet(cacheKey, responsePayload, SEARCH_TTL);
    return responsePayload;
  } catch (error) {
    return {
      message: `[Fallback] Dạ, hiện tại mình không thể kết nối tới dịch vụ tìm kiếm để tra cứu "${query}".`,
      citations: [buildCitation("Tìm kiếm Google", googleUrl)],
      webUrl: googleUrl,
      fallbackUsed: true,
      error: error?.message
    };
  }
}
export async function queryOfficialSource(query) {
  const lower = query.toLowerCase();
  const target = lower.includes("facebook")
    ? "https://www.facebook.com/"
    : "https://www.google.com/search?q=SGroup";

  return {
    message: "Hệ thống đang ưu tiên tìm kiếm thông tin từ các nguồn chính thức hoặc công khai của SGroup.",
    citations: [buildCitation("Nguồn chính thức SGroup", target)],
    webUrl: target,
    fallbackUsed: true
  };
}




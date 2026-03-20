# Resources và Providers

Trong ki?n trúc MCP, d? li?u và tri th?c n?i b? c?a SGroup ðóng vai tr? là các **Resources** ho?c ðý?c cung c?p thông qua **Tools**.

## 1. Tri th?c n?i b? (Resources)

H? th?ng b?c l? n?i dung t? hai t?p tri th?c chính:

- **AI Team**: [data/ai-team.json](../data/ai-team.json)
- **SGroup**: [data/sgroup.json](../data/sgroup.json)

### Cõ ch? truy c?p Resource

1. **Direct Read**: Client có th? ð?c toàn b? resource qua URI chu?n hóa (VD: `sgroup://knowledge/ai-team`).
2. **Dynamic Browse**: LLM có th? duy?t qua danh sách module có s?n trong resource ð? hi?u t?ng quan h? th?ng trý?c khi ð?t câu h?i c? th?.

## 2. T?m ki?m thông tin (Search Providers)

Ph?n x? l? logic n?m ? [src/lib/knowledge.mjs](../src/lib/knowledge.mjs):

- Nh?n query t? Tool `search_sgroup_knowledge`.
- Dùng `fuse.js` ð? t?m ki?m m? trên nhi?u trý?ng d? li?u.
- Tr? v? danh sách b?n ghi JSON phù h?p cho Server.
- Server ð?nh d?ng l?i thành `TextContent` cho Client.

## 3. Provider Adapters (External Tools)

File: [src/lib/providers.mjs](../src/lib/providers.mjs)

Các adapter này là ð?ng l?c phía sau các Tools:

- `queryWeather(query)` -> Cung c?p d? li?u cho `get_weather`.
- `queryNews(query)` -> Cung c?p d? li?u cho `get_news`.
- `queryWebSearch(query)` -> Cung c?p d? li?u cho `search_it_knowledge`.

### Tr?ng thái th?c thi hi?n t?i

Các Provider ð? có tích h?p th?t và fallback an toàn:

- `queryWeather`: dùng OpenWeather khi có `OPENWEATHER_API_KEY`, n?u không th? tr? mock có g?n c? `fallbackUsed`.
- `queryNews`: ýu tiên NewsAPI khi có `NEWS_API_KEY`, fallback sang RSS feed n?u thi?u key ho?c NewsAPI l?i.
- `queryWebSearch`: dùng Exa khi có `EXA_API_KEY`, n?u không th? tr? mock có g?n c? `fallbackUsed`.
- Các provider th?i ti?t, tin t?c và t?m ki?m ð?u có In-memory Cache TTL ð? gi?m s? l?n g?i ra ngoài.

## Hý?ng nâng c?p ti?p theo

1. **Manual E2E Verification**: Nghi?m thu b?ng MCP Inspector và Claude Desktop ð? xác minh payload th?c t? và tool chaining.
2. **Observability**: N?u tri?n khai production, b? sung logging có c?u trúc và health-check r? ràng hõn cho các provider bên ngoài.


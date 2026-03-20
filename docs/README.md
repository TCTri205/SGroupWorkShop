# SGroup Documentation

Thý m?c này t?ng h?p tài li?u k? thu?t, ki?n trúc và v?n hành cho h? th?ng SGroup hi?n t?i.

## Tr?ng thái hi?n t?i

| Thành ph?n | Tr?ng thái | Ghi chú |
|---|---|---|
| Web chat server | Active | `src/server.mjs` ph?c v? UI và `POST /api/chat` |
| LangGraph orchestration | Active | `src/lib/langgraph/assistant-graph.mjs` là execution path chính cho assistant flow |
| MCP server | Active | `src/mcp-server.mjs` expose tools, resources, prompts |
| Primitive MCP tools | Active | 5 tools, g?m c? composite assistant tool |
| Resources | Active | 2 resources qua URI `sgroup://` |
| Tests | Active | `npm test` pass 46/46 |

## Danh m?c tài li?u

| File | N?i dung |
|---|---|
| [01-overview.md](./01-overview.md) | T?ng quan s?n ph?m, m?c tiêu và các l?p c?a h? th?ng |
| [02-architecture.md](./02-architecture.md) | Ki?n trúc hi?n t?i: capabilities, LangGraph, web, MCP |
| [03-mcp-tools.md](./03-mcp-tools.md) | Danh sách tools, resources và prompt-capable flows |
| [04-knowledge-and-providers.md](./04-knowledge-and-providers.md) | Knowledge base n?i b? và external providers |
| [05-setup-and-testing.md](./05-setup-and-testing.md) | Cài ð?t, env, ch?y web/MCP, inspector, test |
| [06-data-schemas.md](./06-data-schemas.md) | Data schema cho knowledge records và tool inputs |
| [07-migration-guide.md](./07-migration-guide.md) | L?ch s? migration và tr?ng thái ki?n trúc sau LangGraph |
| [implementation_plan.md](./implementation_plan.md) | M?c tri?n khai ð? hoàn thành và backlog ti?p theo |

## C?u trúc m? ngu?n liên quan

```text
src/
??? mcp-server.mjs
??? server.mjs
??? lib/
    ??? capabilities.mjs
    ??? knowledge.mjs
    ??? mcp-runtime.mjs
    ??? providers.mjs
    ??? router.mjs
    ??? langgraph/
        ??? assistant-graph.mjs
```

## Quick Start

```bash
npm install
npm run start:web
npm run start
npm run inspect
npm test
```

## Ch? s? hi?n t?i

- 5 tools: `search_sgroup_knowledge`, `get_weather`, `get_news`, `search_it_knowledge`, `run_sgroup_assistant`
- 2 resources: `sgroup://knowledge/ai-team`, `sgroup://knowledge/sgroup-overview`
- 7 prompts trong MCP prompt registry
- Web payload g?m `route`, `response`, `graph`

## Ghi chú quan tr?ng

- `src/lib/router.mjs` hi?n là fallback router rule-based, không ph?i orchestration chính.
- `src/lib/agents.mjs` và `src/lib/chat-orchestrator.mjs` c?n trong repo nhýng không c?n là execution path chính.
- N?u thi?u `OPENAI_API_KEY`, assistant graph v?n ch?y b?ng degraded mode an toàn.

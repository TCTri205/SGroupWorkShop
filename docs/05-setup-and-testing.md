# Setup V� Testing

## Y�u c?u

- Node.js 18+
- npm

## C�i �?t dependency

```bash
npm install
```

Dependency runtime hi?n t?i g?m:
- `@modelcontextprotocol/sdk`
- `@langchain/langgraph`
- `@langchain/google-genai`
- `@langchain/core`
- `dotenv`
- `fuse.js`
- `zod`

## Environment variables

1. Copy `.env.example` thnh `.env`
2. i?n cc API key c?n thi?t

### Bi?n mi tr?ng ang dng

- `GOOGLE_API_KEY`: b?t LangGraph route/synthesis b?ng LLM
- `GOOGLE_MODEL`: model dng cho `ChatGoogleGenerativeAI`, m?c ?nh `gemini-1.5-flash`
- `GOOGLE_TIMEOUT_MS`: timeout cho Google calls
- `OPENWEATHER_API_KEY`: b?t provider th?t cho weather
- `NEWS_API_KEY`: b?t NewsAPI; n?u khng c s? fallback sang RSS
- `EXA_API_KEY`: b?t web search th?t cho IT research

## Ch?y h? th?ng

### Web server

```bash
npm run start:web
```

- ph?c v? UI t? `public/`
- chat API ? `POST /api/chat`

### MCP server

```bash
npm run start
```

- ch?y `src/mcp-server.mjs` tr�n stdio
- d�ng cho Claude Desktop, Cursor, MCP Inspector

### Development mode

```bash
npm run dev:web
npm run dev
```

## MCP Inspector

```bash
npm run inspect
```

K? v?ng hi?n t?i:
- th?y 5 tools
- th?y 2 resources
- prompt registry c� 7 prompts
- test ��?c c? primitive tools v� `run_sgroup_assistant`

## Claude Desktop

Th�m v�o `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sgroup-server": {
      "command": "node",
      "args": ["D:/S-GROUP/SGroupWorkShop/src/mcp-server.mjs"]
    }
  }
}
```

## Ki?m th?

```bash
npm test
```

K? v?ng hi?n t?i:
- to�n b? test pass
- s? l�?ng test �ang pass: 46/46

Coverage ch�nh:
- providers
- knowledge search
- MCP runtime
- prompt registry
- shared LangGraph orchestration
- web API contract

## Degraded mode

N?u thi?u `GOOGLE_API_KEY`:
- web chat v `run_sgroup_assistant` v?n ho?t ?ng
- route dng fallback rule-based router
- synthesis dng formatter n?i b?

N?u thi?u provider key ngo�i:
- weather/news/search v?n tr? fallback an to�n theo logic hi?n c�


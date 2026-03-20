# T?ng Quan D? �n

## M?c ti�u

X�y d?ng m?t h? th?ng tr? l? cho SGroup c� th?:
- truy v?n tri th?c n?i b? v? AI Team v� SGroup
- g?i c�c capability b�n ngo�i nh� th?i ti?t, tin t?c, IT search
- ph?c v? �?ng th?i cho web chat UI v� MCP-compatible clients

## M� h?nh hi?n t?i

H? th?ng hi?n t?i kh�ng c?n l� m� h?nh `MCP server + web legacy`.

Ki?n tr�c �ang ch?y g?m 3 l?p r? r�ng:
1. **Capability layer**: truy xu?t knowledge n?i b? v� external providers.
2. **LangGraph orchestration layer**: route intent, plan capability calls, execute, synthesize.
3. **Channel adapters**: web server v� MCP server.

## Th�nh ph?n ch�nh

- **Web server**: `src/server.mjs`
  - ph?c v? static UI trong `public/`
  - nh?n `POST /api/chat`
  - g?i shared assistant graph
- **LangGraph assistant**: `src/lib/langgraph/assistant-graph.mjs`
  - route b?ng Google Gemini structured output n?u c key
  - fallback sang `src/lib/router.mjs` n?u thi?u key ho?c LLM l?i
  - plan capability calls theo intent
  - synthesize k?t qu? cu?i cng cho web/MCP
- **MCP server**: `src/mcp-server.mjs`
  - expose primitive tools/resources/prompts
  - h? tr? c? composite assistant tool `run_sgroup_assistant`

## Multi-agent theo ngh?a hi?n t?i

H? th?ng hi?n t?i l� multi-agent theo h�?ng orchestration c� ki?m so�t:
- `LangGraph` gi? vai tr? supervisor/router c?p ?ng d?ng
- c�c specialist capabilities g?m weather, news, IT research, SGroup knowledge
- `mixed-research` l� flow k?t h?p capability ngo�i + tri th?c n?i b?

��y kh�ng ph?i m� h?nh nhi?u agent h?i tho?i t? do v?i nhau; ��y l� graph-based orchestration v?i capability chuy�n tr�ch.

## Fallback v degraded mode

N?u thi?u `GOOGLE_API_KEY`:
- assistant graph v?n ch?y
- route dng rule-based router
- synthesis dng formatter n?i b?
- provider fallback cho weather/news/search v?n ho?t ?ng nh tr?c

## Public contract hi?n t?i

### Web response

```json
{
  "route": {
    "agent": "news-specialist",
    "intent": "news",
    "confidence": 0.92,
    "reasoningSummary": "..."
  },
  "response": {
    "message": "...",
    "citations": [],
    "webUrl": "https://...",
    "statusSteps": [],
    "mcp": {
      "toolNames": ["get_news"],
      "confidence": 0.92
    }
  },
  "graph": {
    "sessionId": "...",
    "usedFallbackRouter": true,
    "executedNodes": [],
    "toolCalls": [],
    "errors": []
  }
}
```

### MCP inventory

- 5 tools
- 2 resources
- 7 prompts

## Tr?ng th�i repo

- Web flow �ang active v� kh�ng c?n ��?c xem l� legacy.
- MCP flow v?n l� chu?n ch�nh �? t�ch h?p v?i Claude Desktop/Cursor/IDE.
- `src/lib/agents.mjs` v� `src/lib/chat-orchestrator.mjs` l� m? c?, kh�ng ph?i execution path ch�nh.

# Migration Guide

Tài li?u này ghi l?i quá tr?nh chuy?n ki?n trúc t? web router th? công sang shared orchestration b?ng LangGraph, ð?ng th?i gi? MCP làm capability layer chu?n hóa.

## Các giai ðo?n ð? di?n ra

### Giai ðo?n 1: MCP capability layer
- chu?n hóa tools/resources qua `@modelcontextprotocol/sdk`
- expose primitive tools cho weather, news, IT search, SGroup knowledge
- dùng `knowledge.mjs` và `providers.mjs` làm data access layer

### Giai ðo?n 2: Web chat adapter
- b? sung `src/server.mjs` ð? ph?c v? web UI và chat API
- web response ban ð?u dùng router/agents th? công

### Giai ðo?n 3: Shared LangGraph orchestration
- thêm `src/lib/capabilities.mjs` ð? tr? raw structured output dùng chung
- thêm `src/lib/langgraph/assistant-graph.mjs` làm execution path chính cho assistant flow
- web chat chuy?n sang g?i graph tr?c ti?p
- MCP b? sung composite tool `run_sgroup_assistant` ð? dùng chung graph v?i web
- `router.mjs` ðý?c gi? l?i làm fallback router rule-based

## Tr?ng thái hi?n t?i

Ki?n trúc hi?n t?i là:
- `src/server.mjs`: web adapter active
- `src/lib/langgraph/assistant-graph.mjs`: orchestration chính
- `src/mcp-server.mjs`: MCP adapter + tools/resources/prompts
- `src/lib/mcp-runtime.mjs`: formatter và tool dispatch cho MCP
- `src/lib/capabilities.mjs`: shared capability layer

## Nh?ng g? không c?n ðúng

Các nh?n ð?nh sau không c?n phù h?p v?i repo hi?n t?i:
- `server.mjs` là legacy backup
- routing chính n?m hoàn toàn ? MCP client
- HTTP flow ch? là m? c? s?p xóa
- h? th?ng ch? có 4 tools và 6 prompts
- web orchestration chính c?n ði qua `agents.mjs` / `chat-orchestrator.mjs`

## Týõng thích hi?n t?i

### V?n gi? nguyên
- primitive MCP tools c? v?n ho?t ð?ng
- resources `sgroup://knowledge/*` không ð?i
- MCP response contract không ð?i

### Ð? thay ð?i
- web response có thêm `graph`
- `response.mcp.toolName` ð? chuy?n thành `response.mcp.toolNames`
- MCP có thêm tool `run_sgroup_assistant`
- MCP prompt registry tãng t? 6 lên 7 prompt

## Hý?ng cleanup ti?p theo

Các file sau không c?n là execution path chính và có th? d?n d?p ? phase sau:
- `src/lib/agents.mjs`
- `src/lib/chat-orchestrator.mjs`

Tuy nhiên, vi?c t?n t?i các file này hi?n không làm thay ð?i ki?n trúc ðang ch?y; docs c?n ph?n ánh ðúng là chúng không ph?i ðý?ng ch?y chính, thay v? tuyên b? ð? xóa.

# MCP Tools Và Resources

Tài li?u này mô t? inventory MCP hi?n t?i c?a h? th?ng SGroup.

## Danh sách Tools

### 1. `search_sgroup_knowledge`
T?m ki?m tri th?c n?i b? c?a SGroup và AI Team.

- Input: `{ query: string }`
- Output: MCP text response ch?a k?t qu? knowledge search ? d?ng Markdown

### 2. `get_weather`
L?y thông tin th?i ti?t cho m?t ð?a ði?m.

- Input: `{ location: string }`
- Output: MCP text response ch?a tóm t?t th?i ti?t và link tham kh?o

### 3. `get_news`
L?y tin t?c theo ch? ð?.

- Input: `{ category?: "cong-nghe" | "kinh-te" | "the-thao" | "doi-song" | "tong-hop" }`
- Output: MCP text response ch?a headlines và ngu?n tham kh?o

### 4. `search_it_knowledge`
Tra c?u ki?n th?c IT t? ngu?n t?m ki?m ngoài.

- Input: `{ topic: string }`
- Output: MCP text response ch?a tóm t?t, link và ngu?n tham kh?o

### 5. `run_sgroup_assistant`
Tool t?ng h?p ch?y assistant graph dùng chung v?i web.

- Input: `{ message: string, sessionId?: string }`
- Hành vi:
  - route intent
  - plan capability calls
  - execute capabilities
  - synthesize câu tr? l?i cu?i cùng
- Output: MCP text response ch?a:
  - câu tr? l?i cu?i
  - route summary
  - confidence
  - tool trace
  - citations

## Danh sách Resources

### 1. `sgroup://knowledge/ai-team`
JSON resource cho AI Team knowledge base.

### 2. `sgroup://knowledge/sgroup-overview`
JSON resource cho SGroup overview.

## Prompt Registry

H? th?ng hi?n có 7 prompts:
- `tom-tat-du-an-sgroup`
- `bao-cao-sang-nay`
- `tra-cuu-kien-thuc-it`
- `tom-tat-ai-team`
- `tom-tat-sgroup-overview`
- `nghien-cuu-chu-de-noi-bo`
- `hoi-dap-da-buoc-sgroup`

Prompt `hoi-dap-da-buoc-sgroup` ðý?c thêm ð? hý?ng MCP client dùng `run_sgroup_assistant` cho câu h?i ða bý?c ho?c mixed-research.

## Data Contract

M?i MCP tool ð?u tr? theo shape chu?n:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Markdown content..."
    }
  ],
  "isError": false
}
```

## Ghi chú v?n hành

- Primitive tools v?n dùng ðý?c ð?c l?p.
- `run_sgroup_assistant` là l?p orchestration phía trên, không thay th? primitive tools.
- Khi thi?u `OPENAI_API_KEY`, `run_sgroup_assistant` v?n ho?t ð?ng qua fallback router/synthesis n?i b?.

# Add Claude Sonnet 4 Support (and make it default)

_Last updated: 2025-06-29_

This document captures the precise, incremental steps required to introduce Anthropic **Claude Sonnet 4** (`claude-sonnet-4-20250514`) alongside the existing Claude Opus 4 model and make Sonnet the new default.

---
## 1  Database & DTOs

### 1.1 Prisma schema
```prisma
enum LlmModel {
  CLAUDE_SONNET_4  // new default
  CLAUDE_OPUS_4
}

model Task {
  // …existing fields…
  model LlmModel @default(CLAUDE_SONNET_4)
}
```
Run:
```bash
npx prisma migrate dev -n add_llm_model_to_task
```

### 1.2 DTO updates
• `CreateTaskDto` & `UpdateTaskDto` – add optional `model?: 'CLAUDE_SONNET_4' | 'CLAUDE_OPUS_4'` (defaults to Sonnet 4 if omitted).

---
## 2  Service Layer

### 2.1 TasksService
• `create()` now persists `model` when supplied; otherwise uses Prisma default.

### 2.2 AnthropicService
1. Add constant:
   ```ts
   export const SONNET_MODEL = 'claude-sonnet-4-20250514';
   ```
2. Refactor `sendMessage` signature to accept `modelId: string` (optional). If undefined, fall back to Sonnet constant.

### 2.3 AgentProcessor
After obtaining the task record, choose model:
```ts
const modelId = task.model === 'CLAUDE_OPUS_4' ? DEFAULT_MODEL : SONNET_MODEL;
const blocks = await this.anthropicService.sendMessage(messages, modelId, this.abortController.signal);
```

---
## 3  UI (Next.js)

### 3.1 Model picker
`/src/app/page.tsx` (home) and any other entry points:
```tsx
<Select defaultValue="sonnet-4">
  <SelectItem value="sonnet-4">Model: Sonnet 4 (default)</SelectItem>
  <SelectItem value="opus-4">Model: Opus 4</SelectItem>
</Select>
```
Maintain state `model`, and include it in the body sent to `startTask()`.

### 3.2 API helper
`startTask()` → POST `{ description, model }`.

---
## 4  Backend HTTP layer
No changes: controller already forwards body into DTO.

---
## 5  Constants mapping helper
Create `model.utils.ts` under `bytebot-agent/src/anthropic/`:
```ts
export const MODEL_ID_MAP = {
  CLAUDE_SONNET_4: 'claude-sonnet-4-20250514',
  CLAUDE_OPUS_4:   'claude-opus-4-20250514',
} as const;
```
`AnthropicService.sendMessage()` resolves Anthropic ID via this map.

---
## 6  Smoke-test Checklist
1. `pnpm -r dev` (or docker-compose) to rebuild all services.
2. Create a task with default (Sonnet 4). Verify API payload shows `model:"claude-sonnet-4-20250514"`.
3. Create another task selecting Opus 4; verify correct ID.
4. Ensure both tasks run to completion and tool invocations function as before. 
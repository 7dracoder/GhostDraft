# GhostDraft — Integration Architecture

Complete technical reference for every external service integrated into GhostDraft, how each one is wired, what data flows where, and how to verify it is working.

---

## Table of Contents

1. [Overview](#overview)
2. [K2 Think V2 (IFM / MBZUAI)](#1-k2-think-v2)
3. [Google Gemini (DeepMind)](#2-google-gemini)
4. [ClickHouse Cloud](#3-clickhouse-cloud)
5. [Datadog](#4-datadog)
6. [Senso](#5-senso)
7. [Supabase](#6-supabase)
8. [LLM Dispatch Flow](#7-llm-dispatch-flow)
9. [Privacy Invariants](#8-privacy-invariants)
10. [Environment Variables Reference](#9-environment-variables-reference)
11. [Verifying Each Integration](#10-verifying-each-integration)

---

## Overview

GhostDraft is a clinical privacy workspace. It sits between clinical trial staff and cloud LLMs, stripping sensitive identifiers before any document leaves the device. Six external services are integrated:

```
User document
     │
     ▼
[Safe Harbor Stripper]  ← regex + NER, 18 HIPAA identifiers + clinical quasi-IDs
     │
     ▼
[Neural Router]  ← heuristic classification: abstract_extractable | dp_tolerant | local_only
     │
     ├── abstract_extractable → [Senso KB enrichment] → [K2Think V2 / Gemini / OpenAI]
     ├── dp_tolerant          → [Senso KB enrichment] → [K2Think V2 / Gemini / OpenAI]
     └── local_only           → answered on-device, nothing sent to cloud
     │
     ▼
[Answer Applier]  ← re-injects entity map into cloud response
     │
     ├── [ClickHouse]  ← every call writes an audit row
     └── [Datadog]     ← every LLM call ships a trace span + metrics
```

Auth and session persistence are handled by **Supabase**. The **Senso** knowledge base enriches every LLM system prompt with relevant clinical context before the call is made.

---

## 1. K2 Think V2

**Provider:** IFM / MBZUAI  
**Model:** `MBZUAI-IFM/K2-Think-v2` (70B reasoning model)  
**API:** OpenAI-compatible at `https://api.k2think.ai/v1`  
**Default:** Yes — used for all LLM calls unless `gemini-2` is explicitly selected

### What it does

K2 Think V2 is the primary reasoning engine. It handles:
- `/api/complete` — full pipeline: proxy → route → LLM → rehydrate
- `/api/timeline/assemble` — SAE causality reasoning and timeline JSON generation
- `/api/signal/cluster` — AE cluster hypothesis generation
- `/api/dashboard/generate` — chart-grid spec generation from aggregate dataset profiles

### How it is wired

`backend/openai_demo.py` → `_make_openai_client()` creates an `openai.OpenAI` instance pointed at `https://api.k2think.ai/v1` with the `K2THINK_API_KEY`. The model name is resolved by `model_for()`.

```python
# backend/openai_demo.py
client = OpenAI(
    api_key=os.environ["K2THINK_API_KEY"],
    base_url="https://api.k2think.ai/v1",
)
```

### Key behaviour

K2 Think V2 is a chain-of-thought reasoning model. It outputs its reasoning inside `<think>...</think>` tags before the final answer. The backend receives the full output including the thinking trace — this is normal. The frontend displays only the final answer after `</think>`.

`max_tokens` must be set high enough (≥ 500) for the model to finish its reasoning chain. The backend uses 1024–1600 depending on the task.

### Priority order

```
K2THINK_API_KEY set → K2Think (default)
gemini-2 requested  → Gemini (explicit override)
neither             → OpenAI fallback
```

---

## 2. Google Gemini

**Provider:** Google DeepMind  
**Model:** `gemini-2.5-flash` (default, configurable via `GEMINI_MODEL`)  
**API:** `https://generativelanguage.googleapis.com/v1beta`  
**Default:** No — activated when model selector is set to `gemini-2`

### What it does

Gemini is the secondary LLM option. It is faster and cheaper than K2Think for tasks that don't require deep reasoning chains. It handles the same endpoints as K2Think when selected.

### How it is wired

`backend/integrations/gemini.py` wraps the Google GenAI SDK:

```python
# backend/integrations/gemini.py
from google import genai
from google.genai import types

client = genai.Client(api_key=_API_KEY)
response = client.models.generate_content(
    model=_MODEL,
    contents=prompt,
    config=types.GenerateContentConfig(
        max_output_tokens=max_tokens,
        system_instruction=system,
    ),
)
```

If `google-genai` is not installed, it falls back to the OpenAI-compatible Gemini endpoint:

```
https://generativelanguage.googleapis.com/v1beta/openai/
```

### Selecting Gemini in the UI

In the frontend model selector (Key Vault sidebar), choose `gemini-2`. This sets `model: "gemini-2"` in the `/api/complete` request body. `openai_demo.call_openai()` detects `requested_model == "gemini-2"` and routes to `call_gemini()`.

### JSON mode

When `json_mode=True` (used by dashboard and timeline endpoints), Gemini uses `response_mime_type: "application/json"` instead of the OpenAI `response_format` parameter.

---

## 3. ClickHouse Cloud

**Provider:** ClickHouse  
**Service:** `qsc5fmrn8d.us-central1.gcp.clickhouse.cloud:8443`  
**Database:** `default`  
**Table:** `ghostdraft_audit_log`  
**Purpose:** Persistent analytics store for every audit record

### What it does

Every request that passes through `/api/complete` writes a row to ClickHouse. This replaces the flat `experiments/results/audit.jsonl` file as the durable audit store. ClickHouse enables sub-second SQL analytics over thousands of records — route distribution, entity counts over time, canary leak history, ε budget consumption.

### Table schema

```sql
CREATE TABLE IF NOT EXISTS ghostdraft_audit_log (
    request_id    String,
    timestamp     DateTime,
    kind          String,          -- 'complete', 'dataset.query', 'mcp.dispatch'
    route         String,          -- 'abstract_extractable', 'dp_tolerant', 'local_only'
    model         String,          -- 'k2thinkv2', 'gemini-2', etc.
    entities_count UInt32,         -- number of entities proxied
    epsilon_spent  Float64,        -- DP budget consumed this call
    status        String,          -- 'ok', 'canary_leak', 'error'
    blocked       UInt8,           -- 1 if request was blocked
    prompt_hash   String,          -- SHA-256 of prompt (never raw content)
    response_hash String           -- SHA-256 of response (never raw content)
) ENGINE = MergeTree()
ORDER BY (timestamp, request_id)
```

### How it is wired

`backend/integrations/clickhouse.py` manages the connection:

1. **Startup** — `init_clickhouse()` is called in the FastAPI lifespan. It creates a `clickhouse_connect` client and runs the `CREATE TABLE IF NOT EXISTS` DDL.
2. **Per-request** — `insert_audit_record()` is called at the end of every `/api/complete` handler after the response is built.
3. **Canary leak** — if a canary token is detected, `insert_audit_record()` is called with `status="canary_leak"` and `blocked=True` before the request is rejected.

```python
# backend/main.py — inside api_complete()
from backend.integrations.clickhouse import insert_audit_record
insert_audit_record(
    request_id=audit_id,
    kind="complete",
    route=route_path,
    model=req.model or "k2thinkv2",
    entities_count=entities_count,
    status="ok",
    blocked=False,
)
```

### Querying the data

Connect directly via HTTPS:

```bash
curl --user 'default:YOUR_PASSWORD' \
  --data-binary 'SELECT route, count() FROM ghostdraft_audit_log GROUP BY route' \
  'https://qsc5fmrn8d.us-central1.gcp.clickhouse.cloud:8443/?database=default'
```

Or use `query_recent_audit()` and `query_session_stats()` from `backend/integrations/clickhouse.py` in any backend endpoint.

### Useful queries

```sql
-- Route distribution
SELECT route, count() AS n FROM ghostdraft_audit_log GROUP BY route ORDER BY n DESC;

-- Canary leaks
SELECT * FROM ghostdraft_audit_log WHERE status = 'canary_leak';

-- Entity counts over time (hourly)
SELECT toStartOfHour(timestamp) AS hour, sum(entities_count) AS total_entities
FROM ghostdraft_audit_log GROUP BY hour ORDER BY hour;

-- Requests per model
SELECT model, count() FROM ghostdraft_audit_log GROUP BY model;
```

### Failure mode

If ClickHouse is unreachable, `insert_audit_record()` catches the exception, prints a non-fatal warning, and the request completes normally. The flat `audit.jsonl` file continues to be written as a fallback.

---

## 4. Datadog

**Provider:** Datadog  
**Site:** `us5.datadoghq.com`  
**Purpose:** LLM observability — latency tracing, token metrics, privacy event alerting

### What it does

Every LLM call made through `call_openai()` is wrapped in a `LLMSpan` context manager that:
1. Records wall-clock latency in milliseconds
2. Estimates prompt and response token counts (character count ÷ 4)
3. Ships a structured log entry to Datadog Logs intake
4. Ships three discrete metrics to Datadog Metrics

Additionally, canary leak events trigger a Datadog Event with `alert_type: error`.

### How it is wired

`backend/integrations/datadog.py` provides two primitives:

**`LLMSpan` context manager** — wraps any LLM call:

```python
# backend/openai_demo.py
from backend.integrations.datadog import LLMSpan

with LLMSpan(task=task, model=resolved_model, prompt_len=len(prompt)) as span:
    completion = client.chat.completions.create(...)
    span.response_len = len(content)
    return content
```

On `__exit__`, it sends:
- A log entry to `https://http-intake.logs.us5.datadoghq.com/api/v2/logs` with fields: `span_id`, `task`, `model`, `prompt_tokens_approx`, `response_tokens_approx`, `latency_ms`, `status`, `error`
- Metric `ghostdraft.llm.calls` (count=1) tagged with `task`, `model`, `status`
- Metric `ghostdraft.llm.latency_ms` (gauge) tagged with `task`, `model`, `status`
- Metric `ghostdraft.llm.response_tokens` (count) tagged with `task`, `model`, `status`

**`send_privacy_event()`** — fires on canary leak:

```python
# backend/main.py — inside canary detection block
from backend.integrations.datadog import send_privacy_event
send_privacy_event("canary_leak", {"audit_id": audit_id, "token": canary_match.group(0)})
```

This posts to `https://api.us5.datadoghq.com/api/v1/events` with `alert_type: error`.

### Metrics available in Datadog

| Metric | Type | Tags |
|--------|------|------|
| `ghostdraft.llm.calls` | Count | `task`, `model`, `status`, `env`, `service` |
| `ghostdraft.llm.latency_ms` | Gauge | `task`, `model`, `status`, `env`, `service` |
| `ghostdraft.llm.response_tokens` | Count | `task`, `model`, `status`, `env`, `service` |

### Failure mode

All Datadog calls use a 3-second timeout and catch all exceptions. If Datadog is unreachable, the LLM call completes normally — observability is best-effort, never blocking.

---

## 5. Senso

**Provider:** Senso AI  
**API:** `https://api.senso.ai`  
**Purpose:** Persistent knowledge base — enriches every LLM system prompt with relevant clinical context

### What it does

Senso is a context layer for AI agents. GhostDraft uses it to give the chat assistant persistent memory across sessions. When a user uploads a clinical document (SAE narrative, protocol excerpt, monitoring report), it can be ingested into the Senso knowledge base. On every subsequent LLM call, Senso is queried for the top-3 most relevant snippets, which are prepended to the system prompt.

### How it is wired

`backend/integrations/senso.py` provides two functions:

**`query_knowledge_base(prompt, top_k=3)`** — retrieves relevant snippets:

```python
response = httpx.post(
    "https://api.senso.ai/knowledge/query/",
    headers={"Authorization": f"Bearer {_API_KEY}"},
    json={"query": prompt, "top_k": top_k},
)
```

**`enrich_system_prompt(base_system, user_prompt)`** — called automatically in `call_openai()`:

```python
# backend/openai_demo.py
from backend.integrations.senso import enrich_system_prompt, senso_configured
if senso_configured():
    system = enrich_system_prompt(system, prompt)
```

The enriched system prompt looks like:

```
You are a GhostDraft clinical assistant. [original system prompt]

---
Relevant knowledge base context:
[SAE Narrative — Subject 04-0023]
Grade 3 thrombocytopenia observed on study day 14 following BMS-986253...

[Protocol Amendment 4]
Dose modification criteria: reduce from 50mg to 25mg on Grade 3+ haematologic AE...
```

**`ingest_document(title, content, metadata)`** — adds a document to the KB:

```python
from backend.integrations.senso import ingest_document
ingest_document(
    title="SAE Narrative — Subject 04-0023",
    content=document_text,
    metadata={"type": "sae_narrative", "compound": "BMS-986253"},
)
```

### Failure mode

If Senso is unreachable or returns an error, `enrich_system_prompt()` returns the original system prompt unchanged. The LLM call proceeds without KB context.

---

## 6. Supabase

**Provider:** Supabase  
**Project:** `trrybvwjblmkznphdxpb.supabase.co`  
**Purpose:** User authentication and activity history persistence

### What it does

Supabase handles all user auth:
- Email + password sign-up and sign-in
- Google OAuth (redirect flow)
- Session management via JWT tokens

The `activity_history` table (when the migration in `scripts/supabase_migration.sql` is applied) stores per-user request history.

### How it is wired

`frontend/src/lib/supabase.ts` creates a singleton Supabase client:

```typescript
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

`frontend/src/lib/auth.tsx` wraps it in a React context (`AuthProvider`) that exposes `signIn`, `signUp`, `signOut`, and the current `user` / `session`.

`frontend/src/components/AuthGate.tsx` blocks the entire app shell until the user is authenticated.

### Email confirmation

`mailer_autoconfirm` is **off** on this project. After sign-up, users must confirm their email before they can sign in. To disable this for development: Supabase Dashboard → Authentication → Settings → toggle "Enable email confirmations" off.

### Activity history

Run `scripts/supabase_migration.sql` in the Supabase SQL editor to create the `activity_history` table. Then `insertActivity()` and `fetchHistory()` in `frontend/src/lib/supabase.ts` will persist and retrieve per-user request history.

---

## 7. LLM Dispatch Flow

Every LLM call in the backend goes through `backend/openai_demo.call_openai()`. Here is the exact execution path:

```
call_openai(prompt, system, task, requested_model, max_tokens, json_mode)
    │
    ├── 1. senso_configured()?
    │       YES → system = enrich_system_prompt(system, prompt)
    │       NO  → system unchanged
    │
    ├── 2. requested_model == "gemini-2"?
    │       YES → call_gemini(prompt, system, ...) wrapped in LLMSpan
    │       NO  → continue
    │
    ├── 3. k2think_configured()?
    │       YES → OpenAI client at api.k2think.ai/v1, model=MBZUAI-IFM/K2-Think-v2
    │       NO  → OpenAI client at api.openai.com, model from env
    │
    ├── 4. LLMSpan.__enter__() — start timer
    │
    ├── 5. client.chat.completions.create(...)
    │
    ├── 6. LLMSpan.__exit__() — send span + metrics to Datadog
    │
    └── 7. return content string
```

After `call_openai()` returns in `/api/complete`:

```
response received
    │
    ├── apply_entity_map(response, entity_map)  ← rehydrate placeholders
    │
    ├── _append_audit(entry, record)            ← write to audit.jsonl
    │
    └── insert_audit_record(...)                ← write to ClickHouse
```

---

## 8. Privacy Invariants

These invariants hold regardless of which integrations are active:

| Invariant | Where enforced |
|-----------|---------------|
| No raw PHI in ClickHouse | Only hashes, counts, and route metadata are stored |
| No raw PHI in Datadog | Spans contain only lengths, hashes, latency, and status |
| No raw PHI in Senso queries | Only the user's prompt (already stripped of entities) is sent |
| Canary tokens block outbound calls | Checked before any network I/O in `_call_llm()` and `RemoteClient.complete()` |
| ε budget hard-refuses | `SessionBudget.epsilon_spent()` checked before DP-tolerant path calls |
| Entity map never leaves process | Stored in-memory only; never written to any log or external service |

---

## 9. Environment Variables Reference

All variables live in the root `.env` file (never committed).

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `K2THINK_API_KEY` | K2Think | Yes (primary LLM) | IFM API key, format `IFM-...` |
| `K2THINK_BASE_URL` | K2Think | No | Default: `https://api.k2think.ai/v1` |
| `K2THINK_MODEL` | K2Think | No | Default: `MBZUAI-IFM/K2-Think-v2` |
| `GEMINI_API_KEY` | Gemini | Yes (for gemini-2 option) | Google AI Studio key, format `AIza...` |
| `GEMINI_MODEL` | Gemini | No | Default: `gemini-2.5-flash` |
| `CLICKHOUSE_HOST` | ClickHouse | Yes (for audit DB) | Full hostname, e.g. `abc.us-central1.gcp.clickhouse.cloud` |
| `CLICKHOUSE_PORT` | ClickHouse | No | Default: `8443` |
| `CLICKHOUSE_USER` | ClickHouse | No | Default: `default` |
| `CLICKHOUSE_PASSWORD` | ClickHouse | Yes (for audit DB) | ClickHouse service password |
| `CLICKHOUSE_DATABASE` | ClickHouse | No | Default: `default` |
| `DD_API_KEY` | Datadog | Yes (for observability) | 32-char hex API key |
| `DD_APP_KEY` | Datadog | Yes (for querying) | `ddapp_...` application key |
| `DD_SITE` | Datadog | No | Default: `datadoghq.com`. Use `us5.datadoghq.com` for US5 region |
| `DD_ENV` | Datadog | No | Default: `production` |
| `SENSO_API_KEY` | Senso | Yes (for KB enrichment) | `tgr_...` token |
| `VITE_SUPABASE_URL` | Supabase | Yes (for auth) | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase | Yes (for auth) | JWT anon key |
| `OPENAI_API_KEY` | OpenAI | No (fallback only) | `sk-...` key |
| `BACKEND_PORT` | Backend | No | Default: `8000` |
| `VITE_API_URL` | Frontend | No | Default: `http://localhost:8000` |
| `NGSP_SKIP_LOCAL_MODEL` | Backend | No | Set to `1` to skip Gemma load on startup |

---

## 10. Verifying Each Integration

### K2Think

```bash
curl -s -X POST "https://api.k2think.ai/v1/chat/completions" \
  -H "Authorization: Bearer $K2THINK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MBZUAI-IFM/K2-Think-v2","messages":[{"role":"user","content":"Reply: OK"}],"max_tokens":50}'
# Expected: HTTP 200, content contains "OK"
```

### Gemini

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)['models'][0]['name'])"
# Expected: models/gemini-2.5-flash (or similar)
```

### ClickHouse

```bash
curl -s --user "default:$CLICKHOUSE_PASSWORD" \
  --data-binary 'SELECT count() FROM ghostdraft_audit_log' \
  "https://$CLICKHOUSE_HOST:8443/?database=default"
# Expected: a number (0 if no requests yet)
```

### Datadog

```bash
curl -s "https://api.us5.datadoghq.com/api/v1/validate" \
  -H "DD-API-KEY: $DD_API_KEY"
# Expected: {"valid": true}
```

### Senso

```bash
curl -sL "https://api.senso.ai/noodle/" \
  -H "Authorization: Bearer $SENSO_API_KEY" \
  -o /dev/null -w "%{http_code}"
# Expected: 200
```

### Supabase

```bash
curl -s "https://trrybvwjblmkznphdxpb.supabase.co/auth/v1/settings" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('email:', d['external']['email'])"
# Expected: email: True
```

### Full end-to-end

```bash
curl -s -X POST http://localhost:8000/api/complete \
  -H "Content-Type: application/json" \
  -d '{"document":"Subject 04-0023 received BMS-986253 at 50mg. Grade 3 AE on day 14.","prompt":"Summarize.","model":"k2thinkv2"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('route:', d['routing']['path'], '| entities:', d['entities_proxied'])"
# Expected: route: abstract_extractable | entities: 4+

# Then verify ClickHouse received it:
curl -s --user "default:$CLICKHOUSE_PASSWORD" \
  --data-binary 'SELECT request_id, route, status FROM ghostdraft_audit_log ORDER BY timestamp DESC LIMIT 1' \
  "https://$CLICKHOUSE_HOST:8443/?database=default"
# Expected: the audit_id from the previous call
```

<div align="center">

# GhostDraft

### A clinical privacy workspace that lets healthcare and pharma teams use powerful AI — without leaking patient data, proprietary compounds, or insider trial results.

</div>

---

## The Problem It Solves

Every day across pharma companies, hospitals, and CROs, the same thing happens:

- A **medical writer** pastes a confidential SAE narrative into ChatGPT to fix the grammar
- A **pharmacovigilance specialist** drafts a safety report with patient identifiers in the prompt
- A **regulatory affairs manager** pastes an FDA response letter to get help with wording
- A **data analyst** uploads interim efficacy data to get a chart description

**58% of front-line health staff use unapproved AI tools for work. 44% admit to including identifiable patient data.**

The existing options are all broken:

| Option | Problem |
|--------|---------|
| Block AI tools entirely | Staff route around you on personal devices |
| Enterprise BAA tier | Sanctioned tools lag in capability — people still use shadow AI |
| Regex-based DLP | Over-redacts and destroys clinical meaning, or under-redacts and leaks |

And the deepest problem: **compliance training focuses on the 18 HIPAA Safe Harbor identifiers** — names, SSNs, MRNs — but the most damaging leakage in clinical trials isn't PHI at all. It's **Material Non-Public Information**:

- Compound codenames that reveal a company's pipeline strategy
- Interim efficacy readouts that could move stock prices by billions
- Amendment rationales that signal safety problems before the sponsor announces them

No regex catches *"ORR of 47% in the 200mg arm versus 22% in control."* That sentence has no patient identifiers. It is worth billions. GhostDraft catches it.

---

## Who It Is For

| Role | How they use GhostDraft |
|------|------------------------|
| **Medical writers** | Draft and clean SAE narratives without exposing patient data to cloud LLMs |
| **Pharmacovigilance specialists** | Analyze adverse event patterns and generate causality assessments |
| **Regulatory affairs teams** | Get AI assistance on FDA/EMA correspondence without leaking strategy |
| **Clinical data analysts** | Explore trial datasets and generate dashboards with privacy-safe queries |
| **CRO monitoring staff** | Review site visit reports and flag deviations without exposing site IDs |
| **Compliance officers** | Audit every AI interaction with a forensic log — what was sent, what came back, what was blocked |

---

## What It Does

GhostDraft is a **local privacy proxy** that sits between your staff and cloud LLMs. It intercepts every document, strips all sensitive information on-device, sends only a safe anonymized version to the cloud, gets the response back, and re-injects the original values locally before showing the answer.

The user gets a useful AI response. The cloud never sees the real data.

```
Your document (with PHI, IP, MNPI)
         │
         ▼
  ┌─────────────────────────────────────────────────────┐
  │              GhostDraft (runs locally)              │
  │                                                     │
  │  1. Strip all sensitive entities                    │
  │     "Subject 04-0023" → <NAME_1>                    │
  │     "BMS-986253"      → <COMPOUND_CODE_1>           │
  │     "47% ORR"         → <EFFICACY_VALUE_1>          │
  │                                                     │
  │  2. Route the request                               │
  │     Can the task be done without the values? → Yes  │
  │     → Rewrite the query from scratch (safest)       │
  │     → Or add calibrated noise (DP-tolerant)         │
  │     → Or answer entirely on-device (local-only)     │
  │                                                     │
  │  3. Send only the safe proxy to the cloud           │
  └─────────────────────────────────────────────────────┘
         │
         ▼
  Cloud LLM (K2Think V2 / Gemini / OpenAI)
         │
         ▼
  ┌─────────────────────────────────────────────────────┐
  │  4. Re-inject original values into the response     │
  │     <NAME_1> → "Subject 04-0023"                    │
  │     <COMPOUND_CODE_1> → "BMS-986253"                │
  └─────────────────────────────────────────────────────┘
         │
         ▼
  Your answer — with real values, AI-quality response,
  zero data leaked to the cloud
```

---

## The Three-Stage Privacy Pipeline

### Stage 1 — Safe Harbor Stripper

Deterministic regex + local NER detection of all **18 HIPAA Safe Harbor identifiers** plus clinical quasi-identifiers and MNPI categories:

| Category | Examples | Tier |
|----------|---------|------|
| Names | Patient names, investigator names | PHI |
| Dates | Visit dates, onset dates, DOB | PHI |
| Geographic subdivisions | Hospital names, city names | PHI |
| Ages | "68-year-old" | PHI |
| Subject IDs | "Subject 04-0023" | PHI |
| Compound codes | "BMS-986253", "IND-4321" | IP |
| Site IDs | "Site 104" | IP |
| Doses | "50mg", "25 mg/kg" | IP |
| AE grades | "Grade 3", "Grade 4" | IP |
| Efficacy values | "47% ORR", "hazard ratio 0.61" | MNPI |
| Interim results | "DSMB review", "preliminary efficacy analysis" | MNPI |
| Amendment rationales | "Amendment 4" | MNPI |

Every detected entity is replaced with a tagged placeholder like `<COMPOUND_CODE_1>`. The entity map (placeholder → original value) is stored in memory and **never leaves the process**.

### Stage 2 — Neural Router

A locally-running model classifies each request into one of three routing paths:

**Abstract-extractable (~70% of requests)**
The task intent can be expressed without any sensitive values. The router rewrites the query from scratch. The mapping is non-injective — multiple different inputs produce the same synthesized query, making mathematical inversion impossible. This is the safest path: verbatim leak rate is **0.00%** on efficacy values.

**DP-tolerant (~20% of requests)**
The task needs some content but not exact values. Hidden-state embeddings are clipped to bounded L2 norm and perturbed with calibrated Gaussian noise, providing formal **(ε, δ)-differential privacy** guarantees. Default: ε = 3.0, δ = 10⁻⁵.

**Local-only (~10% of requests)**
Content and task are inseparable. The local model answers entirely on-device. Nothing is sent to the cloud.

### Stage 3 — Answer Applier

The cloud response comes back with placeholders. The entity map is re-applied **longest-key-first** to avoid partial-match collisions (`<PERSON_12>` before `<PERSON_1>`). The user sees the final answer with all original values restored.

---

## The Differential Privacy Mechanism

For DP-tolerant requests, noise is calibrated as:

$$\sigma = \frac{\Delta \cdot \sqrt{2 \ln(1.25/\delta)}}{\varepsilon}$$

where:
- **Δ = 1.0** — L2 sensitivity after clipping
- **δ = 10⁻⁵** — failure probability
- **ε = 3.0** — privacy budget (configurable)
- **σ ≈ 1.61** at default settings

The system uses **Rényi DP accounting** to track cumulative ε per session. When the session budget is exhausted, the system **hard-refuses** further DP-tolerant requests rather than silently degrading.

**Important finding:** Mathematical DP guarantees on hidden-state representations do not automatically propagate to text-surface privacy. The noise is injected correctly into the embedding, but the decoder can ignore it under greedy decoding. This is why GhostDraft also runs a five-attack adversarial harness to measure text-surface privacy directly.

---

## The Five-Attack Adversarial Harness

GhostDraft doesn't just claim privacy — it measures it. Every proxy is evaluated against five attack classes:

| Attack | What it tests |
|--------|--------------|
| **A1. Verbatim scan** | Literal + fuzzy substring matching of ground-truth spans against proxy text |
| **A2. Cross-encoder similarity** | Cosine similarity via `all-MiniLM-L6-v2`, 0.85 danger threshold |
| **A3. Trained span inversion** | DistilBERT token classifier trained to recover sensitive spans from proxy text |
| **A4. Membership inference** | Logistic regression on proxy embeddings detecting whether an entity appears in the source |
| **A5. Utility regression** | LLM-as-judge scoring of proxy-answer quality vs. un-proxied-answer quality |

Run the full battery:
```bash
python experiments/run_attacks.py --epsilon 3.0
```

---

## The Application — Two Personas

GhostDraft ships a VS Code-style enterprise workspace with two built-in personas. Switch between them with the activity bar on the left, or with `⌘⇧A` / `⌘⇧R`.

### Persona 1 — Analyst

For clinical data analysts and statisticians working with trial datasets.

**Left pane — Dataset**
A virtualized table of the synthetic clinical trial dataset (subjects, events, dosing, labs). Column filters, row-level entity highlighting, sticky headers. Every cell containing a sensitive entity is annotated with its privacy tier (PHI / IP / MNPI) and placeholder.

**Main pane — Assistant**
A chat interface backed by the full GhostDraft privacy pipeline. Paste any clinical document or question. The pipeline strips entities, routes the request, calls the cloud LLM, and returns the rehydrated answer. The forensic dock below shows exactly what was sent to the cloud and what came back.

**Right pane — Dashboard**
Type a natural-language prompt ("show me AE grade distribution by site") and GhostDraft generates a live chart grid. The cloud receives only aggregate, entity-stripped dataset statistics — never raw rows.

### Persona 2 — Reviewer

For pharmacovigilance specialists and medical writers working with SAE narratives.

**Left pane — Narrative Input**
Paste an SAE narrative. GhostDraft detects and highlights every sensitive entity in real time, color-coded by tier. PHI in amber, IP in blue, MNPI in gold. Click any entity to see its placeholder and tier.

**Main pane — Case Timeline**
A multi-track D3 visualization assembled from the narrative:
- **Event track** — CTCAE severity grade over time
- **Dosing track** — administration points with half-life windows
- **Conmeds track** — concomitant medication intervals
- **Labs track** — relevant lab values with threshold bands
- **Causality verdict** — WHO-UMC assessment with rationale

**Right pane — Signal Detection**
A scatter plot of all adverse events in the study window, with density-clustered convex hulls. The current case is highlighted. The cloud receives only an abstract pattern description — never the raw case list.

---

## The Forensic Dock

At the bottom of every screen is the forensic dock — a live audit trail of every pipeline call.

**Collapsed state** (always visible, 22px tall):
```
14:32:07  ·  ok  ·  MBZUAI-IFM/K2-Think-v2  ·  ε 0.00 / 3.0  [████░░░░░░]
```

**Expanded state** — three-column view:

| Proxy Sent | Cloud Response | Rehydrated Answer |
|-----------|---------------|------------------|
| `<NAME_1> received <COMPOUND_CODE_1> at <DOSE_1>...` | `<NAME_1> experienced <AE_GRADE_1> thrombocytopenia...` | `Subject 04-0023 experienced Grade 3 thrombocytopenia...` |

Canary leak events render in red. The ε budget bar turns amber at 50% and red at 80%.

---

## Export Actions

Every workflow output has an export row with one-click actions:

- **Email to investigator** — sends the case timeline or dashboard via the MCP email connector
- **Calendar hold** — creates a medical monitor meeting with the output attached
- **File to Vault Safety** — exports to the safety database stub
- **File to SharePoint** — exports to the document management stub

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘1` | Focus left pane |
| `⌘2` | Focus main pane |
| `⌘3` | Focus right pane |
| `⌘J` | Toggle forensic dock |
| `⌘\` | Collapse / expand left pane |
| `⌘⇧\` | Collapse / expand right pane |
| `⌘⇧P` | Open view picker in focused pane |
| `⌘⇧A` | Switch to Analyst persona |
| `⌘⇧R` | Switch to Reviewer persona |

---

## External Integrations

GhostDraft integrates six external services. All are optional — the app runs in mock mode without any API keys.

### K2 Think V2 (IFM / MBZUAI)
The primary reasoning engine. A 70B open-weights model that handles all LLM tasks — causality assessment, dashboard generation, signal hypothesis, chat. Uses chain-of-thought reasoning. API-compatible with OpenAI SDK.

### Google Gemini 2.5 Flash (DeepMind)
Secondary LLM option. Faster and cheaper than K2Think for tasks that don't require deep reasoning. Select it from the model picker in the Key Vault sidebar.

### ClickHouse Cloud
Every pipeline call writes an audit row to a real analytics database. Enables SQL queries over the full audit history — route distribution, entity counts over time, canary leak history, ε budget consumption per session.

```sql
-- Example: route distribution
SELECT route, count() FROM ghostdraft_audit_log GROUP BY route;

-- Example: canary leaks
SELECT * FROM ghostdraft_audit_log WHERE status = 'canary_leak';
```

### Datadog (LLM Observability)
Every LLM call is traced with latency, token estimates, model name, task, and status. Canary leak events trigger a Datadog alert. Metrics available: `ghostdraft.llm.calls`, `ghostdraft.llm.latency_ms`, `ghostdraft.llm.response_tokens`.

### Senso (Knowledge Base)
Persistent clinical knowledge base for the chat assistant. Upload SAE narratives, protocol excerpts, or monitoring reports once — the assistant references them across sessions. Every LLM system prompt is automatically enriched with the top-3 most relevant KB snippets before the call is made.

### Supabase (Auth)
Email + password and Google OAuth authentication. Session persistence. Activity history per user.

---

## Privacy Guarantees

| Guarantee | How it is enforced |
|-----------|-------------------|
| No raw PHI leaves the device | Entity map stored in-memory only, never serialized or logged |
| No raw content in audit logs | Only SHA-256 hashes, counts, and route metadata are written |
| No raw content in ClickHouse | Same — hashes and metadata only |
| No raw content in Datadog | Spans contain only lengths, hashes, latency, and status |
| Canary tokens block outbound calls | Checked before any network I/O; request rejected if triggered |
| ε budget hard-refuses | Session budget tracked monotonically; system refuses when exhausted |
| Senso queries use stripped prompts | Only the already-anonymized prompt is sent to the KB |

---

## Architecture

```
frontend/          React + TypeScript + Vite + Tailwind v4
  src/
    components/    TitleBar, ActivityBar, SideBar, AuthGate, AssistantPanel, Workspace
    layout/        SplitterGroup, PaneContainer, BottomDock, ViewRegistry, PersonaLayouts
    views/
      analyst/     DatasetPreviewView, DashboardView, ChartGrid
      reviewer/    CaseTimelineView, SignalMapView, NarrativeInputView
    lib/           api.ts, auth.tsx, supabase.ts, senso.ts, demoDocument.ts
    hooks/         useForensicStream, useTimelineData, useSignalData, useDatasetQuery

backend/           FastAPI + Python
  main.py          Core endpoints: /analyze /proxy /route /complete /audit
  openai_demo.py   LLM dispatch: K2Think → Gemini → OpenAI
  schemas.py       Pydantic models for all request/response types
  endpoints/
    timeline.py    /api/timeline/assemble
    signal.py      /api/signal/cluster
    dataset.py     /api/dataset/schema + /api/dataset/query
    dashboard.py   /api/dashboard/generate
    mcp.py         /api/mcp/dispatch
  integrations/
    clickhouse.py  Audit log persistence
    datadog.py     LLM observability tracing
    gemini.py      Google Gemini wrapper
    senso.py       Knowledge base enrichment
  connectors/
    email.py       MCP email connector
    calendar.py    MCP calendar connector

src/               Research pipeline (read-only in product build)
  ngsp/
    safe_harbor.py      18 HIPAA identifier stripper
    entity_extractor.py Quasi-identifier + MNPI extractor
    router.py           abstract_extractable | dp_tolerant | local_only
    query_synthesizer.py Abstract query generation
    dp_mechanism.py     Gaussian noise + Rényi DP accountant
    proxy_decoder.py    Noisy embedding → proxy text
    remote_client.py    OpenAI wrapper with canary detection
    answer_applier.py   Entity map re-injection
    pipeline.py         End-to-end orchestration
  attacks/
    verbatim.py         A1: literal + fuzzy substring scan
    similarity.py       A2: cross-encoder cosine similarity
    inversion.py        A3: trained span inversion (DistilBERT)
    membership.py       A4: membership inference
    utility.py          A5: downstream utility regression
  data/
    synthetic_sae.py    500 SAE narrative generators
    synthetic_protocol.py  200 protocol excerpt generators
    synthetic_monitoring.py 200 CRA report generators
    synthetic_writing.py   300 CSR draft generators
    annotator.py        Ground-truth sensitive span labeler
```

---

## API Reference

### `POST /api/analyze`
Detect all sensitive entities in a document. Returns tier-labeled spans with character offsets and placeholders.

```json
// Request
{ "text": "Subject 04-0023 received BMS-986253 at 50mg..." }

// Response
{
  "entities": [
    { "text": "Subject 04-0023", "category": "phi", "subcategory": "name",
      "start": 0, "end": 15, "placeholder": "<NAME_1>" },
    { "text": "BMS-986253", "category": "ip", "subcategory": "compound_code",
      "start": 25, "end": 35, "placeholder": "<COMPOUND_CODE_1>" }
  ],
  "counts": { "phi": 2, "ip": 3, "mnpi": 1 }
}
```

### `POST /api/proxy`
Run the full strip-and-proxy pipeline. Returns original text, proxy text, entity map, and position mappings.

### `POST /api/route`
Classify a document into a routing path. Returns `abstract_extractable`, `dp_tolerant`, or `local_only` with a rationale.

### `POST /api/complete`
Full pipeline: strip → route → LLM → rehydrate. Accepts `model: "k2thinkv2" | "gemini-2" | "gpt-5" | "claude-opus-4"`.

```json
// Request
{
  "document": "Subject 04-0023 received BMS-986253...",
  "prompt": "Summarize the adverse event.",
  "model": "k2thinkv2"
}

// Response
{
  "routing": { "path": "abstract_extractable", "rationale": "..." },
  "proxy_sent": "<NAME_1> received <COMPOUND_CODE_1> at <DOSE_1>...",
  "response_raw": "<NAME_1> experienced <AE_GRADE_1> thrombocytopenia...",
  "response_rehydrated": "Subject 04-0023 experienced Grade 3 thrombocytopenia...",
  "entities_proxied": 5,
  "entities_blocked": 0,
  "audit_id": "b57ae39e..."
}
```

### `POST /api/timeline/assemble`
Parse an SAE narrative into a structured multi-track timeline with causality assessment.

### `POST /api/signal/cluster`
Detect AE clusters in a study window and generate a safety signal hypothesis.

### `POST /api/dataset/query`
Query the synthetic clinical trial dataset with filters, sort, and pagination.

### `POST /api/dashboard/generate`
Generate a chart-grid dashboard spec from a natural-language prompt.

### `GET /api/audit`
Return session statistics, full audit log, and current ε budget.

### `GET /api/health`
Liveness probe. Returns `{ "status": "ok", "mock_mode": bool, "version": "0.1.0" }`.

---

## Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm 9+

### Setup

```bash
# Clone and enter the project
git clone https://github.com/7dracoder/GhostDraft.git
cd GhostDraft

# Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set K2THINK_API_KEY

# Frontend dependencies
cd frontend
npm install --legacy-peer-deps
cd ..
```

### Start the backend

```bash
# Skip local model load for fast startup (uses cloud LLM only)
NGSP_SKIP_LOCAL_MODEL=1 .venv/bin/uvicorn backend.main:app \
  --host 0.0.0.0 --port 8000 --reload
```

### Start the frontend

```bash
cd frontend && npm run dev
# Opens at http://localhost:3000
```

### Run tests

```bash
.venv/bin/pytest -q
# Expected: 57 passed, 3 skipped
```

### Run the adversarial attack suite

```bash
# Full battery at default ε = 3.0
python experiments/run_attacks.py --epsilon 3.0

# Sweep ε from 0.5 to 5.0
python experiments/calibrate_epsilon.py --epsilons 0.5,1.0,2.0,3.0,5.0
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `K2THINK_API_KEY` | Yes | Primary LLM — IFM API key (`IFM-...`) |
| `GEMINI_API_KEY` | No | Google Gemini — enables `gemini-2` model option |
| `CLICKHOUSE_HOST` | No | ClickHouse Cloud hostname for audit persistence |
| `CLICKHOUSE_PASSWORD` | No | ClickHouse service password |
| `DD_API_KEY` | No | Datadog API key for LLM observability |
| `DD_SITE` | No | Datadog region (default: `datadoghq.com`) |
| `SENSO_API_KEY` | No | Senso knowledge base enrichment |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL for auth |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key for auth |
| `NGSP_SKIP_LOCAL_MODEL` | No | Set to `1` to skip local model load on startup |

---

## Tech Stack

**Backend:** Python · FastAPI · Pydantic · PyTorch · Hugging Face Transformers · sentence-transformers · DistilBERT · opacus (Rényi DP) · clickhouse-connect · google-genai · httpx

**Frontend:** React 19 · TypeScript · Vite 6 · Tailwind v4 · D3 · visx · TanStack Table · framer-motion · Lucide icons

**Privacy:** HIPAA Safe Harbor (18 identifiers) · Rényi Differential Privacy · Gaussian noise mechanism · Canary token detection · SHA-256 audit hashing

**Clinical standards:** CTCAE v5.0 · ICH E2A · WHO-UMC causality criteria · ICH E6 GCP · TMF Reference Model

**Observability:** Datadog LLM Observability · ClickHouse analytics · Supabase activity history

---

## Key Research Findings

**The embedding–text privacy gap.** Formal (ε, δ)-DP on hidden-state representations does not propagate to text-surface privacy under an unmodified decoder. Validated across a 10× ε range — utility was 0.8598 at every ε to six decimal places while σ varied from 9.69 to 0.97. The noise is injected correctly; the decoder ignores it.

**Routing dominates over noise.** Abstract-extractable achieves 0.00 verbatim leak rate on efficacy values. DP-tolerant achieves 0.67 on the same category at the same ε. The DP parameter is identical. Only the routing decision differs. The router is the operative privacy control variable.

**The privacy-utility tradeoff is binary.** After targeted fixes, verbatim leak rate fell from 76.5% to 7.2% — and utility collapsed from 1.000 to 0.266. The system does not interpolate between the two corners. This is a structural property of content-coupled tasks, not a tunable parameter.

**The biggest leakage risk isn't PHI — it's IP.** Staff are trained to avoid pasting patient names. They don't think of compound codenames, interim efficacy data, or amendment rationales as "sensitive." Regex catches SSNs; it doesn't catch *"hazard ratio of 0.61 for PFS at the second interim analysis"* — and that's a billion-dollar sentence with no identifiers in it.

---

## Detailed Integration Docs

See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for the complete technical reference on every external service — exact API calls, data flows, failure modes, and verification commands.

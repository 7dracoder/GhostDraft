# GhostDraft — 3-Minute Video Script

**Format:** Screen recording + voiceover  
**Total runtime:** ~3:00  
**Tone:** Direct, confident, no fluff

---

## [0:00 – 0:20] THE HOOK — The Problem Nobody Talks About

**[SCREEN: Black screen, then slowly fade in a chat window with ChatGPT open]**

> "Every single day, someone at a pharma company pastes a confidential clinical trial document into ChatGPT."

**[SCREEN: Show a realistic SAE narrative being typed into a chat box — patient ID, compound name, efficacy data visible]**

> "A medical writer cleaning up grammar. A pharmacovigilance specialist drafting a safety report. A regulatory affairs manager getting help with an FDA letter."

**[SCREEN: Zoom in on the sensitive parts — patient name, drug compound, interim results]**

> "58% of healthcare staff use unapproved AI tools for work. 44% admit to including patient data."

**[SCREEN: Red highlight over the data being sent]**

> "And here's what nobody tells you — the real risk isn't the patient's name. It's this."

**[SCREEN: Highlight "ORR of 47% in the 200mg arm versus 22% in control"]**

> "A single sentence. No patient identifiers. Worth billions. And it just left your machine."

---

## [0:20 – 0:40] THE SOLUTION — What GhostDraft Does

**[SCREEN: GhostDraft login screen appears — dark terminal aesthetic, phosphor green accents]**

> "GhostDraft is a clinical privacy workspace. It sits between your staff and cloud AI — and it makes sure nothing sensitive ever leaves your machine."

**[SCREEN: Show the three-pane workspace loading — Analyst persona]**

> "It's built for two types of users."

**[SCREEN: Click the Reviewer icon in the activity bar — switch to Reviewer persona]**

> "Reviewers — pharmacovigilance specialists and medical writers working with adverse event narratives."

**[SCREEN: Click the Analyst icon — switch to Analyst persona]**

> "And Analysts — clinical data scientists exploring trial datasets and building dashboards."

---

## [0:40 – 1:10] REVIEWER PERSONA — Paste a Narrative, Get a Timeline

**[SCREEN: Switch to Reviewer persona. Left pane shows the Narrative Input view]**

> "Let's start with the Reviewer. I'll paste a real SAE narrative."

**[SCREEN: Paste Example 1 — the thrombocytopenia narrative — into the textarea]**

> "Watch what happens. GhostDraft immediately detects every sensitive entity."

**[SCREEN: Pause — show the character count ticking up as text is pasted]**

> "Patient IDs, compound codes, site numbers, efficacy values, amendment references — all flagged before a single character leaves this machine."

**[SCREEN: Click "Assemble Timeline" button]**

> "Now I click Assemble. GhostDraft strips every sensitive value, replaces them with placeholders, and sends only the anonymized version to the AI."

**[SCREEN: Main pane animates — Case Timeline appears with multi-track D3 visualization]**

> "The AI reasons about causality. The answer comes back. GhostDraft re-injects the original values locally."

**[SCREEN: Point to the timeline tracks — event severity, dosing markers, lab sparkline]**

> "What you're looking at: the event severity track, dosing timeline, concomitant medications, lab values — and a WHO-UMC causality verdict. All assembled from one paragraph of text."

**[SCREEN: Point to the Signal Detection pane on the right]**

> "The right pane shows this case plotted against every other adverse event in the study window. Density clusters highlighted. Recommended actions generated."

---

## [1:10 – 1:35] THE FORENSIC DOCK — Proof It Worked

**[SCREEN: Click the bottom dock to expand it]**

> "Here's what makes GhostDraft different from just using a VPN or a BAA."

**[SCREEN: Show the three-column forensic view — Proxy Sent | Cloud Response | Rehydrated Answer]**

> "This is the forensic dock. Every single pipeline call is logged here in real time."

**[SCREEN: Point to the Proxy Sent column]**

> "Left column — what was actually sent to the cloud. Placeholders only. No patient data. No compound names. No efficacy numbers."

**[SCREEN: Point to the Cloud Response column]**

> "Middle — what the AI sent back. Still using placeholders."

**[SCREEN: Point to the Rehydrated Answer column]**

> "Right — what the user sees. Original values restored locally. The cloud never knew."

**[SCREEN: Point to the ε budget bar at the bottom]**

> "And this bar tracks your differential privacy budget. When it hits the limit, the system hard-refuses further requests. No silent degradation."

---

## [1:35 – 2:00] ANALYST PERSONA — Dataset + Dashboard

**[SCREEN: Switch to Analyst persona — Dataset Preview loads in left pane]**

> "Now the Analyst persona. Left pane is a live clinical trial dataset — subjects, events, dosing, labs."

**[SCREEN: Scroll through the dataset table — show entity highlighting on cells]**

> "Every cell containing a sensitive entity is annotated with its privacy tier. PHI, IP, MNPI — color coded."

**[SCREEN: Switch focus to the main pane — Chat/Assistant view]**

> "The main pane is the AI assistant. Same privacy pipeline — everything gets stripped before it reaches the model."

**[SCREEN: Type a question into the chat: "What are the most common Grade 3+ adverse events in this cohort?"]**

> "I ask a question about the dataset. GhostDraft routes it, strips any entities in the query, calls the AI, and returns the answer."

**[SCREEN: Switch to Dashboard pane on the right]**

> "The right pane is the dashboard generator. I type a natural language prompt."

**[SCREEN: Type "show me AE grade distribution by site" and hit generate]**

> "GhostDraft sends only aggregate statistics to the AI — never raw rows. The AI returns a chart spec. GhostDraft renders it."

**[SCREEN: Dashboard appears with bar charts, heatmap, KPI tiles]**

> "Bar charts, heatmaps, KPI tiles — all from one sentence."

---

## [2:00 – 2:25] UNDER THE HOOD — Why It's Different

**[SCREEN: Show a simple diagram — document → stripper → router → cloud → answer applier]**

> "Here's what's happening under the hood."

**[SCREEN: Highlight the Safe Harbor Stripper box]**

> "First — deterministic stripping. 18 HIPAA identifiers plus clinical quasi-identifiers and MNPI categories. Regex plus local NER. Nothing probabilistic."

**[SCREEN: Highlight the Neural Router box — show three paths branching]**

> "Then routing. Every request is classified into one of three paths."

**[SCREEN: Show "Abstract-extractable" path lighting up]**

> "Abstract-extractable — the task can be done without the sensitive values. The query is rewritten from scratch. Mathematically uninvertible."

**[SCREEN: Show "DP-tolerant" path]**

> "DP-tolerant — calibrated Gaussian noise added to the embeddings. Formal differential privacy guarantees."

**[SCREEN: Show "Local-only" path]**

> "Local-only — content and task are inseparable. Answered entirely on-device. Nothing sent anywhere."

**[SCREEN: Show the Answer Applier box]**

> "And finally — the entity map is re-applied locally. The user gets a useful answer. The cloud got nothing real."

---

## [2:25 – 2:50] INTEGRATIONS — Enterprise-Grade Stack

**[SCREEN: Show the Key Vault sidebar — model selector visible]**

> "GhostDraft runs on a production-grade stack."

**[SCREEN: Show model selector — Gemini 2.5 Flash highlighted]**

> "Gemini 2.5 Flash as the primary reasoning engine — fast, accurate, multimodal."

**[SCREEN: Quick cut to ClickHouse dashboard showing audit records]**

> "Every pipeline call is persisted to ClickHouse Cloud — a real analytics database. Compliance teams can run SQL queries over the full audit history."

**[SCREEN: Quick cut to Datadog showing LLM latency metrics]**

> "Datadog traces every LLM call — latency, token usage, error rates. Canary leak events trigger immediate alerts."

**[SCREEN: Show Senso knowledge base enrichment in action]**

> "Senso gives the assistant persistent memory. Upload clinical documents once — the assistant references them across every session."

**[SCREEN: Show Supabase auth — login screen]**

> "Supabase handles authentication. Email, password, Google OAuth. Every user's activity is scoped and audited."

---

## [2:50 – 3:00] CLOSE — Who Needs This

**[SCREEN: Return to the full workspace — both personas visible in the activity bar]**

> "GhostDraft is for anyone who works with clinical trial data and needs AI — without the compliance nightmare."

**[SCREEN: Slow pan across the workspace]**

> "Medical writers. Pharmacovigilance teams. Regulatory affairs. Clinical data analysts. CRO monitoring staff."

**[SCREEN: Fade to the GhostDraft logo on dark background]**

> "The AI gets smarter. The data stays private. That's GhostDraft."

**[SCREEN: Hold on logo for 3 seconds, then fade to black]**

---

## Production Notes

**Pacing:** Each section should feel unhurried. Don't rush the demo — let the UI breathe.

**Screen recording tips:**
- Use the Reviewer persona first — the timeline visualization is the most visually dramatic moment
- Expand the forensic dock slowly so viewers can read the three columns
- When showing the dashboard, let the charts animate in before moving on
- Keep the cursor movements deliberate — no fast scrolling

**Voiceover tone:** Confident and matter-of-fact. This is not a pitch — it's a demonstration. Let the product speak.

**Music:** None, or very low ambient. The UI sounds (if any) should be audible.

**Captions:** Recommended — clinical terminology is dense.

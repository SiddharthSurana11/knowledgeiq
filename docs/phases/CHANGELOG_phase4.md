# Phase 4 Changelog — Evaluation Harness & Lightweight Observability

## Workstream A: Recency-Weighted Reranking

### Modified: `apps/api-gateway/utils/pineconeClient.js`
- **Added** `getDB` import from `mongoClient.js`.
- **Added** Step 5 in the hybrid retrieval path: after cross-encoder sigmoid normalization, the system now computes a `rankScore` that blends cross-encoder confidence with document recency:
  ```
  recencyWeight = exp(-daysSince(effectiveDate) / 365)
  rankScore = 0.75 * score + 0.25 * recencyWeight
  ```
- **`score` (confidence) is NOT modified** — it remains the pure normalized cross-encoder score used by the hallucination guard in `chatRoute.js` and displayed as confidence percentage in the UI. Only `rankScore` is used for internal sort ordering.
- **Graceful fallback**: the effectiveDate MongoDB lookup is wrapped in `try/catch`. On failure or timeout, ranking falls back to cross-encoder score alone with a logged warning — consistent with Phase 2's reranker circuit breaker pattern.
- **Gated** behind the existing `HYBRID_RETRIEVAL_ENABLED` flag — no new env variable.
- Updated `applyDiversityFilter()` to sort by `rankScore` when present, falling back to `score`.

### Modified: `apps/api-gateway/routes/chatRoute.js`
- **Added** `is_refusal: isRefusal` to the `POST /api/chat` response payload. This exposes the hallucination guard's boolean decision directly to clients and the eval harness, replacing the need for fragile text-pattern matching to infer refusal.

---

## Workstream B: Evaluation Harness

### New: `eval/gold_set.json`
- 18 gold-standard test entries across 5 categories (compliance, hr, finance, it, operations).
- 12 `standard` entries, 3 `supersession` entries, 3 `no_answer_expected` entries.
- ⚠️ **All `expected_documentId` values are `PLACEHOLDER_REPLACE_ME`** — you MUST manually replace these with actual documentIds from your MongoDB `documents` collection before the Recall@5 and supersession accuracy numbers mean anything. See `eval/README.md` for how to find them.

### New: `eval/run_eval.py`
- Standalone offline Python script that calls `POST /api/chat` for each gold set entry.
- Computes: **Recall@5**, **Supersession Accuracy**, **Abstention Correctness** (using the actual `isRefusal` boolean, not text matching), and **Faithfulness Proxy** (lightweight substring check — documented as not being full RAGAS/TruLens LLM-as-judge scoring).
- Outputs `eval/results_YYYYMMDD.json` with per-query details and aggregate summary.
- Prints a clean summary table to stdout (screenshot-friendly for portfolio).
- Documents the two-run workflow for hybrid vs legacy comparison in stdout output.

### New: `eval/README.md`
- Full usage documentation: prerequisites, gold set preparation, running the script, interpreting results, and hybrid vs legacy comparison workflow.

---

## Workstream C: Lightweight Observability

### New: `apps/api-gateway/utils/tracing.js`
- OpenTelemetry tracing module with `ConsoleSpanExporter` + custom `JsonlFileSpanExporter` that writes spans to `logs/traces-YYYY-MM-DD.jsonl`.
- Exports `startSpan()` and `endSpan()` helpers.
- Uses the existing `X-Request-Id` (correlation ID) as a span attribute (`http.request_id`) for cross-referencing with structured logs.

### Modified: `apps/api-gateway/routes/chatRoute.js`
- Added OTel span instrumentation around:
  - `chat.request` (top-level span for the entire chat workflow)
  - `chat.pinecone_retrieval` (embedding + Pinecone + BM25 + RRF + cross-encoder + recency)
  - `chat.trust_score_fetch` (MongoDB trust score batch lookup)
  - `chat.llm_generate` (gRPC call to LLM service)
- Each span records latency, chunk count, top score, hybrid mode, provider name, and token counts.

### Modified: `apps/llm-service/app.py`
- Added OTel tracing (with `try/except ImportError` graceful degradation) around:
  - `llm.GenerateResponse` — records provider, model, latency, chunk count, token usage.
  - `llm.AnalyzeContent` — records task type, provider, latency.
- OTel packages are optional — service runs normally without them installed.

### Modified: `apps/embedding-service/app.py`
- Added OTel tracing (with `try/except ImportError` graceful degradation) around:
  - `embedding.GetEmbedding` — records text length, vector dimension, latency.
  - `embedding.RerankCandidates` — records candidate count, latency.
- OTel packages are optional — service runs normally without them installed.

### New npm dependencies: `apps/api-gateway/package.json`
- `@opentelemetry/api`
- `@opentelemetry/sdk-trace-node`
- `@opentelemetry/sdk-trace-base`
- `@opentelemetry/resources`

### Optional Python dependencies (not auto-installed):
- `opentelemetry-api`, `opentelemetry-sdk` — install with `pip install opentelemetry-api opentelemetry-sdk` to enable Python service tracing. Services degrade gracefully without them.

---

## Files Changed Summary

| File | Change Type |
|---|---|
| `apps/api-gateway/utils/pineconeClient.js` | Modified (recency ranking) |
| `apps/api-gateway/routes/chatRoute.js` | Modified (isRefusal response + OTel spans) |
| `apps/api-gateway/utils/tracing.js` | **New** (OTel module) |
| `apps/api-gateway/package.json` | Modified (OTel deps) |
| `apps/llm-service/app.py` | Modified (OTel spans) |
| `apps/llm-service/llm/GroqProvider.py` | Modified (default model alignment) |
| `apps/embedding-service/app.py` | Modified (OTel spans) |
| `eval/gold_set.json` | **New** (test set — PLACEHOLDERS) |
| `eval/run_eval.py` | **New** (eval script) |
| `eval/README.md` | **New** (documentation) |

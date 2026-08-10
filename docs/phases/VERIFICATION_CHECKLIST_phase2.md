# Phase 2 Manual Verification Checklist

Use this checklist to manually verify the Hybrid Retrieval Pipeline and Async Contradiction Detection Queue.

---

### 1. Workstream A: Hybrid Retrieval Pipeline Verification

- [ ] **Test Case 1.1: Legacy Fallback Behavior (`HYBRID_RETRIEVAL_ENABLED=false`)**
  - Set `HYBRID_RETRIEVAL_ENABLED=false` in `.env` and restart API Gateway.
  - Issue a search query (e.g. "supplier code of conduct").
  - **Expected Result**: Pinecone retrieves 15 candidates (`topK=15`). Results are sorted using the legacy +5% keyword boost on filename/category strings.

- [ ] **Test Case 1.2: Hybrid Pipeline & Result Quality (`HYBRID_RETRIEVAL_ENABLED=true`)**
  - Set `HYBRID_RETRIEVAL_ENABLED=true` in `.env` and restart API Gateway.
  - Issue a query where lexical text matches and vector similarity signals disagree (e.g. searching for specific clause terms like "termination for convenience clause 12.4" across generic filenames).
  - **Expected Result**: 
    - Pinecone retrieves 25 candidate chunks.
    - BM25 scores full chunk text content.
    - RRF combines vector and BM25 ranks ($k=60$).
    - Top 10 candidates are reranked via `RerankCandidates` gRPC call to Python Cross-Encoder (`ms-marco-MiniLM-L-6-v2`).
    - Top 5 diverse chunks (max 2 per doc) are returned with cross-encoder relevance scores.

- [ ] **Test Case 1.3: Cross-Encoder Circuit Breaker Fallback**
  - Keep `HYBRID_RETRIEVAL_ENABLED=true`.
  - Stop the Python Embedding Service process mid-request or set invalid `EMBEDDING_GRPC_HOST`.
  - Issue a chat query.
  - **Expected Result**: API Gateway logs `[RerankClient] Reranking failed after retries... Falling back to RRF ordering`. The chat query succeeds without failing or hanging, returning RRF-ordered chunks.

---

### 2. Workstream B: Async Contradiction Detection Queue Verification

- [ ] **Test Case 2.1: Immediate Upload Completion**
  - Upload a new document via `/api/upload`.
  - Measure total HTTP response latency.
  - **Expected Result**: Upload endpoint returns immediately (`status: "completed"`) without waiting for LLM contradiction checks. Response payload contains `contradictionWarning: "Contradiction check queued — results will update automatically."` and document has `contradictionStatus: "PENDING"`.

- [ ] **Test Case 2.2: Async Queue Processing & Status Transition**
  - Inspect MongoDB `contradiction_jobs` collection immediately after upload.
  - **Expected Result**: A job record exists with `status: "pending"`. Within 10-15 seconds, the background worker picks up the job (`status: "processing"`), executes the check, and updates it to `status: "completed"`.

- [ ] **Test Case 2.3: Trust Score State Differentiation**
  - Query MongoDB `documents` collection during `PENDING` state vs post-completion.
  - **Expected Result**: 
    - While `PENDING`, `trustBreakdown.contradictionPenalty` is 5 (provisional penalty) and `contradictionStatus` is `"PENDING"`.
    - Once completed with no contradictions, `contradictionStatus` updates to `"NO_CONTRADICTION"` and `contradictionPenalty` becomes 0, updating `trustScore`.

- [ ] **Test Case 2.4: Stuck-Job Recovery & Retry Cap**
  - Insert a mock job in `contradiction_jobs` with `status: "processing"` and `processingStartedAt` set to 3 minutes ago.
  - **Expected Result**: On the next worker poll tick, log records `Reset 1 stale processing job(s) back to pending`. The job is re-processed cleanly. If failure repeats 3 times (`retryCount >= 3`), status changes to `"failed"`.

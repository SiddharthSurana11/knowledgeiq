# Phase 2 Redesign Changelog: Hybrid Retrieval & Async Contradiction Queue

This document summarizes all architectural changes, new components, proto updates, and subsystem refactorings implemented during Phase 2.

---

## Workstream A: Hybrid Retrieval Pipeline

Replaced crude filename/category lexical keyword boosting with a production-grade 3-stage hybrid retrieval pipeline (Vector Search + BM25 + Reciprocal Rank Fusion + Cross-Encoder Reranking).

### 1. BM25 Scoring Module
- **`apps/api-gateway/utils/bm25.js`** *(NEW)*: Self-contained Okapi BM25 implementation (`tokenize`, `scoreBM25`). Computes term frequency and local Inverse Document Frequency (IDF) over candidate chunk text content (top ~25 candidates from Pinecone).

### 2. Reciprocal Rank Fusion
- **`apps/api-gateway/utils/rrfFusion.js`** *(NEW)*: Reciprocal Rank Fusion module (`fuseRankings`). Fuses vector-similarity rank order and BM25 rank order using standard formula $1 / (k + \text{rank})$ with $k = 60$.

### 3. Cross-Encoder Reranking via gRPC
- **`protos/embedding.proto`**: Added `RerankRequest` (`query`, `candidate_texts`), `RerankResponse` (`scores`), and `rpc RerankCandidates` to `EmbeddingService`.
- **`apps/api-gateway/services/grpcClients/embedding_pb.js` & `embedding_grpc_pb.js`**: Updated Node.js gRPC stubs with serialization methods and `rerankCandidates` client descriptor.
- **`apps/embedding-service/protos/` & `apps/embedding-service/app.py`**: Updated Python gRPC stubs and implemented `RerankCandidates` in `EmbeddingServiceServicer` using `sentence_transformers.CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')`.
- **`apps/api-gateway/utils/rerankClient.js`** *(NEW)*: Created gRPC client wrapper for `RerankCandidates` integrated with Opossum circuit breaker and exponential backoff retry helper (`withRetry`). Returns `null` on breaker open/timeout to trigger graceful fallback to RRF ordering.

### 4. Config & Flag-Gated Retrieval Core
- **`apps/api-gateway/config/index.js`**: Added `hybridEnabled` (`HYBRID_RETRIEVAL_ENABLED`), `hybridCandidatePoolSize` (default 25), and `rerankTopN` (default 10) to retrieval configuration.
- **`apps/api-gateway/utils/pineconeClient.js`**:
  - Gated hybrid retrieval behind `HYBRID_RETRIEVAL_ENABLED`.
  - When `false`: Runs exact legacy lexical keyword-boost + diversity filter (`topK=15`).
  - When `true`: Queries Pinecone for 25 candidates, calculates BM25 text scores, applies RRF fusion, sends top 10 candidates to `RerankCandidates`, applies cross-encoder scores (with fallback to RRF if reranker fails), applies diversity filter (max 2 per doc), and returns top 5.

---

## Workstream B: Async Contradiction Detection Queue

Decoupled contradiction verification from synchronous upload ingestion to eliminate upload latency bottlenecks.

### 1. MongoDB Background Job Queue & Worker
- **`apps/api-gateway/workers/contradictionWorker.js`** *(NEW)*: Background polling worker (`pollContradictionJobs`, `startContradictionWorker`).
  - Polls `contradiction_jobs` collection every 10 seconds.
  - Implements **stuck-job recovery**: resets jobs in `processing` state for >2 minutes back to `pending` with incremented `retryCount`.
  - Atomically acquires `pending` jobs (`findOneAndUpdate`), executes `ContradictionDetectionService.detectContradictions`, marks status `completed` or `failed`, updates `documents` collection metadata, and recalculates trust scores.
  - Caps retries at 3 attempts before marking jobs `failed`.

### 2. Immediate Upload Ingestion Response
- **`apps/api-gateway/routes/uploadRoute.js`**:
  - Replaced synchronous `ContradictionDetectionService` execution with an asynchronous `contradiction_jobs` insertion.
  - Uploads return immediately upon embedding completion with `contradictionStatus: 'PENDING'`.

### 3. Trust Score Pending State Support
- **`apps/api-gateway/services/trustScoreService.js`**: Added explicit `PENDING` handling to `breakdown.contradictionPenalty` (5-point provisional penalty) to clearly distinguish in-flight contradiction checks from `NO_CONTRADICTION` (0 penalty).

### 4. Server Initialization
- **`apps/api-gateway/server.js`**: Added `startContradictionWorker()` initialization call upon DB connection.

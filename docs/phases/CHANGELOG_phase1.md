# Phase 1 Production-Hardening Changelog

This document summarizes all bug fixes, architectural consistency updates, and production hardening changes implemented during Phase 1.

---

## Summary of Changes

### 1. Chain-of-Thought & Reasoning Leakage Elimination
- **`apps/llm-service/prompts/system.txt`**: Added explicit `XML ENVELOPE ISOLATION CONTRACT` instructing LLM providers to output internal thinking inside `<scratchpad>...</scratchpad>` and the user-facing answer inside `<answer>...</answer>`.
- **`apps/llm-service/prompts/formatting.txt`**: Updated Output Format Contract to enforce formatting rules within the `<answer>` envelope.
- **`apps/llm-service/prompts/refusal.txt`**: Updated Refusal Contract to require placing refusal summaries inside `<answer>`.
- **`apps/llm-service/response_generator.py`**:
  - Updated `sanitize_llm_response()` to extract `<answer>...</answer>` blocks and discard `<scratchpad>` content.
  - Implemented warning log (`logging.warning("[response_generator] Model response missing <answer> XML envelope...")`) when `<answer>` tags are missing, triggering regex fallback.
  - Removed all `use_prefill` arguments and prefill prompt parameters.
- **Provider Refactoring (`BaseLLMProvider.py`, `ClaudeProvider.py`, `OpenRouterProvider.py`, `GroqProvider.py`, `GeminiProvider.py`)**:
  - Removed `_ANSWER_PREFILL` constants and assistant turn prefill logic. All providers now use uniform System/User message payloads with XML envelope parsing.

### 2. Orphaned Pinecone Vector Deletion on Re-Upload
- **`apps/embedding-service/modules/vectorDB/embedder.py`**: Added `documentId` to the metadata payload written to Pinecone vectors during embedding generation.
- **`apps/api-gateway/utils/pineconeClient.js`**: Updated `_deleteVectorsByDocument(documentId, filename, category)` to delete existing document vectors via Pinecone metadata filtering (`documentId` or `filename`).
- **`apps/api-gateway/services/documentService.js`**: Verified sync deletion triggers exclusively during genuine document re-uploads (`existingDoc !== null`).

### 3. Storage Source-of-Truth Consolidation
- **`docs/adr/001-storage-backend.md`**: Created Architecture Decision Record establishing MinIO / S3-compatible storage as the canonical raw file storage standard and superseding legacy Google Drive references.

### 4. N+1 MongoDB Query Elimination in Chat Route
- **`apps/api-gateway/routes/chatRoute.js`**: Replaced parallel `Promise.all` document `findOne` lookups with a single batched MongoDB query (`db.collection('documents').find({ filename: { $in: filenames } })`).

### 5. Contradiction Detection Architecture Decision
- **`docs/adr/002-contradiction-detection-location.md`**: Created Architecture Decision Record documenting the retention of `ContradictionDetectionService` inside Node.js, superseding the original `CheckContradiction` gRPC proto proposal.

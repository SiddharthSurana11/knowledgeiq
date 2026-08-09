# Phase 1 Manual Verification Checklist

Use this checklist to manually verify that each production-hardening fix functions correctly.

---

### 1. XML Envelope Isolation & CoT Leakage Verification
- [ ] **Test Case 1.1: Primary Provider (Gemini / OpenRouter)**
  - Send a chat query requiring multi-document synthesis (e.g., "Compare supplier policies across HR and Compliance").
  - **Expected Result**: User-facing answer starts directly with the bold headline (`**...**`). No `<scratchpad>`, `<thinking>`, or chain-of-thought preamble ("Let's examine...", "We need to check...") appears in the UI response.
- [ ] **Test Case 1.2: Fallback Provider (Claude / Groq)**
  - Switch `LLM_PROVIDER` in `.env` to `claude` or `groq` and restart the LLM service.
  - Send the same synthesis question.
  - **Expected Result**: User-facing response matches the format identically without provider-specific prefill bugs or formatting artifacts.
- [ ] **Test Case 1.3: Fallback Log Inspection**
  - Search `logs/chat-*.log` or LLM service stdout for fallback warnings.
  - **Expected Result**: If a model omits `<answer>` tags, verify that `logging.warning("[response_generator] Model response missing <answer> XML envelope...")` is logged, and regex fallback successfully strips preamble text.

---

### 2. Orphaned Pinecone Vector Deletion Verification
- [ ] **Test Case 2.1: First-time Upload**
  - Upload a new PDF document (e.g. `policy_v1.pdf`) to category `HR`.
  - Check Pinecone index match count or logs.
  - **Expected Result**: Document is assigned version 1, and chunks are embedded into Pinecone. `deleteVectorsByDocument` is NOT triggered.
- [ ] **Test Case 2.2: Re-upload (Same Filename & Category)**
  - Upload an updated version of `policy_v1.pdf` (with fewer pages or modified text) to category `HR`.
  - Check gateway upload logs (`logs/uploads-*.log`).
  - **Expected Result**: Document is assigned version 2. Gateway logs show `deleteVectorsByDocument` deleting previous chunks before upserting new chunks. Vector chunk count in Pinecone does not double or store orphaned chunks.

---

### 3. Storage Source-of-Truth Verification
- [ ] **Test Case 3.1: ADR File Verification**
  - Confirm presence of `docs/adr/001-storage-backend.md`.
  - **Expected Result**: MinIO is documented as the single canonical object storage backend.
- [ ] **Test Case 3.2: Configuration Check**
  - Verify `.env.example` and `config/index.js` require MinIO keys (`STORAGE_PROVIDER=minio`, `MINIO_ENDPOINT`, `MINIO_BUCKET`).

---

### 4. N+1 MongoDB Query Batching Verification
- [ ] **Test Case 4.1: Query Performance & Single Round-trip**
  - Send a chat query that retrieves 5 chunks spanning 3 distinct documents.
  - Check MongoDB query log or gateway trace log (`TRUST_SCORE_FETCH_COMPLETED`).
  - **Expected Result**: Gateway issues a single `db.collection('documents').find({ filename: { $in: [...] } })` query instead of multiple `findOne` calls. Trust scores are mapped accurately onto all 5 returned document hits.

---

### 5. Contradiction Detection Architecture Verification
- [ ] **Test Case 5.1: ADR File Verification**
  - Confirm presence of `docs/adr/002-contradiction-detection-location.md`.
  - **Expected Result**: Node.js `ContradictionDetectionService` implementation is documented as retained and superseding legacy proto changes.

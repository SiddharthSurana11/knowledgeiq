# KnowledgeIQ Project Construction History & Engineering Index

This document provides a complete, chronological master index of KnowledgeIQ's software development history, tracking every phase, architectural milestone, verification checklist, and Architecture Decision Record (ADR) from initial foundation to production containerization.

---

## 📌 Development Chronology Index

### 🔹 Phase 1: Foundation & Generalized Domain Model
* **Focus**: Evolved from an earlier enterprise document chatbot prototype to KnowledgeIQ, created dynamic MongoDB category configuration, domain-neutral system prompts, and Pinecone metadata category filtering.
* **Changelog**: [`docs/phases/CHANGELOG_phase1.md`](phases/CHANGELOG_phase1.md)
* **Verification Checklist**: [`docs/phases/VERIFICATION_CHECKLIST.md`](phases/VERIFICATION_CHECKLIST.md)
* **Architecture Decision Record**: [`docs/adr/001-storage-backend.md`](adr/001-storage-backend.md) (Standardized MinIO S3 object storage).

---

### 🔹 Phase 2: Production Quality & Resilience Engines
* **Focus**: Implemented 2-way Hybrid Search (Dense Vector + Sparse BM25 with RRF Fusion), Document Trust Scoring (0-100 score), Duplicate Detection Engine (MinIO hash & MinHash LSH), Async Contradiction Detection Worker, and Governance Dashboard Sync.
* **Changelog**: [`docs/phases/CHANGELOG_phase2.md`](phases/CHANGELOG_phase2.md)
* **Verification Checklist**: [`docs/phases/VERIFICATION_CHECKLIST_phase2.md`](phases/VERIFICATION_CHECKLIST_phase2.md)
* **Summary Report**: [`docs/phases/summary_report_phase2 as per Claude's Guidance started on 7th aug 2026`](phases/summary_report_phase2%20as%20per%20Claude's%20Guidance%20started%20on%207th%20aug%202026)
* **Architecture Decision Record**: [`docs/adr/002-contradiction-detection-location.md`](adr/002-contradiction-detection-location.md) (Async background worker queue).

---

### 🔹 Phase 3: Security & Enterprise Governance
* **Focus**: Implemented JWT authentication, role-based access control (Admin / User), payload size sanitization, API rate limiters, document scope search (global vs single-document), and circuit breaker pattern for external LLM calls.
* **Changelog**: [`docs/phases/CHANGELOG_phase3.md`](phases/CHANGELOG_phase3.md)
* **Verification Checklist**: [`docs/phases/VERIFICATION_CHECKLIST_phase3.md`](phases/VERIFICATION_CHECKLIST_phase3.md)

---

### 🔹 Phase 4: Production Observability, Eval Harness & 2-Stage Reranking
* **Focus**: Integrated OpenTelemetry tracing, built automated evaluation harness (`eval/run_eval.py`), populated enterprise benchmark gold set (`gold_set.json`), added 2-stage neural cross-encoder reranking (`ms-marco-MiniLM-L-6-v2`), hallucination refusal guards, and provider failover chain (Groq -> Gemini -> OpenRouter).
* **Changelogs**:
  - [`docs/phases/CHANGELOG_phase4.md`](phases/CHANGELOG_phase4.md)
  - [`docs/phases/CHANGELOG_phase4_bugfixes.md`](phases/CHANGELOG_phase4_bugfixes.md)
  - [`docs/phases/CHANGELOG_gold_set_population.md`](phases/CHANGELOG_gold_set_population.md)
  - [`docs/phases/CHANGELOG_provider_config_fix.md`](phases/CHANGELOG_provider_config_fix.md)
* **Security Rotation**: [`docs/phases/SECURITY_ROTATION_CHECKLIST.md`](phases/SECURITY_ROTATION_CHECKLIST.md)

---

### 🔹 Visual Redesign & Brand Logo Update
* **Focus**: Added real dark-theme wolf brand mark (`transparent_bg_wolf_2.png`), slate avatar chips (`bg-[#E2E8F0]`), and workspace footer disclaimers.
* **Changelog**: [`docs/phases/CHANGELOG_ui_footer_and_logo.md`](phases/CHANGELOG_ui_footer_and_logo.md)

---

### 🔹 Pre-Retrieval LLM Query Rewriter
* **Focus**: Pre-retrieval LLM Query Rewriter resolving multi-turn pronouns and implicit context before search, fail-open 3.5s execution timeout (`QUERY_REWRITE_ENABLED`), and analytics `rawQuery` display isolation.
* **Changelog**: [`docs/phases/CHANGELOG_query_rewriter.md`](phases/CHANGELOG_query_rewriter.md)
* **Architecture Decision Record**: [`docs/adr/003-query-rewriting.md`](adr/003-query-rewriting.md)

---

### 🔹 Phase 5: Containerization, Security, Deployment & Documentation
* **Focus**: Multi-container Docker deployment (`docker-compose.yml` for 5 services: MinIO, Gateway, Embedding Service, LLM Service, Nginx Frontend), pre-public security pass, fresh 2026 Railway/Render deployment guide (`DEPLOYMENT.md`), root README rewrite, and single-command local dev script (`start-dev.ps1`).
* **Changelog**: [`CHANGELOG_phase5.md`](../CHANGELOG_phase5.md)

---

## 🏛️ Master Architecture Decision Records (ADRs)

1. [ADR 001: MinIO S3 Object Storage Persistence](adr/001-storage-backend.md)
2. [ADR 002: Async Contradiction Worker Queue](adr/002-contradiction-detection-location.md)
3. [ADR 003: Pre-Retrieval LLM Query Rewriting & Fail-Open Design](adr/003-query-rewriting.md)

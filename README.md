# KnowledgeIQ — Enterprise Document Intelligence & RAG Governance Platform

**KnowledgeIQ** is an enterprise-grade Retrieval-Augmented Generation (RAG) platform designed for highly reliable, grounded document intelligence across corporate policies, guidelines, and compliance documentation. Built with a 2-stage neural retrieval architecture (Pinecone Dense Vector + Sparse BM25 with Reciprocal Rank Fusion, followed by Cross-Encoder neural reranking), KnowledgeIQ features an automated pre-retrieval LLM Query Rewriter, real-time hallucination refusal guards, document trust scoring (0–100), duplicate upload detection (MinHash LSH), async contradiction detection queues, and a comprehensive governance analytics dashboard.

---

## ⚡ Quick Start (Single-Command Docker Deployment)

Run the entire 5-container KnowledgeIQ stack (MinIO Object Storage, API Gateway, Embedding Service, LLM Failover Service, and Nginx React Frontend) with a single command from the repository root:

```bash
docker compose up --build
```

Once initialized, open your browser to **`http://localhost:5173`** to access the KnowledgeIQ Workspace UI.

---

## 🏛️ System Architecture

```
                               ┌─────────────────────────────┐
                               │     React / Vite SPA        │
                               │  (Dark Theme Workspace UI)  │
                               └──────────────┬──────────────┘
                                              │ HTTP / REST
                                              ▼
                               ┌─────────────────────────────┐
                               │   API Gateway (Node.js)     │
                               │  Auth, Rate-Limit, Tracing  │
                               └──────┬───────────────┬──────┘
                                      │               │
                       gRPC (50052)   │               │   gRPC (50053)
              ┌───────────────────────┘               └───────────────────────┐
              ▼                                                               ▼
┌───────────────────────────┐                                   ┌───────────────────────────┐
│ Embedding Service (Python)│                                   │ LLM Failover (Python)     │
│ PyTorch, SpaCy Parsing,   │                                   │ Query Rewriter, Groq,     │
│ Cross-Encoder Reranker    │                                   │ Gemini, OpenRouter, Claude│
└─────────────┬─────────────┘                                   └───────────────────────────┘
              │
              ├──────────────────────┬──────────────────────┐
              ▼                      ▼                      ▼
    ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │  MongoDB Atlas   │   │  Pinecone Vector │   │  MinIO S3 Blob   │
    │  Docs & Analytics│   │  Hybrid Index    │   │  Raw Document Store│
    └──────────────────┘   └──────────────────┘   └──────────────────┘
```

---

## 💡 Key Engineering Decisions (Architecture Decision Records)

KnowledgeIQ's technical evolution is guided by three formal Architecture Decision Records (ADRs):

1. **[ADR 001: MinIO / S3-Compatible Object Storage Persistence](file:///e:/knowledgeiq-platform/docs/adr/001-storage-backend.md)**
   - *Decision*: Standardized on MinIO / S3 object storage for raw uploaded document persistence, superseding legacy Google Drive dependencies to deliver local/in-cluster containerized blob storage.
2. **[ADR 002: Async Worker Queue for Contradiction Detection](file:///e:/knowledgeiq-platform/docs/adr/002-contradiction-detection-location.md)**
   - *Decision*: Decoupled document contradiction detection from synchronous upload HTTP requests into an asynchronous background polling worker (`ContradictionWorker`), maintaining upload latency under 2 seconds.
3. **[ADR 003: Pre-Retrieval LLM Query Rewriting & Fail-Open Design](file:///e:/knowledgeiq-platform/docs/adr/003-query-rewriting.md)**
   - *Decision*: Introduced an LLM-based query rewriter before document retrieval to resolve multi-turn pronouns and implicit context. Designed with a strict 3.5s timeout (`QUERY_REWRITE_TIMEOUT_MS`) that automatically **fails open** to the raw user query if upstream providers time out or encounter rate limits.

---

## 📊 Retrieval Quality & Evaluation Benchmark Metrics

Retrieval accuracy and hallucination safety are continuously validated using an automated evaluation harness (`eval/run_eval.py`) operating against an enterprise ground-truth dataset (`eval/gold_set.json`).

*Latest evaluation results with Query Rewriting enabled (`QUERY_REWRITE_ENABLED=true`):*

| Metric | Score | Passed / Total | Description |
|---|---|---|---|
| **Recall@5** | **100.0%** | 7/7 | Top-5 retrieval accuracy across standard corporate queries |
| **Supersession Accuracy** | **100.0%** | 1/1 | Correct preference for active vs superseded document versions |
| **Abstention Correctness** | **100.0%** | 2/2 | Perfect hallucination guard refusal on out-of-domain queries |
| **Faithfulness Proxy** | **57.1%** | 4/7 | Literal phrase alignment against ground-truth excerpts |
| **Query Success Rate** | **100.0%** | 9/9 | Zero unhandled runtime exceptions or gateway errors |

---

## ⚠️ Known Limitations & Operational Tradeoffs

1. **Free-Tier Provider Rate Limits & Failover Latency**:
   - The LLM service implements a 4-tier provider failover chain (Groq -> Gemini -> OpenRouter -> Claude). Under heavy load or free-tier API rate limits (HTTP 429), failover transitions add latency to chat requests while waiting for secondary providers.
2. **Query Rewriting Latency & Quota Tradeoff**:
   - The pre-retrieval query rewriting step adds **1 additional LLM API call** per chat request to resolve multi-turn context. While wrapped in a fail-open 3.5s timeout, this introduces a minor latency overhead (~700ms–1.5s) and consumes provider token quota.
3. **Fixed Token Sliding-Window Chunking**:
   - Documents are currently split using `tiktoken` sliding token windows (800 tokens / 100 overlap). While sentence boundary detection prevents chopping words, topic shifts mid-chunk are bounded by fixed token counts rather than AST/semantic section breaks.

---

## 📌 Strategic Roadmap (Designed But Not Built)

As documented in [`docs/ROADMAP.md`](file:///e:/knowledgeiq-platform/docs/ROADMAP.md), the following features are architecturally scoped for future releases:

1. **GraphRAG & Knowledge Graphs**:
   - Building entity-relationship graphs from ingested documents for complex multi-entity relation queries. Scoped out for initial release due to implementation complexity; hybrid RRF + cross-encoder reranking currently achieves 100% Recall@5.
2. **Semantic & Structural Chunking**:
   - Dynamic embedding-distance splitting and Markdown header chunking. Scoped out because re-chunking existing documents would invalidate ground-truth chunk IDs in `eval/gold_set.json` and incur substantial re-embedding costs.

---

## 🛠️ Local Non-Docker Development Setup

If you prefer iterating locally without Docker containers:

### PowerShell One-Click Startup (Windows)
Run the convenience script to launch all 4 application services in separate terminal tabs with automatic `venv` activation:
```powershell
.\start-dev.ps1
```

### Manual Service Startup
1. **MinIO Server**: `minio server E:\minio_data` (Port 9000)
2. **Embedding Service**: `cd apps/embedding-service && .\venv\Scripts\activate && python app.py` (Port 50052)
3. **LLM Service**: `cd apps/llm-service && .\venv\Scripts\activate && python app.py` (Port 50053)
4. **API Gateway**: `cd apps/api-gateway && npm start` (Port 5000)
5. **Frontend**: `cd apps/frontend_reactjs && npm run dev` (Port 5173)

---

## 🖼️ Application Screenshots & UI Showcase

*The KnowledgeIQ UI features a sleek matte dark theme (`#0A0A0B`), wolf brand mark, slate avatar chips, and integrated workspace footer.*

- `[SCREENSHOT: KnowledgeIQ Dark Theme Workspace Chat Interface]`
- `[SCREENSHOT: Document Sources & Trust Score Breakdown Panel]`
- `[SCREENSHOT: Governance & Search Analytics Dashboard]`
- `[SCREENSHOT: Knowledge Health & Contradiction Detection View]`
- `[SCREENSHOT: Document Upload & Metadata Category Tagging Panel]`

---

## 📄 License & Project Documentation

For deep technical specifications, past phase changelogs, and security rotation checklists, refer to the **[KnowledgeIQ Master Project History Index](file:///e:/knowledgeiq-platform/docs/PROJECT_HISTORY.md)** and **[DEPLOYMENT.md](file:///e:/knowledgeiq-platform/DEPLOYMENT.md)**.

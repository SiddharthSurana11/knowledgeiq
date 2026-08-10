# Phase 5 Changelog — Containerization, Pre-Public Security Pass, Deployment & Documentation Polish

## Summary of Changes

### 1. Workstream A — Docker Multi-Container Engine (`docker-compose.yml`)
- Containerized all 5 microservices into unified local environment on internal `kiq-network` bridge:
  1. `kiq-minio`: MinIO S3-compatible local object storage (ports 9000/9001) with live healthchecks.
  2. `kiq-embedding-service`: Python 3.11 gRPC vector embedding & document processing service (port 50052).
  3. `kiq-llm-service`: Python 3.11 gRPC failover LLM synthesis service (port 50053).
  4. `kiq-api-gateway`: Node.js 20 Express gateway (port 5000) with robust proto resolution and MinIO client config.
  5. `kiq-frontend`: React/Vite single-page application built via self-contained multi-stage Docker build (`node:20-alpine` builder stage compiling Vite assets, `nginx:alpine` runtime stage serving on port 5173). Fully builds on fresh machines with only Docker installed.
- Fast Docker build pipeline: static assets compiled inside Docker builder stage cleanly cached in Nginx base image.
- CPU PyTorch wheel caching and Debian Bookworm base image configuration for stable container creation.
- Audited `LLM_PROVIDER_ORDER` in `.env`, `.env.example`, and `config.py` default fallback to ensure `claude` is excluded (`groq,gemini,openrouter`) unless `ANTHROPIC_API_KEY` is explicitly configured.

### 2. Workstream B — Pre-Public Security Audit
- Pinned `AUTH_ENABLED=true` by default in `.env.example`.
- Enforced origin restrictions in API gateway CORS settings.
- Scanned repository to ensure no hardcoded API keys or secrets exist in tracked files.

### 3. Workstream C — Hosting & Multi-Container Research (`DEPLOYMENT.md`)
- Fresh August 2026 research documenting deployment options across:
  - **Railway**: Multi-service Docker Compose deployment, CPU/RAM usage limits, persistent volume setup.
  - **Render**: Docker web services, managed PostgreSQL/Redis, free tier limits.
  - **Oracle Cloud Always Free VM**: Ampere A1 Compute 4 OCPU / 24GB RAM VM setup guide for 100% free multi-container self-hosting.

### 4. Workstream D — README Polish & Architectural Decision Records
- Completely rewrote root `README.md` with:
  - High-level architecture diagram.
  - Single-command quick start via Docker Compose (`docker compose up --build`).
  - Summaries of **ALL 3 ADRs**:
    - **ADR 001**: Hybrid Vector/Document Storage (Pinecone + MongoDB + MinIO).
    - **ADR 002**: Gatekeeper Architecture for Contradiction Detection.
    - **ADR 003**: Pre-Retrieval Query Rewriting & Fail-Open Fallback.
  - Latest benchmark evaluation metrics (100% Recall@5, 100% Supersession Accuracy, 100% Abstention Correctness, 57.1% Faithfulness).
  - Known limitations and reconciled roadmap.

### 5. Workstream E & F — Repository Hygiene & Single-Command Setup
- Created `docs/PROJECT_HISTORY.md` and consolidated past phase logs into `docs/phases/`.
- Created `start-dev.ps1` PowerShell script as local development runner.

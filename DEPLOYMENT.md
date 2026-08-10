# KnowledgeIQ Production Deployment Guide

*Searched and updated for current Railway, Render, and Cloud PaaS docs on August 10, 2026.*

---

## 📌 Executive Summary & Multi-Container Hosting Landscape

KnowledgeIQ is packaged as a 5-container architecture (`docker-compose.yml`):
1. **Frontend**: Static React/Vite SPA served via Nginx on port 80/5173.
2. **API Gateway**: Node.js REST API & business orchestrator on port 5000.
3. **Embedding Service**: Python gRPC service for document preprocessing, chunking, PyTorch embeddings, SpaCy parsing, and Neural Cross-Encoder Reranking on port 50052.
4. **LLM Service**: Python gRPC service for LLM Provider Failover (Groq -> Gemini -> OpenRouter -> Claude) and Query Rewriting on port 50053.
5. **MinIO**: Local S3-compatible raw document storage on ports 9000 & 9001.

### 🌐 Cloud Platform Evaluation (August 2026 Status)

| Platform | Multi-Container `docker-compose` Support | Free Tier Status (August 2026) | Recommended Deployment Strategy |
|---|---|---|---|
| **Oracle Cloud Infrastructure** | ✅ **Native** (Full Linux VM) | ✅ **Always Free** (Ampere ARM 4-core / 24GB RAM) | **Top Choice**: Clone repo & run `docker compose up --build -d`. |
| **Coolify / Dokploy (Self-Hosted)** | ✅ **Native** (PaaS UI on cheap VPS) | ✅ **Open Source / Free** | Run Coolify on a $5/mo VPS or Oracle Cloud VM to deploy natively via Git. |
| **Railway** | ❌ Separate Service Containers | ⚠️ $5 Trial Credit (30 Days) | Deploy 4 individual Services in one Railway Project; link via Private Networking. |
| **Render** | ❌ Requires `render.yaml` Blueprint | ⚠️ Free Static/Web Tier (15-min idle sleep) | Create 4 Render Web Services via a `render.yaml` Blueprint specification. |

---

## 🚀 Option 1: Native Docker Compose Deployment (Oracle Cloud / VPS / Coolify)

This is the cleanest, zero-code-change production deployment method.

### Step 1: Provision Server & Install Docker
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
```

### Step 2: Clone Repository & Create Production `.env`
```bash
git clone https://github.com/SiddharthSurana11/knowledgeiq.git
cd knowledgeiq
```
Create `.env` file at root or populate each service's `.env`:
- `apps/api-gateway/.env`
- `apps/embedding-service/.env`
- `apps/llm-service/.env`

### Step 3: Launch Full Container Stack
```bash
docker compose up --build -d
```
Verify running health status:
```bash
docker compose ps
```

---

## 🛠️ Option 2: Managed Cloud Deployment (Railway / Render Service Decomposition)

Because Railway and Render do not run a single `docker-compose.yml` file out of the box, the 4 application services must be created as individual services within the platform dashboard.

### 1. API Gateway Service
- **Build Context**: `apps/api-gateway`
- **Port**: `5000`
- **Environment Variables**:
  - `PORT=5000`
  - `MONGODB_URI=<your_mongodb_atlas_uri>`
  - `MONGODB_DB=knowledgeiq`
  - `PINECONE_API_KEY=<your_pinecone_key>`
  - `PINECONE_INDEX=knowledgeiq`
  - `STORAGE_PROVIDER=minio`
  - `MINIO_ENDPOINT=<minio_service_host>:9000`
  - `MINIO_BUCKET=knowledgeiq`
  - `MINIO_ACCESS_KEY=<minio_access_key>`
  - `MINIO_SECRET_KEY=<minio_secret_key>`
  - `EMBEDDING_GRPC_HOST=<embedding_service_host>:50052`
  - `LLM_GRPC_HOST=<llm_service_host>:50053`
  - `AUTH_ENABLED=true`
  - `JWT_SECRET=<strong_production_secret>`
  - `QUERY_REWRITE_ENABLED=true`

### 2. Embedding Service
- **Build Context**: `apps/embedding-service`
- **Port**: `50052` (gRPC)
- **Environment Variables**:
  - `EMBEDDING_GRPC_HOST=0.0.0.0:50052`
  - `PINECONE_API_KEY=<your_pinecone_key>`
  - `PINECONE_INDEX=knowledgeiq`
  - `MONGODB_URI=<your_mongodb_atlas_uri>`
  - `MONGODB_DB=knowledgeiq`
  - `MINIO_ENDPOINT=<minio_service_host>:9000`

### 3. LLM Failover Service
- **Build Context**: `apps/llm-service`
- **Port**: `50053` (gRPC)
- **Environment Variables**:
  - `LLM_GRPC_HOST=0.0.0.0:50053`
  - `LLM_PROVIDER_ORDER=groq,gemini,openrouter,claude`
  - `GROQ_API_KEY=<your_groq_key>`
  - `GEMINI_API_KEY=<your_gemini_key>`
  - `OPENROUTER_API_KEY=<your_openrouter_key>`
  - `ANTHROPIC_API_KEY=<your_anthropic_key>`
  - `MONGODB_URI=<your_mongodb_atlas_uri>`
  - `MONGODB_DB=knowledgeiq`

### 4. Frontend Service
- **Build Context**: `apps/frontend_reactjs`
- **Port**: `80`
- **Environment Variables**:
  - `VITE_API_GATEWAY_URL=https://<api-gateway-public-url>`

---

## 🔒 Production Security Checklist

1. **Authentication**: Set `AUTH_ENABLED=true` and supply a strong random `JWT_SECRET`.
2. **CORS Origins**: Set `CORS_TRUSTED_ORIGINS=https://<your-frontend-domain>` in API Gateway configuration.
3. **Database Security**: Ensure MongoDB Atlas IP Access List strictly allows your production deployment server IPs.
4. **MinIO Credentials**: Replace default `minioadmin`/`minioadmin` with strong generated credentials before public exposure.

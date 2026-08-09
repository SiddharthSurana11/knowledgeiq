# KnowledgeIQ Architecture

## Overview
KnowledgeIQ is an enterprise Retrieval-Augmented Generation (RAG) platform built with a modular microservices architecture. It enables users to upload documents (PDF, Word, etc.), processes them for vector embedding, stores metadata with governance checks, and provides an LLM-powered chat interface for retrieval.

## System Components

### 1. API Gateway (Node.js/Express)
The central orchestrator and entry point for all client requests.
- **Role**: Handles HTTP requests, authentication (if added), payload validation, and request tracing.
- **Integrations**: Communicates with MongoDB (metadata), MinIO (object storage), and delegates heavy lifting to Python gRPC services.
- **Key Routes**:
  - `/api/upload`: Orchestrates the ingestion pipeline.
  - `/api/chat`: Orchestrates the retrieval and generation pipeline.

### 2. Embedding Service (Python/gRPC)
- **Role**: Processes document files, extracts text, chunks the text, and generates dense vector embeddings using Sentence Transformers.
- **Integration**: Upserts vectors directly into Pinecone.

### 3. LLM Service (Python/gRPC)
- **Role**: Takes user queries and retrieved context from Pinecone to generate natural language answers using OpenRouter models.

### 4. Storage & Persistence
- **MongoDB Atlas**: Stores document metadata, governance records (trust scores, duplicate status), and chat history.
- **MinIO**: S3-compatible object storage for raw uploaded files.
- **Pinecone**: Vector database for similarity search during retrieval.

## Data Flow: Ingestion (Upload)
1. User uploads a file via the React Frontend.
2. API Gateway validates the payload, generates a Correlation ID, and checks for exact duplicates via `DuplicateDetectionService`.
3. The file is streamed to MinIO.
4. API Gateway calls the gRPC Embedding Service with the file path.
5. Embedding Service chunks and embeds the text, then upserts to Pinecone.
6. API Gateway runs `TrustScoreService` and saves the final document metadata to MongoDB.

## Data Flow: Retrieval (Chat)
1. User submits a query.
2. API Gateway requests relevant chunks from Pinecone (Top K).
3. Retrieved chunks and conversation history are sent to the gRPC LLM Service.
4. LLM Service generates an answer.
5. API Gateway logs the query stats and returns the answer to the user.

# ADR 003: Pre-Retrieval LLM Query Rewriting & Fail-Open Execution Design

- **Status**: Approved
- **Date**: 2026-08-10
- **Deciders**: Architecture & Core RAG Team

## Context
During systemic RAG performance audits, a key gap was identified in KnowledgeIQ's retrieval pipeline: raw user input queries were passed directly to vector embedding and BM25 tokenization. In multi-turn chat sessions, follow-up queries containing pronouns or implicit references (e.g. *"What are the requirements under that policy?"*) suffered from degraded retrieval accuracy because the search string lacked standalone context.

To achieve maximum retrieval precision without modifying downstream document chunking or breaking ground-truth test evaluation sets (`eval/gold_set.json`), a pre-retrieval Query Rewriting step was designed.

## Decision
KnowledgeIQ adopts a pre-retrieval LLM Query Rewriter step preceding document retrieval in `apps/api-gateway/routes/chatRoute.js`.

1. **Pre-Retrieval Transformation**:
   Before calling `getRelevantChunks()`, the API Gateway extracts recent conversation history (`memory_block`) and passes the raw query + history to the LLM via the gRPC `AnalyzeContent` RPC method.
2. **Provider Failover Reuse**:
   The Query Rewriter reuses the existing `FailoverProviderChain` (Groq -> Gemini -> OpenRouter) with a short, deterministic system prompt instructing the model to output a single, standalone, search-optimized query.
3. **Fail-Open Architecture**:
   The query rewrite call is wrapped in a strict 3.5-second timeout (`QUERY_REWRITE_TIMEOUT_MS`). If the LLM rewrite call times out, errors, or provider rate limits are exhausted, the system automatically **fails open**, using the original raw user message for retrieval. The chat workflow is never blocked by a query rewrite failure.
4. **Environment Feature Flag**:
   Controlled by `QUERY_REWRITE_ENABLED` (default: `true`). Disabling the flag bypasses query rewriting instantly without code modifications.
5. **Observability**:
   Both the raw user query and the rewritten search query are logged in structured JSON logs (`logger.chatLog`) and OpenTelemetry spans (`chat.query_rewrite`).

## Consequences
- **Improved Multi-Turn Search Accuracy**: Follow-up queries with ambiguous pronouns/references are automatically resolved into explicit search strings before Pinecone/BM25 retrieval.
- **Resilience**: Fail-open design guarantees zero uptime impact or chat failures if upstream LLM providers suffer rate limits or latency spikes.
- **Zero Invalidation**: Downstream vector stores, cross-encoder rerankers, trust score calculators, and evaluation gold sets remain 100% unchanged.

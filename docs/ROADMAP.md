# KnowledgeIQ Product & Technical Roadmap

This roadmap documents the strategic evolution of the **KnowledgeIQ** Document Intelligence Platform, tracking active features, current architecture choices, and deferred design items.

---

## 🎯 Active Features & Architecture Baseline

1. **Hybrid Retrieval Engine**:
   - Dense vector similarity (Pinecone) combined with sparse BM25 keyword matching (`scoreBM25`).
   - Reciprocal Rank Fusion (RRF, $k=60$) candidate merging.
2. **Two-Stage Neural Reranking**:
   - Second-stage neural cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) via gRPC with Sigmoid score normalization.
3. **Query Rewriting & Context Disambiguation**:
   - Pre-retrieval LLM Query Rewriter step resolving pronouns, references, and implicit multi-turn context into standalone search queries.
   - Fail-open execution with 3.5s timeout (`QUERY_REWRITE_ENABLED`).
4. **Hallucination & Quality Safeguards**:
   - Confidence threshold guards, contradiction detection engine, document trust scoring, and automated evaluation harness (`eval/run_eval.py`).

---

## 📌 Designed, Not Yet Built (Deferred Architectural Items)

### 1. GraphRAG & Knowledge Graph Traversal
* **Description**: Building entity-relationship knowledge graphs from ingested documents to enable graph-based traversal for complex multi-entity relation queries (e.g., *"How does policy X impact system Y across departments Z?"*).
* **Rationale for Deferral**: High implementation complexity and latency overhead. The current hybrid RRF + cross-encoder reranking engine already achieves 100% Recall@5 on enterprise document evaluation sets.

### 2. Semantic & Structural Chunking (Embedding-Similarity & Header Splitting)
* **Description**: Transitioning from fixed-size sliding-window token chunking (`tiktoken` 800 tokens / 100 overlap) to dynamic semantic chunking (splitting documents where sentence-to-sentence embedding cosine similarity drops below a threshold or at Markdown header boundaries).
* **Rationale for Deferral**: Implementing semantic chunking requires completely re-extracting, re-chunking, and re-embedding every active document in the vector store. This would invalidate the ground-truth chunk IDs and text spans in the automated evaluation dataset (`eval/gold_set.json`) and incur substantial embedding re-processing costs. Fixed token sliding windows with 100-token overlap currently provide full context coverage.

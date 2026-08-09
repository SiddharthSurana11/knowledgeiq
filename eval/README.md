# KnowledgeIQ Evaluation Harness

## Overview

This is an **offline evaluation tool** that measures retrieval and generation quality
of the KnowledgeIQ RAG pipeline against a gold-standard test set. It is NOT a running
service — you execute it manually when you want to benchmark the system.

## Prerequisites

Before running, ensure:

1. **All three services are running**:
   - API Gateway (`npm run dev` in `apps/api-gateway`)
   - Embedding Service (`python app.py` in `apps/embedding-service`)
   - LLM Service (`python app.py` in `apps/llm-service`)

2. **Documents are uploaded**: The gold set references documents by `documentId`.
   Upload your test PDFs first, then update `gold_set.json` with real IDs.

3. **Authentication**: If `AUTH_ENABLED=true` in the API gateway, you need a valid JWT:
   ```bash
   # Option A: Set env var
   set EVAL_JWT_TOKEN=your_jwt_token_here

   # Option B: Run gateway with auth disabled for eval
   # Set AUTH_ENABLED=false in apps/api-gateway/.env, restart gateway
   ```

## Step 1: Prepare the Gold Set

Edit `eval/gold_set.json`. Each entry needs:

| Field | Description |
|---|---|
| `query` | The test question to ask |
| `expected_documentId` | The MongoDB `documentId` of the document that should be retrieved |
| `expected_answer_contains` | A keyword that should appear in the response |
| `category` | Document category (compliance, hr, finance, it, operations) |
| `test_type` | `standard`, `supersession`, or `no_answer_expected` |

### How to find documentIds

Query your MongoDB `documents` collection:
```javascript
// In mongosh or MongoDB Compass:
db.documents.find({}, { documentId: 1, filename: 1, category: 1, status: 1 })
```

### Test Types

- **`standard`**: Normal retrieval + generation. Checks Recall@5 and faithfulness.
- **`supersession`**: Verifies the system retrieves the CURRENT version of a document,
  not a superseded/stale copy. Requires you to have uploaded both old and new versions.
- **`no_answer_expected`**: Out-of-domain queries where the hallucination guard should
  trigger `isRefusal=true`. No documentId needed.

> ⚠️ **IMPORTANT**: All entries with `expected_documentId: "PLACEHOLDER_REPLACE_ME"`
> will produce meaningless Recall@5 scores. You MUST replace these with real documentIds
> before the numbers mean anything.

## Step 2: Run the Evaluation

```bash
cd ai-chatbot-project/eval

# Basic run
python run_eval.py

# Custom API URL
python run_eval.py --api-url http://localhost:5000

# With JWT token
python run_eval.py --jwt-token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Interpret Results

### Stdout Summary Table

```
============================================================
  KnowledgeIQ Evaluation Results — current config
============================================================
  Metric                              Score          Detail
  ──────────────────────────────────  ────────────── ────────
  Recall@5                              80.0%          8/10
  Supersession Accuracy                100.0%           3/3
  Abstention Correctness               100.0%           3/3
  Faithfulness Proxy                    70.0%          7/10
  ──────────────────────────────────  ────────────── ────────
  Total Queries                            18
  Successful                               18
  Errors                                    0
  Avg Latency                          2340ms
  P95 Latency                          5200ms
============================================================
```

### Metrics Explained

| Metric | What it measures |
|---|---|
| **Recall@5** | Did the expected document appear in the top 5 retrieved chunks? Higher = better retrieval. |
| **Supersession Accuracy** | For versioned documents, did we retrieve the CURRENT version (not superseded)? |
| **Abstention Correctness** | For out-of-domain queries, did the hallucination guard correctly refuse? Uses the actual `isRefusal` boolean. |
| **Faithfulness Proxy** | Does the expected keyword appear in the generated answer? This is a lightweight proxy — not full LLM-as-judge faithfulness scoring (that would be a future enhancement using RAGAS or TruLens). |

### Results JSON

Full results are saved to `eval/results_YYYYMMDD.json` with per-query details and
the summary block.

## Step 4: Compare Hybrid vs Legacy

To produce a before/after comparison:

1. Set `HYBRID_RETRIEVAL_ENABLED=true` in `apps/api-gateway/.env`
2. Restart API gateway
3. Run: `python run_eval.py` → saves `results_YYYYMMDD.json`
4. Set `HYBRID_RETRIEVAL_ENABLED=false` in `apps/api-gateway/.env`
5. Restart API gateway
6. Run: `python run_eval.py` → saves another `results_YYYYMMDD.json` (rename first one to avoid overwrite)
7. Compare the two summary blocks

## Dependencies

The eval script uses only standard Python + `requests` + optionally `pymongo`:

```bash
pip install requests pymongo
```

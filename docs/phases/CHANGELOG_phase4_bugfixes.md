# Phase 4 Production Bug Fixes Changelog

This document details the critical production bug fixes implemented following empirical evaluation harness diagnostics.

---

## 1. BUG 1 (CRITICAL): LLM Provider Exception Propagation & Failover Fix

### Issue
Previously, LLM providers (`GroqProvider.py`, `OpenRouterProvider.py`, `ClaudeProvider.py`) caught HTTP/API exceptions and returned string error messages (e.g., `"Sorry, the system encountered an issue while processing your request."`) instead of raising exceptions. As a result:
- `FailoverProviderChain` treated error strings as valid completions.
- Failover to fallback models (`gemini`, `openrouter`) never triggered when the primary provider (`groq`) failed.

### Fix Implemented
- **`apps/llm-service/llm/GroqProvider.py`**: Updated exception block to `raise e` on HTTP and request errors.
- **`apps/llm-service/llm/OpenRouterProvider.py`**: Updated exception blocks to `raise e` on `HTTPError` and `RequestException`.
- **`apps/llm-service/llm/ClaudeProvider.py`**: Updated exception block to `raise e` on `RequestException`.
- **`apps/llm-service/llm/GeminiProvider.py`**: Verified already raising exceptions properly.
- **`apps/llm-service/llm/index.py`**: Expanded `is_transient` failover keywords in `FailoverProviderChain` to include `"401"`, `"403"`, `"unauthorized"`, `"forbidden"`, `"invalid"`, `"auth"`, `"api key"`, `"quota"`, `"exceeded"`, and `"http"`. Any provider authentication, rate-limit, server, or network error now triggers smooth failover to the next configured provider.

### Verification
Tested by misconfiguring `GROQ_API_KEY`. Confirmed via logs that `GroqProvider` 401 failure was caught, logged as a failover metric, and the chain automatically advanced to the next provider.

---

## 2. BUG 2: Hallucination Guard Relevance Floor Fix

### Issue
In `apps/api-gateway/routes/chatRoute.js`, the hallucination guard bypass logic (`allowBypass = chunks.length >= 3 && topResultTrustScore >= 85`) allowed refusal checks to be skipped based solely on candidate chunk count and document trust score, without enforcing a minimum semantic relevance floor. Out-of-domain queries (e.g., pizza recipes scoring 16% similarity) bypassed refusal because 5 chunks were returned from a trusted document (`trustScore = 100`).

### Fix Implemented
- **`apps/api-gateway/config/index.js`**: Added `absoluteConfidenceFloor` to `config.retrieval` (defaults to `0.35` / 35%, configurable via `ABSOLUTE_CONFIDENCE_FLOOR` env var).
- **`apps/api-gateway/routes/chatRoute.js`**: Enforced `topScore < absoluteFloor` before considering `allowBypass`:
  ```javascript
  const absoluteFloor = config.retrieval?.absoluteConfidenceFloor || 0.35;
  if (topScore < absoluteFloor || (!allowBypass && (chunks.length < minChunks || topScore < minConfidence || topResultTrustScore < minTrustScore))) {
    isRefusal = true;
  }
  ```
- Any query with top vector similarity below 35% is **always refused**, regardless of document trust score or candidate chunk count.

---

## 3. BUG 3: Hyphenated Number Range Preprocessing Fix

### Issue
In `apps/embedding-service/modules/chunking/data_preprocessing.py`, the `clean_text` punctuation regex stripped hyphens without inserting spaces, converting `"5-6 years"` into `"56 years"`.

### Fix Implemented
- **`apps/embedding-service/modules/chunking/data_preprocessing.py`**: Added regex replacement before control character stripping:
  ```python
  text = re.sub(r'(?<=\d)-(?=\d)', ' ', text)
  ```
- Replaces hyphens between digits with spaces (e.g., `"5-6"` $\rightarrow$ `"5 6"`), while leaving non-numeric hyphens (e.g., `"cost-effective"`, `"well-designed"`) untouched.
- **Note**: This fix affects all future document uploads. Pre-existing ingested documents require re-ingestion to reflect corrected chunk text.

---

## Files Modified Summary

| File | Modification Summary |
| :--- | :--- |
| `apps/llm-service/llm/GroqProvider.py` | Raised exceptions on API failure |
| `apps/llm-service/llm/OpenRouterProvider.py` | Raised exceptions on API failure |
| `apps/llm-service/llm/ClaudeProvider.py` | Raised exceptions on API failure |
| `apps/llm-service/llm/index.py` | Expanded `is_transient` failover keywords |
| `apps/api-gateway/config/index.js` | Added `absoluteConfidenceFloor` config |
| `apps/api-gateway/routes/chatRoute.js` | Enforced absolute floor in hallucination guard |
| `apps/embedding-service/modules/chunking/data_preprocessing.py` | Fixed digit range hyphen merging in `clean_text` |
| `apps/llm-service/.env` | Updated `OPENROUTER_MODEL` to `google/gemma-4-26b-a4b-it:free` |
| `apps/llm-service/llm/OpenRouterProvider.py` | Updated `_DEFAULT_MODEL` to `google/gemma-4-26b-a4b-it:free` |

---

## 4. OpenRouter Model Selection & Infrastructure Cost Constraints

### OpenRouter Free Model Update
- **`OPENROUTER_MODEL`**: Updated to `google/gemma-4-26b-a4b-it:free` in `apps/llm-service/.env`, `.env.example`, and `OpenRouterProvider.py`.
- **Note**: Free model IDs on OpenRouter change without notice as upstream providers delist or rename endpoints (e.g. `meta-llama/llama-3.3-70b-instruct:free` returning `404 Not Found`). The active free models list should be spot-checked periodically via `https://openrouter.ai/api/v1/models`.

### Known Infrastructure Limitation
This system operates on free-tier LLM provider quotas. Under sustained or bursty load, all three providers in the failover chain can become temporarily rate-limited simultaneously, resulting in a small number of failed requests. This is an infrastructure cost constraint, not an architecture defect — the failover chain itself is verified working correctly (see Phase 4 diagnostic logs).

---

## 5. Pre-Phase 5 Silent Upload Failure & Telemetry Fixes

### Bug 1: Extraction Failure Propagation & Local Dev OCR Documentation
- **Root Cause**: `Microsoft-Policymaker-Guide-Privacy.pdf` contains image-based pages requiring Tesseract OCR. On Windows dev setups without native Tesseract binaries installed in system `PATH`, `extract_text` raises `"No text extracted."`. Previously, `uploadRoute.js` caught embedding failures but still executed `UPLOAD_COMPLETED` and returned HTTP 200 `status: "completed"`, leaving `finalDoc` `null` and masking failures.
- **Fix Implemented**:
  - `apps/api-gateway/routes/uploadRoute.js`: Updated gRPC callback to check `if (err || !response || response.getStatus() !== 'completed')`. On failure, logs `UPLOAD_FAILED`, skips metadata persistence, and passes HTTP 422 error (`"Document processing failed — no extractable text found."`) to `next(err)` so `UploadPanel.jsx` surfaces an explicit error banner.
  - Local Dev Windows Setup: Documented `choco install tesseract` and PATH configuration in `README.md`.

### Bug 2: Duplicate Detection Failure Logging & Isolation
- **Root Cause**: When duplicate check failed during text extraction or gRPC errors, `DuplicateDetectionService.js` caught the error, logged `❌ Failed semantic duplicate detection check`, but returned `duplicateStatus: 'UNIQUE'`. `uploadRoute.js` then logged `DUPLICATE_DETECTION_COMPLETED` immediately after.
- **Fix Implemented**:
  - `apps/api-gateway/services/duplicateDetectionService.js`: Updated gRPC failure handling to rethrow extraction failures (`err.isExtractionFailure = true`), and set `duplicateStatus: 'CHECK_FAILED'` for vector index timeouts.
  - `apps/api-gateway/routes/uploadRoute.js`: Wrapped duplicate detection in a `try/catch`. On extraction error, immediately aborts the upload pipeline before MinIO upload or contradiction job enqueueing, logging `DUPLICATE_DETECTION_FAILED`.

### Bug 3: OTel Span Provider & Token Attribution Fix
- **Root Cause**: `chatRoute.js` checked `reply.telemetryJson` (camelCase) while `llmClient.js` resolved `telemetry_json` (snake_case), causing `telemetry` to resolve to `{}` and setting `'llm.provider': 'unknown'`, `'llm.prompt_tokens': 0`, `'llm.completion_tokens': 0`.
- **Fix Implemented**:
  - `apps/api-gateway/routes/chatRoute.js`: Updated to handle both `reply.telemetryJson` and `reply.telemetry_json`, parsing `provider_name`, `prompt_tokens`, and `completion_tokens`.
  - `apps/llm-service/llm/GroqProvider.py`, `OpenRouterProvider.py`, `GeminiProvider.py`, `ClaudeProvider.py`: Extracted token usage from API responses (`prompt_tokens`, `completion_tokens`, `total_tokens`) and set `provider_name` in `telemetry_bag`.

---

## 📌 Critical Requirement Flag for Phase 5 Containerization
- **Phase 5 Workstream A Dockerfile Requirement**: The upcoming `apps/embedding-service` Dockerfile MUST install native OCR binaries via `apt-get install -y tesseract-ocr tesseract-ocr-eng` in addition to python dependencies so scanned PDF uploads succeed seamlessly inside containers.



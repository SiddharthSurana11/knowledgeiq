# Provider Configuration & Credential Audit Fix Changelog

---

## 1. Reversion of Multi-Key / Multi-Account Pooling (`GeminiProvider.py`)

- **Reverted Multi-Key Pooling**: Reverted `GeminiProvider.py` back to a single `GEMINI_API_KEY` string.
- **Removed Key Rotation**: Removed `self._api_keys` array, comma-splitting, and automatic rotation loop on HTTP 429 rate limits.
- **Compliance Rationale**: Creating multiple user accounts or rotating multiple keys to bypass per-account rate limits violates Google AI Studio and Groq Terms of Service. Such practices risk immediate account suspension without warning. Transient 429 rate limits are now cleanly raised to `FailoverProviderChain` to switch to the next legitimate provider in `LLM_PROVIDER_ORDER`.

---

## 2. Model & Provider Routing Fixes

- **Groq Primary Model (`GROQ_MODEL`)**: Set to `llama-3.1-8b-instant` as the primary high-throughput model for production volume due to its high daily request and token ceilings. Documented that `llama-3.3-70b-versatile` remains selectable via config for low-volume high-reasoning tasks, but has a significantly lower daily request/token cap.
- **OpenRouter Fallback Model (`OPENROUTER_MODEL`)**: Pinned to `meta-llama/llama-3.3-70b-instruct:free` as a legitimate fallback provider. Added documentation noting that OpenRouter free-tier models operate behind a shared public queue with variable latency.
- **Failover Chain Alignment (`LLM_PROVIDER_ORDER`)**: Confirmed `LLM_PROVIDER_ORDER=groq,gemini,openrouter` in `.env` and `.env.example`, matching the architectural `FailoverProviderChain` logic.

---

## 3. Credential Hygiene Audit Findings

- **`.gitignore` Verification**: Confirmed `.gitignore` at the repository root properly ignores `.env`, `**/.env`, `*.env.local`, `*.env.production`, and secret files across all applications.
- **Git History & Tracked Files Audit**: Conducted an exhaustive regex search (`sk-`, `gsk_`, `AIza`, `AQ.`, `pcsk_`) across tracked git files and git history (`git log -p -G ...`).
- **Audit Finding**: **ZERO API keys or credentials were ever committed to git history.** All `.env` files remain safely un-tracked by git.
- **`.env.example` Verification**: Verified that `.env.example` templates contain only safe placeholder values (e.g. `<your-groq-api-key>`, `<your-google-api-key>`).

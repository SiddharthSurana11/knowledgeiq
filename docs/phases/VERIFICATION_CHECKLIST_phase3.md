# Phase 3 Manual Verification Checklist

Use this checklist to manually verify the Knowledge Health & Analytics Dashboard, Supersession Metadata, and Backend Aggregation Endpoints.

---

### 1. Workstream A: Supersession & Freshness Metadata Verification

- [ ] **Test Case 1.1: Document Re-Upload & Supersession Status**
  - Upload a document (e.g. `policy_v1.pdf` under category `compliance`).
  - Verify MongoDB `documents` collection record:
    - `status: "active"`
    - `version: 1`
    - `effectiveDate` is set to upload timestamp.
    - `supersedes: null`
  - Re-upload the exact same filename `policy_v1.pdf` under category `compliance` with modified text.
  - Verify MongoDB `documents` collection records:
    - **Original document record**: `status` updated to `"superseded"`, Pinecone vectors deleted.
    - **Replacement document record**: `status: "active"`, `version: 2`, `supersedes` set to original document's `documentId`, `effectiveDate` set to second upload timestamp.
    - **Trust score of old version**: `trustBreakdown.statusPenalty` equals `20` due to `superseded` status.

---

### 2. Workstream B: Backend Aggregation Endpoints Verification

- [ ] **Test Case 2.1: `GET /api/health/stats` Aggregation Correctness**
  - Issue `GET /api/health/stats` (with valid auth token if auth enabled).
  - Verify response structure:
    - `trust.average`, `trust.min`, `trust.max`, `trust.distribution` (`0-40`, `40-70`, `70-100` buckets).
    - `contradictionJobs`: counts for `pending`, `processing`, `completed`, `failed`.
    - `duplicates`: `nearDuplicates`, `partialDuplicates`, `total`.
    - `freshness`: `supersededCount`, `staleCount`, `staleThresholdDays` (defaults to `180`).
    - `categoryBreakdown`: per-category doc counts, avg trust, min/max trust, contradiction count, duplicate count, stale count, superseded count.
  - Cross-check numbers against actual MongoDB document counts to ensure `$facet` calculations match.

- [ ] **Test Case 2.2: `GET /api/health/issues` Flat Issue List**
  - Issue `GET /api/health/issues`.
  - Verify items include documents with active contradictions, unresolved duplicates, or stale effective dates.
  - Each item contains `documentId`, `filename`, `category`, `issueType` (`CONTRADICTION`, `DUPLICATE`, `STALE`), `severity`, and `timestamp`.
  - Verify sorting: `high` severity items appear first.

- [ ] **Test Case 2.3: Configurable Stale Threshold (`STALE_THRESHOLD_DAYS`)**
  - Set `STALE_THRESHOLD_DAYS=30` in `.env` and restart API Gateway.
  - Issue `GET /api/health/stats`.
  - Verify `freshness.staleThresholdDays` returns `30` and `staleCount` reflects documents older than 30 days.
  - Reset `STALE_THRESHOLD_DAYS` back to `180` (or unset), restart, and confirm threshold updates.

---

### 3. Workstream C: Knowledge Health Dashboard UI Verification

- [ ] **Test Case 3.1: Navigation & Layout**
  - Open the frontend application in browser.
  - Verify the sidebar includes **Knowledge Health** (`/knowledge-health`) with the `ShieldCheck` icon.
  - Click **Knowledge Health**. Verify the page loads cleanly without visual glitches.

- [ ] **Test Case 3.2: KPI Cards & Data Rendering**
  - Verify 5 KPI cards at top of page render live data:
    1. Average Trust Score
    2. Active Contradictions
    3. Pending Contradiction Checks
    4. Duplicate Documents
    5. Stale Documents
  - Verify Trust Score Distribution bars reflect document proportions.

- [ ] **Test Case 3.3: Category Breakdown Table**
  - Verify table lists all categories with total docs, avg trust, contradictions, duplicates, stale, and superseded counts.

- [ ] **Test Case 3.4: Issues Table & Column Sorting**
  - Verify the **Issues Requiring Attention** table lists actionable documents with color-coded badges (`CONTRADICTION` in red, `DUPLICATE` in orange, `STALE` in yellow).
  - Click table headers (**Filename**, **Category**, **Issue Type**, **Timestamp**) and verify column sorting toggles ascending/descending.

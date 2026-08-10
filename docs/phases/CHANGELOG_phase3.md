# Phase 3 Changelog: Knowledge Health & Analytics Dashboard

---

## Workstream A: Supersession / Freshness Metadata

### [MODIFY] `apps/api-gateway/config/index.js`
- Added `governance.staleThresholdDays` (env: `STALE_THRESHOLD_DAYS`, default: `180`).

### [MODIFY] `apps/api-gateway/services/documentService.js`
- **`prepareDocumentUpload()`**: On re-upload detection (`existingDoc !== null`):
  - Marks old document as `status: 'superseded'` via `updateOne()`.
  - Generates a new UUID for the replacement document (previously reused the old documentId).
  - Returns `supersedes: existingDoc.documentId` for the new document.
- **`saveDocumentMetadata()`**: Added `effectiveDate` (defaults to upload timestamp) and `supersedes` (null for first uploads) fields to the persisted document schema.

### [MODIFY] `apps/api-gateway/routes/uploadRoute.js`
- Passes `effectiveDate: new Date()` and `supersedes: docPrep.supersedes || null` through to `saveDocumentMetadata()`.

### [MODIFY] `apps/api-gateway/services/trustScoreService.js`
- Extended status penalty check (Section 5) to include `'superseded'` alongside `'archived'` — both receive a 20-point penalty.

---

## Workstream B: Backend Aggregation Endpoints

### [NEW] `apps/api-gateway/routes/healthStats.js`
New route file mounted at `/api/health` behind `authMiddleware` + `standardLimiter`.

- **`GET /api/health/stats`**: Two separate MongoDB aggregation calls:
  1. `$facet` on `documents` collection — trust score distribution (avg/min/max + 0-40/40-70/70-100 buckets), duplicate counts, freshness/stale counts, per-category breakdown.
  2. `$group` on `contradiction_jobs` collection — job status counts (pending/processing/completed/failed).
  Results merged into one response object.

- **`GET /api/health/issues`**: Flat list of actionable items from `documents` collection — contradictions, duplicates, and stale documents with `documentId`, `filename`, `category`, `issueType`, `severity`, and `timestamp`. Sorted by severity then timestamp.

### [MODIFY] `apps/api-gateway/server.js`
- Imported and mounted `healthStatsRoute` at `/api/health` (line 85).
- Added compound index `{ status: 1, contradictionStatus: 1, duplicateStatus: 1 }` creation on startup (idempotent, `background: true`).

### `apps/api-gateway/routes/healthRoute.js` — NO CHANGES
The existing liveness probe at `GET /health` is untouched.

---

## Workstream C: Dashboard UI

### [NEW] `apps/frontend_reactjs/src/components/KnowledgeHealth.jsx`
New Knowledge Health dashboard page with:
- **KPI Cards**: Avg trust score, active contradictions, pending contradiction checks, duplicate count, stale document count.
- **Trust Score Distribution**: Visual bar breakdown across 0-40, 40-70, 70-100 ranges.
- **Category Breakdown Table**: Per-category doc count, avg trust, contradictions, duplicates, stale, superseded counts.
- **Issues Table**: Sortable by filename, category, issue type, or timestamp. Color-coded badges (red = CONTRADICTION, orange = DUPLICATE, yellow = STALE).
- **Contradiction Pipeline Status**: Pending/Processing/Completed/Failed job counts.

### [MODIFY] `apps/frontend_reactjs/src/main.jsx`
- Added `/knowledge-health` route pointing to `KnowledgeHealth` component.

### [MODIFY] `apps/frontend_reactjs/src/components/layout/Sidebar.jsx`
- Added `ShieldCheck` import from `lucide-react`.
- Added `{ label: 'Knowledge Health', path: '/knowledge-health', icon: <ShieldCheck /> }` to `navItems` array.

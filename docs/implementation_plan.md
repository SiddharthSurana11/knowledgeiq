# Implementation Plan: Sigma to KnowledgeIQ Migration

This document provides a detailed technical implementation roadmap to guide the transition from the domain-specific Sigma RAG codebase to the generalized **KnowledgeIQ** document intelligence platform.

---

## Feature Matrix & Impact Analysis

| Feature | Services Affected | Modified Files | DB Collections | Pinecone Metadata | gRPC Changes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Dynamic Categories** | Gateway, Embed, LLM, UI | Express server, pineconeClient, UploadPanel, prompt_instructions | `categories`, `resource_files` | `category` (slug value) | None |
| **2. Duplicate Detection** | Gateway, Embed, UI | embedding-service/app, server.js, UploadPanel | `knowledge_issues` | None | None |
| **3. Contradiction Detection**| Gateway, LLM, Embed | llm-service/app, response_generator, embedding-service/app, llmClient | `knowledge_issues` | None | **Modify** `llm_service.proto` (Add `CheckContradiction`) |
| **4. Trust Score Engine** | Gateway, UI | server.js, chatRoute, AdminPanel | `resource_files` | None | None |
| **5. Health Dashboard** | Gateway, UI | server.js, App.jsx, AdminPanel (refactored) | `knowledge_issues`, `resource_files` | None | None |
| **6. Freshness & Governance** | Gateway, LLM, Embed, UI | llm-service/app, server.js, embedder.py, AdminPanel | `resource_files`, `categories`, `users` | `ownerId`, `lastReviewedAt` | None |

---

## Execution Phases

### PHASE 1: Dynamic Categories & Schema Foundation
*   **Difficulty**: Low
*   **Effort Estimate**: 1.5 Days
*   **Dependencies**: Database access setup
*   **Risks**: Minor latency increase on initial configuration lookup.

#### Exact Files to Modify
1.  **[MODIFY] [server.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/server.js)**:
    *   Remove `getDriveFolderId` case statement.
    *   Implement database lookup: Query `categories` collection in MongoDB by `category` (slug key) to fetch `driveFolderId` dynamically.
    *   Create `GET /api/categories` route returning `_id, key, name, description` from MongoDB.
2.  **[MODIFY] [pineconeClient.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/utils/pineconeClient.js)**:
    *   Extend `getRelevantChunks(userQuery, topK = 5, categoryId = null)`.
    *   Add metadata query filter if `categoryId` is provided: `filter: { category: { "$eq": categoryId } }`.
3.  **[MODIFY] [chatRoute.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/routes/chatRoute.js)**:
    *   Extract `categoryId` from request body payload.
    *   Pass `categoryId` parameter down to `getRelevantChunks`.
4.  **[MODIFY] [vector_db_pinecone.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/embedding-service/modules/vectorDB/vector_db_pinecone.py)**:
    *   Delete the string matching `detect_category(query_text)` function.
5.  **[MODIFY] [UploadPanel.jsx](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/frontend_reactjs/src/components/UploadPanel.jsx)**:
    *   On mount, run `fetch('/api/categories')` and store in state.
    *   Replace individual hardcoded upload columns with a single file upload dropzone and a `<select>` dropdown populated dynamically by the category state.
6.  **[MODIFY] [prompt_instructions.txt](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/llm-service/prompt_instructions.txt)**:
    *   Generalize prompt: Replace "You are a smart assistant trained specifically on LMS, LOS, and LF Syndicate documents" with "You are KnowledgeIQ, a corporate smart assistant trained on internal documentation."

#### Exact Logic to Add
*   **Database Seeding Script**: Create a startup seed in MongoDB to populate initial category templates (`lms`, `los`, `syndicate`, `other`).
*   **Dynamic Folder Resolution**: Replace direct switch mapping in file upload handler with:
    ```js
    const categoryDoc = await db.collection('categories').findOne({ key: category });
    const folderId = categoryDoc ? categoryDoc.driveFolderId : process.env.GDRIVE_OTHER_FOLDER_ID;
    ```

---

### PHASE 2: Duplicate Ingestion Check & Trust Score Engine
*   **Difficulty**: Medium
*   **Effort Estimate**: 2 Days
*   **Dependencies**: Phase 1 dynamic uploads
*   **Risks**: Scanning high numbers of chunks against Pinecone during ingestion can slow down upload response times if not batch-processed.

#### Exact Files to Modify
1.  **[MODIFY] [app.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/embedding-service/app.py)**:
    *   In `HandleUpload`, add duplication scan block prior to upserting.
    *   Check cosine similarity of new chunk embeddings against Pinecone. If match exceeds $0.96$ similarity for $>70\%$ of chunks, abort and return `status="failed_duplicate"`.
2.  **[MODIFY] [vector_db_pinecone.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/embedding-service/modules/vectorDB/vector_db_pinecone.py)**:
    *   Implement helper function `check_existing_duplicates(chunk_embeddings)` to execute batch vector lookups on the Pinecone index.
3.  **[MODIFY] [server.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/server.js)**:
    *   In the `/api/upload` callback, inspect response status.
    *   If `failed_duplicate` is received, create an active conflict record in a new `knowledge_issues` collection, set status to `duplicate_flagged`, and return a `409 Conflict` to the client.
    *   Implement trust score calculation utilities. Compute on retrieval:
        $$\text{Score} = 80 - (\text{unowned ? 20 : 0}) - (\text{active_contradictions} \times 30) - (\text{thumbs_down} \times 2)$$
4.  **[MODIFY] [AdminPanel.jsx](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/frontend_reactjs/src/components/AdminPanel.jsx)**:
    *   Include a trust score progress bar badge next to each file block inside list view.

#### Exact Logic to Add
*   **Trust Aggregator Query**: In the gateway routes, calculate the trust score using MongoDB aggregation pipeline when retrieving document listings for the admin panel.

---

### PHASE 3: Contradiction Engine & gRPC Contract Updates
*   **Difficulty**: High
*   **Effort Estimate**: 3 Days
*   **Dependencies**: Phase 2 duplication checks, Protobuf compiler setup
*   **Risks**: Multi-chunk LLM calls during ingestion will increase API tokens usage and duration of upload pipeline.

#### Exact Files to Modify
1.  **[MODIFY] [llm_service.proto](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/protos/llm_service.proto)**:
    *   Add the `CheckContradiction` RPC endpoint and associated Request/Response messages.
2.  **[MODIFY] [app.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/llm-service/app.py)** (LLM Service):
    *   Expose the `CheckContradiction` gRPC method in `LLMServiceServicer`.
3.  **[MODIFY] [response_generator.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/llm-service/response_generator.py)**:
    *   Implement `evaluate_contradiction(chunk_a, chunk_b)`.
    *   Construct zero-shot audit prompt asking Claude to return JSON showing contradiction status and logical explanation.
4.  **[MODIFY] [llmClient.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/utils/llmClient.js)**:
    *   Add Javascript gRPC interface method `checkContradiction(textA, textB)` mapping to the newly compiled `llm_service_pb.js` bindings.
5.  **[MODIFY] [app.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/embedding-service/app.py)** (Embedding Service):
    *   In the post-upload flow, query Pinecone for chunk neighbors (similarity $0.70\text{--}0.90$).
    *   Call LLM Service via gRPC client to check for semantic contradictions. If confirmed, write a record to MongoDB `knowledge_issues`.

#### Exact Logic to Add
*   **gRPC Compilation**: Compile `llm_service.proto` for Python (`grpcio-tools`) and Node.js.
*   **Logical Parser**: Clean and validate Claude's JSON response block to guarantee parsing accuracy.

---

### PHASE 4: Freshness & Governance Scheduler
*   **Difficulty**: Medium
*   **Effort Estimate**: 2 Days
*   **Dependencies**: Phase 1 Schema changes
*   **Risks**: E-mail/Webhook flood if notifications aren't properly grouped/debounced.

#### Exact Files to Modify
1.  **[MODIFY] [app.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/llm-service/app.py)**:
    *   Extend `BackgroundScheduler` in the LLM service to run a daily task: `run_freshness_audit()`.
2.  **[MODIFY] [embedder.py](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/embedding-service/modules/vectorDB/embedder.py)**:
    *   Update `generate_embeddings(chunk_dicts)` to capture `ownerId` and `lastReviewedAt` and add them to the Pinecone metadata payload.
3.  **[MODIFY] [server.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/server.js)**:
    *   Implement `PUT /api/resources/:id/owner` to assign/transfer owners.
    *   Implement `POST /api/resources/:id/verify` to reset the audit date (`lastReviewedAt = new Date()`) and clear reminder flags.
    *   Implement decay calculation inside document retrieval routes:
        $$F = \max(0, 100 \times (1 - \text{days\_elapsed} / \text{review\_cycle}))$$

#### Exact Logic to Add
*   **Daily Freshness Scan Loop**: Python script executing MongoDB queries to locate documents where $F < 30\%$, toggling the `reviewReminderSent` flag, and posting notifications.

---

### PHASE 5: Health & Governance Dashboard UI
*   **Difficulty**: Medium
*   **Effort Estimate**: 2.5 Days
*   **Dependencies**: Phase 2 & 4 APIs
*   **Risks**: Polling overload. Polling intervals must be optimized.

#### Exact Files to Modify
1.  **[MODIFY] [server.js](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/api-gateway/server.js)**:
    *   Create route `GET /api/health/stats` aggregating dashboard KPIs (Ownership Coverage, Outdated Document count, Global Trust Average).
    *   Create route `GET /api/health/issues` listing active records from the `knowledge_issues` collection.
    *   Create route `POST /api/health/issues/:id/resolve` to handle resolution choices (ignore issue, delete file, merge files).
2.  **[MODIFY] [App.jsx](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/frontend_reactjs/src/App.jsx)**:
    *   Add a tab state toggle to switch between the chat interface and the administrative dashboard.
3.  **[MODIFY] [AdminPanel.jsx](file:///e:/Projects/Extracted%20Sigma%20AI%20Chatbot/ai-chatbot-project/apps/frontend_reactjs/src/components/AdminPanel.jsx)** (Refactor):
    *   Overhaul view to show visual tiles/cards for Governance and Health KPIs.
    *   Implement listing table for `knowledge_issues` with action buttons to verify, assign owners, or merge duplicates.

#### Exact Logic to Add
*   **Aggregation Pipelines**: MongoDB analytics aggregation for summarizing dashboard metrics in a single database round-trip.

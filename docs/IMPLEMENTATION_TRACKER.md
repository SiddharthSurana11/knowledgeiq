# IMPLEMENTATION_TRACKER: Master Sprint 1 — KnowledgeIQ Foundation

This tracker outlines the exact codebase changes, files to modify, database adjustments, API modifications, and testing checklists required to implement the baseline **KnowledgeIQ** RAG platform.

---

## 1. Acceptance Criteria for Sprint 1

1.  **System Rebranding**: No references to legacy prototype names in the user interface (welcome prompts, headings, title bars). Brand names updated to "KnowledgeIQ".
2.  **Dynamic Categories**: All documentation categories are loaded from MongoDB. Adding a new category row to the database dynamically adds it to the UI upload list without requiring code changes.
3.  **Domain Generalization**: System prompts in the LLM service are domain-agnostic. The bot identifies as "KnowledgeIQ" and answers questions using any provided context chunks.
4.  **Category Filtering**: Users can chat globally or focus queries on a single category, which utilizes Pinecone metadata filtering.
5.  **Ingestion Compatibility**: Uploading documents under any dynamic category resolves target storage folders dynamically and stores vectors with correct metadata.

---

## 2. Order of Implementation

```
[Step 1: MongoDB Seeding] ──> [Step 2: API Gateway Updates] ──> [Step 3: Service Prompt Updates] ──> [Step 4: Frontend UI Refactoring]
```

---

## 3. Database Schema Updates (MongoDB)

### Seed Data: Collection `categories`
A seed script must populate initial category configurations.
```json
[
  {
    "key": "lms",
    "name": "LMS",
    "driveFolderId": "1HnAHMBUUgKRjefGpf9zMq43dG7mpFokP"
  },
  {
    "key": "los",
    "name": "LOS",
    "driveFolderId": "1v4QCm1THuXRsAaKRbPz-PLvMCZw2ozOs"
  },
  {
    "key": "syndicate",
    "name": "Syndicate",
    "driveFolderId": "1QwvBC6uWbVO6juQ-DihXzv2FZvgH36QU"
  },
  {
    "key": "other",
    "name": "Other",
    "driveFolderId": "1HtvJDdtITXGYAF1CYV8iT9C4zfNzWL90"
  }
]
```

---

## 4. Exact Codebase Modification Specifications

### A. API Gateway (Node.js)

#### 1. [server.js](../apps/api-gateway/server.js)
*   **Remove**: Hardcoded `getDriveFolderId(category)` function.
*   **Add**: Dynamic lookup logic in `/api/upload` endpoint.
    ```js
    // Dynamic Folder lookup
    const db = await connectToDB();
    const catRecord = await db.collection('categories').findOne({ key: category });
    const folderId = catRecord ? catRecord.driveFolderId : process.env.GDRIVE_OTHER_FOLDER_ID;
    ```
*   **Add**: New API route `GET /api/categories` returning list of active categories:
    ```js
    app.get('/api/categories', async (req, res) => {
      try {
        const db = await connectToDB();
        const categories = await db.collection('categories').find().toArray();
        res.json(categories);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
      }
    });
    ```

#### 2. [pineconeClient.js](../apps/api-gateway/utils/pineconeClient.js)
*   **Modify**: `getRelevantChunks(userQuery, topK = 5)` to accept optional `categoryId`.
*   **Change**: Update query call to pass a metadata filter block to Pinecone when `categoryId` is set:
    ```js
    async function getRelevantChunks(userQuery, topK = 5, categoryId = null) {
      const embedding = await getEmbeddingForText(userQuery);
      const queryPayload = { vector: embedding, topK, includeMetadata: true };
      if (categoryId && categoryId !== 'all') {
        queryPayload.filter = { category: { "$eq": categoryId } };
      }
      const results = await index.query(queryPayload);
      // Mapping logic remains same...
    }
    ```

#### 3. [chatRoute.js](../apps/api-gateway/routes/chatRoute.js)
*   **Modify**: Parse optional `categoryId` from the POST body.
*   **Change**: Pass `categoryId` to the `getRelevantChunks` client utility:
    ```js
    const { message, history, categoryId } = req.body;
    const chunks = await getRelevantChunks(message, 5, categoryId);
    ```

---

### B. Embedding Service (Python)

#### 1. [vector_db_pinecone.py](../apps/embedding-service/modules/vectorDB/vector_db_pinecone.py)
*   **Remove**: Inside `detect_category(query_text)` function, delete hardcoded matching tags.
*   **Change**: Modify `semantic_search_with_detection` to skip automatic detection overrides, allowing query filters to dictate search behavior directly.

---

### C. LLM Service (Python)

#### 1. [prompt_instructions.txt](../apps/llm-service/prompt_instructions.txt)
*   **Change**: Update instructions to be domain-neutral.
    ```text
    You are KnowledgeIQ, a smart enterprise knowledge assistant.
    Always use the provided document chunks as your primary source of truth.
    If context is insufficient, politely explain that you do not have enough information.
    Keep responses professional, grounded, and concise.
    ```

---

### D. Frontend (React)

#### 1. [UploadPanel.jsx](../apps/frontend_reactjs/src/components/UploadPanel.jsx)
*   **Modify**: Fetch category array from `/api/categories` on mount:
    ```js
    const [categories, setCategories] = useState([]);
    useEffect(() => {
      fetch(`${apiGateway}/api/categories`)
        .then(res => res.json())
        .then(data => setCategories(data));
    }, [apiGateway]);
    ```
*   **UI Change**: Render a dropdown selector alongside a single upload input field instead of category buttons:
    ```jsx
    <div className="flex gap-4 items-center">
      <select onChange={(e) => setSelectedCat(e.target.value)}>
        {categories.map(cat => <option key={cat.key} value={cat.key}>{cat.name}</option>)}
      </select>
      <input type="file" onChange={handleUpload} />
    </div>
    ```

#### 2. [ChatBox.jsx](../apps/frontend_reactjs/src/components/ChatBox.jsx)
*   **Rebrand**: Update welcome greetings to "KnowledgeIQ".
*   **Add**: Category focus dropdown at the top of the chat area to allow filtering of queries:
    ```jsx
    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
      <option value="all">Search All Knowledge</option>
      {categories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
    </select>
    ```
*   **Modify**: Send `categoryId: filterCategory` in the JSON request body to `POST /api/chat`.

#### 3. [Sidebar.jsx](../apps/frontend_reactjs/src/components/Sidebar.jsx)
*   **Rebrand**: Change any hardcoded headers or footers referencing legacy chatbot names to "KnowledgeIQ Portal".

---

## 5. Testing & Verification Checklist

- [ ] **DB Verification**: Seed MongoDB `categories` collection and verify records are accessible.
- [ ] **API Endpoint**: Run `curl http://localhost:5000/api/categories` and check that it returns the category JSON list.
- [ ] **Upload Flow**: In the UI, select category `LMS` and upload a test PDF. Check:
    - [ ] Target upload goes to correct destination folder.
    - [ ] Vector metadata in Pinecone is tagged with `"category": "lms"`.
    - [ ] `resource_files` collection logs status as `completed`.
- [ ] **Chat Filtering Test**:
    - [ ] Upload an LMS file saying "The password is LMS_rules".
    - [ ] Upload a LOS file saying "The password is LOS_rules".
    - [ ] Set Category Filter to `LMS` in ChatBox. Query: "What is the password?".
    - [ ] Verify response matches context from LMS only, and no document hit is logged for LOS.
- [ ] **Branding Check**: Perform case-insensitive global text scan on the UI to confirm no legacy brand references remain.

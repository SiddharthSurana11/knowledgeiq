# API Gateway Interfaces

## Core Endpoints

### `GET /health`
Returns the status of the API Gateway and its downstream dependencies.
**Response**:
```json
{
  "status": "healthy",
  "uptime": 120.5,
  "memoryUsage": { ... },
  "nodeVersion": "v20.x",
  "mongodb": "connected",
  "pinecone": "connected",
  "minio": "connected",
  "grpc": "connected",
  "llm": "connected",
  "embedding": "connected"
}
```

### `POST /api/upload`
Ingests a document into the KnowledgeIQ platform.
- **Content-Type**: `multipart/form-data`
- **Payload**:
  - `file`: The document (PDF, Word, etc.)
  - `category`: The target category/domain
- **Response**:
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "storageKey": "...",
    "category": "...",
    "document": { ... }
  }
}
```

### `POST /api/chat`
Submits a query to the LLM.
- **Content-Type**: `application/json`
- **Payload**:
  - `message`: User query string
  - `category`: Context category (optional)
  - `history`: Array of previous interactions (optional)
- **Response**:
```json
{
  "success": true,
  "data": {
    "reply": "LLM text answer",
    "document_hits": [...],
    "follow_up": [...]
  }
}
```

### Error Responses
All errors follow a standardized envelope:
```json
{
  "success": false,
  "errorCode": "KIQ-XXXX",
  "message": "Human readable description",
  "timestamp": "ISO Date"
}
```

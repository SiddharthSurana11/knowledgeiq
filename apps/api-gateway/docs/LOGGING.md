# Logging & Observability

This document outlines the logging strategy implemented in the API Gateway.

## Winston & Transport Layers
We use `winston` as our core logging library, configured to output structured JSON format compatible with Prometheus, Grafana, and ELK stacks.

### Log Files
Logs are automatically rotated daily and stored in the `logs/` directory:
- `api-YYYY-MM-DD.log`: The main application log containing INFO level and above.
- `error-YYYY-MM-DD.log`: Exclusively captures ERROR level logs and unhandled exceptions.
- `requests-YYYY-MM-DD.log`: Captures all HTTP requests, statuses, and response times (HTTP level).
- `uploads-YYYY-MM-DD.log`: Specialized trace logs for the document ingestion state machine.
- `chat-YYYY-MM-DD.log`: Specialized trace logs for the retrieval and generation state machine.

## Correlation IDs
We utilize `express-http-context` and Node's native `async_hooks` to propagate a unique `X-Request-Id` across all async boundaries.
- Every incoming request generates a UUID (if not provided).
- This ID is automatically injected into every Winston log entry under the `reqId` field.
- This allows us to trace a single request through the API Gateway, MongoDB calls, and external service latencies without prop drilling.

## Lifecycle Trace Logs
To support advanced debugging, the major workflows emit specific lifecycle milestones.

### Upload Lifecycle
1. `[UPLOAD] Upload initiated`: Size, mimetype, category.
2. `[UPLOAD] Validation passed`: Document ID, resolved category.
3. `[UPLOAD] Stored in MinIO`: Latency, storage key.
4. `[UPLOAD] Duplicate detection complete`: Status (e.g., UNIQUE).
5. `[UPLOAD] Embedding started`.
6. `[UPLOAD] Embedding completed`: Latency.
7. `[UPLOAD] Metadata saved`: Trust score.
8. `[UPLOAD] Upload finished`: Total latency.

### Error Codes
We use structured error codes mapped to specific failure domains:
- `KIQ-1001`: Validation / Bad Request
- `KIQ-2001`: Authentication
- `KIQ-3004`: Resource Not Found
- `KIQ-4009`: Conflict (e.g., exact duplicate blocked)
- `KIQ-5029`: Rate Limit
- `KIQ-9999`: Internal Server Error

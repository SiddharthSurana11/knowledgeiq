# ADR 001: Standardizing MinIO / S3-Compatible Object Storage for Raw Document Persistence

- **Status**: Approved
- **Date**: 2026-08-03
- **Deciders**: Architecture Team

## Context
Early KnowledgeIQ design documentation (e.g. `IMPLEMENTATION_TRACKER.md`, `knowledgeiq_migration_design.md`) referenced Google Drive (`driveFolderId`, `GDRIVE_OTHER_FOLDER_ID`) as the storage location for raw uploaded documents. 

During baseline implementation, MinIO (an S3-compatible object storage server) was integrated into the API Gateway (`apps/api-gateway/utils/storage/minioStorage.js`) to provide containerized, low-latency, S3-API compliant blob storage without requiring external Google Cloud Service Account authentication or public cloud dependencies.

## Decision
MinIO / S3-compatible object storage is established as the official, canonical storage standard for all raw document persistence in KnowledgeIQ.

1. All incoming document uploads will stream directly to MinIO buckets managed by the API Gateway storage subsystem (`utils/storage/index.js`).
2. References to Google Drive in legacy design documents are officially **superseded** and must be treated strictly as historical background, not current operational specifications.
3. Google Drive environment keys are removed from active configuration schemas and environment templates.

## Consequences
- Single unified S3-compatible API interface across local development, staging, and production deployments.
- No reliance on Google Drive service accounts, Google Workspace OAuth scopes, or external Drive folder permissions.
- Ingestion pipeline latency is reduced by operating against local/in-cluster S3 storage streams.

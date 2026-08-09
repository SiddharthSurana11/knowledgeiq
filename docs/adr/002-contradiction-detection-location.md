# ADR 002: Contradiction Detection Execution Location

- **Status**: Approved
- **Date**: 2026-08-03
- **Deciders**: Architecture Team

## Context
Initial quality engine architectural proposals (`knowledgeiq_quality_engines_design.md` & `implementation_plan.md`) suggested exposing a dedicated `CheckContradiction` gRPC endpoint in `llm_service.proto` on the Python LLM Service, invoked by the Python Embedding Service post-upload.

However, during implementation, the contradiction verification engine was constructed inside the Node.js API Gateway as `ContradictionDetectionService` (`apps/api-gateway/services/contradictionDetectionService.js`). This service coordinates candidate topic query matches from Pinecone, extracts candidate chunk pairs, and queries the LLM via the existing gRPC client (`getLLMResponse`).

## Decision
The Node.js API Gateway implementation of `ContradictionDetectionService` is retained as the standard location for contradiction verification.

1. `ContradictionDetectionService` in Node.js reuses the existing, resilient gRPC LLM client infrastructure (`llmClient.js`), complete with circuit breakers (`Opossum`) and exponential backoff retries.
2. Building duplicate gRPC client wrappers inside the Python Embedding Service to talk to the Python LLM Service was avoided, maintaining a single orchestrator in the API Gateway.
3. The original design proposal for a custom `CheckContradiction` gRPC contract in `llm_service.proto` is officially **superseded**.

## Consequences
- Eliminates duplicate gRPC client logic across Python microservices.
- Keeps contradiction detection audit events logged consistently alongside API Gateway upload metrics.
- Avoids gRPC contract sprawl while preserving zero-shot LLM contradiction classification quality.

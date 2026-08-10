import os
import grpc
from concurrent import futures
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime, timezone
from sentence_transformers import SentenceTransformer, CrossEncoder
import logging

# gRPC
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'protos'))
import protos.embedding_pb2 as embedding_pb2
import protos.embedding_pb2_grpc as embedding_pb2_grpc

# Pipeline
from modules.chunking.data_extraction import extract_text
from modules.chunking.data_preprocessing import preprocess_document_list
from modules.vectorDB.embedder import generate_embeddings
from modules.vectorDB.vector_db_pinecone import insert_embeddings
model = SentenceTransformer("all-MiniLM-L6-v2")  # Or your preferred model
cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

# ── Lightweight OTel tracing ────────────────────────────────────────────────
try:
    from opentelemetry import trace as otel_trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter
    from opentelemetry.sdk.resources import Resource

    _otel_resource = Resource.create({"service.name": "knowledgeiq-embedding-service"})
    _otel_provider = TracerProvider(resource=_otel_resource)
    _otel_provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    otel_trace.set_tracer_provider(_otel_provider)
    _tracer = otel_trace.get_tracer("knowledgeiq-embedding-service")
    logging.info("[OTel] Tracing initialized for Embedding service")
except ImportError:
    _tracer = None
    logging.info("[OTel] opentelemetry not installed — tracing disabled")


# Env setup
load_dotenv()
DEBUG_OUTPUT = os.getenv("DEBUG_OUTPUT", "False") == "True"
MONGO_URI = os.getenv("MONGODB_URI")
MONGO_DB = os.getenv("MONGODB_DB")
if not MONGO_DB:
    raise ValueError("❌ MONGODB_DB not set in environment!")
PORT = int(os.getenv("EMBEDDING_GRPC_PORT", "50052"))

# MongoDB client
mongo_client = MongoClient(MONGO_URI)
db = mongo_client[MONGO_DB]

logging.basicConfig(level=logging.INFO)

# --- Helper: Log job status in MongoDB ---
def log_job_status(job_id, step, status, extra=None):
    update = {
        "job_id": job_id,
        "last_update": datetime.now(timezone.utc),
        f"{step}_status": status,
    }
    if extra:
        update.update(extra)
    db.embedding_jobs.update_one(
        {"job_id": job_id},
        {"$set": update},
        upsert=True
    )

# --- Helper: MinIO Object Fetcher ---
_minio_client = None

def get_minio_client():
    global _minio_client
    if _minio_client is None:
        minio_endpoint = os.getenv("MINIO_ENDPOINT", "minio")
        if ":" in minio_endpoint:
            host, port = minio_endpoint.split(":")
        else:
            host = minio_endpoint
            port = os.getenv("MINIO_PORT", "9000")
        
        access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        use_ssl = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
        
        from minio import Minio
        _minio_client = Minio(
            f"{host}:{port}",
            access_key=access_key,
            secret_key=secret_key,
            secure=use_ssl
        )
    return _minio_client

def ensure_local_file(path_or_key, original_name=""):
    if os.path.exists(path_or_key):
        return path_or_key, False

    bucket = os.getenv("MINIO_BUCKET", "knowledgeiq")
    client = get_minio_client()
    
    import tempfile
    ext = os.path.splitext(path_or_key)[1] or os.path.splitext(original_name)[1] or ".pdf"
    fd, tmp_file_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    
    logging.info(f"[MinIO Fetcher] Fetching '{path_or_key}' from bucket '{bucket}' to local temp path '{tmp_file_path}'")
    client.fget_object(bucket, path_or_key, tmp_file_path)
    return tmp_file_path, True

class EmbeddingServiceServicer(embedding_pb2_grpc.EmbeddingServiceServicer):
    def HandleUpload(self, request, context):
        local_file_path = None
        is_temp_download = False
        try:
            temp_path = request.temp_path
            category = request.category
            original_name = request.original_name
            document_id = None
            if "::" in original_name:
                original_name, document_id = original_name.split("::", 1)

            job_id = f"{original_name}_{category}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

            logging.info(f"Received file: {original_name} ({category}), path/key: {temp_path}, docId: {document_id}")

            # Ensure file is available locally (fetching from MinIO if temp_path is a storageKey)
            local_file_path, is_temp_download = ensure_local_file(temp_path, original_name)

            # --- Extraction ---
            log_job_status(job_id, "extraction", "started")
            extracted = extract_text(local_file_path)
            assert isinstance(extracted, dict), "extract_text() must return a dict"
            if not extracted or not extracted.get('text'):
                log_job_status(job_id, "extraction", "failed", {"error": "No text extracted."})
                raise ValueError("No text extracted.")
            log_job_status(job_id, "extraction", "completed")

            is_check = category.endswith("|check")
            actual_category = category[:-6] if is_check else category

            # --- Preprocessing ---
            log_job_status(job_id, "preprocessing", "started")
            doc = {
                "file": original_name,
                "category": actual_category,
                "content": extracted['text'],
                "pages": extracted.get('pages', [])
            }
            processed_list = preprocess_document_list([doc])
            assert processed_list and isinstance(processed_list, list), "preprocess_document_list() must return a list"
            processed_doc = processed_list[0]
            log_job_status(job_id, "preprocessing", "completed")

            # Prepare chunk dicts for embedding
            chunk_dicts = [
                {
                    "text": chunk["content"],
                    "filename": processed_doc["file"],
                    "category": processed_doc["category"],
                    "chunk_index": chunk["chunk_id"],
                    "documentId": document_id or "",
                    "page": str(chunk.get("page", "Unknown"))
                }
                for chunk in processed_doc["chunks"]
            ]

            # --- Embedding ---
            log_job_status(job_id, "embedding", "started")
            embeddings = generate_embeddings(chunk_dicts)
            assert isinstance(embeddings, list), "generate_embeddings() must return a list"
            log_job_status(job_id, "embedding", "completed")

            if is_check:
                # --- Duplicate Detection Logic ---
                from modules.vectorDB.vector_db_pinecone import get_pinecone_index
                pinecone_index = get_pinecone_index()

                # Level 2 check: Query Pinecone with full text vector
                full_text_vector = model.encode(extracted['text']).tolist()
                near_dup_matches = pinecone_index.query(
                    vector=full_text_vector,
                    top_k=3,
                    include_metadata=True
                ).get('matches', [])

                near_dup_found = False
                near_dup_score = 0.0
                near_dup_of = None
                for m in near_dup_matches:
                    score = m.get('score', 0.0)
                    if score >= 0.96:
                        near_dup_found = True
                        near_dup_score = score * 100
                        near_dup_of = m.get('metadata', {}).get('filename')
                        break

                # Level 3 check: Query Pinecone for each chunk
                existing_chunks_count = 0
                filename_counts = {}
                for emb_data in embeddings:
                    chunk_vector = emb_data["embedding"]
                    chunk_matches = pinecone_index.query(
                        vector=chunk_vector,
                        top_k=1,
                        include_metadata=True
                    ).get('matches', [])
                    if chunk_matches and chunk_matches[0].get('score', 0.0) >= 0.90:
                        existing_chunks_count += 1
                        m_file = chunk_matches[0].get('metadata', {}).get('filename')
                        if m_file:
                            filename_counts[m_file] = filename_counts.get(m_file, 0) + 1

                partial_dup_found = False
                partial_dup_ratio = 0.0
                most_common_file = None
                if len(embeddings) > 0:
                    partial_dup_ratio = existing_chunks_count / len(embeddings)
                    if partial_dup_ratio > 0.70:
                        partial_dup_found = True

                if filename_counts:
                    most_common_file = max(filename_counts, key=filename_counts.get)

                # Determine duplicate classification
                if near_dup_found:
                    duplicate_status = "NEAR_DUPLICATE"
                    duplicate_score = near_dup_score
                    duplicate_of = near_dup_of
                    duplicate_reason = f"Document is semantically near identical to {near_dup_of} (score: {near_dup_score:.1f}%)"
                elif partial_dup_found:
                    duplicate_status = "PARTIAL_DUPLICATE"
                    duplicate_score = partial_dup_ratio * 100
                    duplicate_of = most_common_file
                    duplicate_reason = f"{partial_dup_ratio*100:.1f}% of chunks exist in database, primarily matching document: {most_common_file}"
                else:
                    duplicate_status = "UNIQUE"
                    duplicate_score = (near_dup_matches[0].get('score', 0.0) * 100) if (near_dup_matches and len(near_dup_matches) > 0) else 0.0
                    duplicate_of = None
                    duplicate_reason = "No semantic duplicates detected in vector index."

                import json
                returned_chunks = [
                    {
                        "text": chunk_data["metadata"]["text"],
                        "vector": chunk_data["embedding"]
                    }
                    for chunk_data in embeddings
                ]
                report = {
                    "duplicate": {
                        "duplicateStatus": duplicate_status,
                        "duplicateScore": round(duplicate_score, 1),
                        "duplicateOf": duplicate_of,
                        "duplicateReason": duplicate_reason
                    },
                    "full_text_vector": full_text_vector,
                    "chunks": returned_chunks
                }
                return embedding_pb2.HandleUploadResponse(
                    status="duplicate_report",
                    final_path=temp_path,
                    message=json.dumps(report)
                )

            # --- Pinecone ---
            log_job_status(job_id, "pinecone", "started")
            pinecone_result = insert_embeddings(embeddings)
            log_job_status(job_id, "pinecone", "completed", {"pinecone_result": str(pinecone_result)})

            # --- MongoDB final status ---
            db.embedding_jobs.update_one(
                {"job_id": job_id},
                {"$set": {
                    "original_name": original_name,
                    "category": category,
                    "chunks_count": len(chunk_dicts),
                    "status": "completed",
                    "metadata": processed_doc,
                    "finished_at": datetime.now(timezone.utc)
                }},
                upsert=True
            )

            if DEBUG_OUTPUT:
                import json
                with open(f"debug_{original_name}_metadata.json", "w") as f:
                    json.dump({"chunks": chunk_dicts, "metadata": processed_doc}, f, indent=2)

            return embedding_pb2.HandleUploadResponse(
                status="completed",
                final_path=temp_path,
                message=f"Embedded and pushed {len(chunk_dicts)} chunks."
            )

        except Exception as e:
            logging.error(f"Embedding pipeline failed: {e}")
            db.embedding_jobs.update_one(
                {"job_id": job_id if 'job_id' in locals() else "unknown"},
                {"$set": {
                    "original_name": getattr(request, "original_name", "unknown"),
                    "category": getattr(request, "category", "unknown"),
                    "status": "failed",
                    "error": str(e),
                    "failed_at": datetime.now(timezone.utc)
                }},
                upsert=True
            )
            return embedding_pb2.HandleUploadResponse(
                status="failed",
                final_path=getattr(request, "temp_path", ""),
                message=str(e)            
            )
        finally:
            if is_temp_download and local_file_path and os.path.exists(local_file_path):
                try:
                    os.remove(local_file_path)
                except Exception as cleanup_err:
                    logging.warning(f"Failed to remove temporary downloaded file {local_file_path}: {cleanup_err}")
        
    def GetEmbedding(self, request, context):
        span = _tracer.start_span("embedding.GetEmbedding") if _tracer else None
        try:
            text = request.text
            if span:
                span.set_attribute("embedding.text_length", len(text))
            import time as _time
            start = _time.time()
            embedding = model.encode(text).tolist()
            latency_ms = int((_time.time() - start) * 1000)
            if span:
                span.set_attribute("embedding.latency_ms", latency_ms)
                span.set_attribute("embedding.vector_dim", len(embedding))
            return embedding_pb2.GetEmbeddingResponse(vector=embedding)
        except Exception as e:
            logging.error(f"GetEmbedding failed: {e}")
            if span:
                span.record_exception(e)
            return embedding_pb2.GetEmbeddingResponse(vector=[])
        finally:
            if span:
                span.end()

    def RerankCandidates(self, request, context):
        """Cross-encoder reranking: scores each candidate text against the query."""
        span = _tracer.start_span("embedding.RerankCandidates") if _tracer else None
        try:
            query = request.query
            candidates = list(request.candidate_texts)
            if span:
                span.set_attribute("rerank.candidate_count", len(candidates))
            if not candidates:
                if span:
                    span.end()
                return embedding_pb2.RerankResponse(scores=[])

            import time as _time
            start = _time.time()
            pairs = [[query, text] for text in candidates]
            scores = cross_encoder.predict(pairs).tolist()
            latency_ms = int((_time.time() - start) * 1000)

            if span:
                span.set_attribute("rerank.latency_ms", latency_ms)

            logging.info(f"[RerankCandidates] Reranked {len(candidates)} candidates in {latency_ms}ms")
            return embedding_pb2.RerankResponse(scores=scores)
        except Exception as e:
            logging.error(f"RerankCandidates failed: {e}")
            if span:
                span.record_exception(e)
            return embedding_pb2.RerankResponse(scores=[])
        finally:
            if span:
                span.end()


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    embedding_pb2_grpc.add_EmbeddingServiceServicer_to_server(EmbeddingServiceServicer(), server)

    tls_enabled = os.getenv("GRPC_TRANSPORT_SECURITY_ENABLED", "false").lower() == "true"
    if tls_enabled:
        try:
            key_path = os.getenv("TLS_KEY_PATH", "server.key")
            cert_path = os.getenv("TLS_CERT_PATH", "server.crt")
            with open(key_path, 'rb') as f:
                private_key = f.read()
            with open(cert_path, 'rb') as f:
                certificate_chain = f.read()
            server_credentials = grpc.ssl_server_credentials(((private_key, certificate_chain),))
            server.add_secure_port(f'[::]:{PORT}', server_credentials)
            logging.info(f"gRPC EmbeddingService running SECURELY on port {PORT}")
        except FileNotFoundError:
            logging.warning("TLS enabled but certs missing. Falling back to INSECURE.")
            server.add_insecure_port(f'0.0.0.0:{PORT}')
            logging.info(f"gRPC EmbeddingService running INSECURELY on port {PORT}")
    else:
        server.add_insecure_port(f'0.0.0.0:{PORT}')
        logging.info(f"gRPC EmbeddingService running INSECURELY on port {PORT}")

    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()

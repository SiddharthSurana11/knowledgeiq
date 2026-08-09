import os
import grpc
from concurrent import futures
from dotenv import load_dotenv
import logging

load_dotenv()

# APScheduler import
from apscheduler.schedulers.background import BackgroundScheduler
from feedback_to_fewshot import extract_examples

# Import generated gRPC classes (write llm_service.proto and compile to llm_pb2.py, llm_pb2_grpc.py)
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'protos'))

import protos.llm_service_pb2 as llm_pb2
import protos.llm_service_pb2_grpc as llm_pb2_grpc

from response_generator import generate_response
from llm import get_provider
import time
import json

# ── Lightweight OTel tracing ────────────────────────────────────────────────
try:
    from opentelemetry import trace as otel_trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter
    from opentelemetry.sdk.resources import Resource

    resource = Resource.create({"service.name": "knowledgeiq-llm-service"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    otel_trace.set_tracer_provider(provider)
    _tracer = otel_trace.get_tracer("knowledgeiq-llm-service")
    logging.info("[OTel] Tracing initialized for LLM service")
except ImportError:
    _tracer = None
    logging.info("[OTel] opentelemetry not installed — tracing disabled")

DEBUG_OUTPUT = os.getenv("DEBUG_OUTPUT", "False") == "True"
PORT = int(os.getenv("LLM_GRPC_PORT", "50053"))

logging.basicConfig(level=logging.INFO)

class LLMServiceServicer(llm_pb2_grpc.LLMServiceServicer):
    def GenerateResponse(self, request, context):
        span = _tracer.start_span("llm.GenerateResponse") if _tracer else None
        start_time = time.time()
        try:
            # Parse the gRPC request
            user_query = request.user_query
            is_refusal = request.is_refusal
            retrieved_content = []
            for chunk in request.retrieved_content:
                retrieved_content.append({
                    "score": chunk.score,
                    "metadata": {
                        "text": chunk.text,
                        "category": chunk.category,
                        "filename": chunk.filename,
                        "page": getattr(chunk, 'page', ''),
                        "chunk_index": getattr(chunk, 'chunk_index', 0),
                        "document_id": getattr(chunk, 'document_id', ''),
                    }
                })
            memory_block = request.memory_block

            # Call your core response logic
            resp = generate_response(retrieved_content, user_query, memory_block, is_refusal)

            latency_ms = int((time.time() - start_time) * 1000)
            telemetry = json.loads(resp.get("telemetry_json", "{}")) if resp.get("telemetry_json") else {}

            if span:
                span.set_attribute("llm.provider", telemetry.get("model_name", "unknown"))
                span.set_attribute("llm.latency_ms", latency_ms)
                span.set_attribute("llm.chunk_count", len(retrieved_content))
                span.set_attribute("llm.is_refusal", is_refusal)
                span.set_attribute("llm.prompt_tokens", telemetry.get("prompt_tokens", 0))
                span.set_attribute("llm.completion_tokens", telemetry.get("completion_tokens", 0))

            # Build gRPC reply
            return llm_pb2.GenerateResponseReply(
                answer=resp["answer"],
                follow_up=resp.get("follow_up", ""),
                document_hits=resp.get("document_hits", []),
                resource_type=resp.get("resource_type", "Unknown"),
                telemetry_json=resp.get("telemetry_json", "{}")
            )
        except Exception as e:
            if span:
                span.set_status(otel_trace.StatusCode.ERROR if _tracer else None, str(e))
                span.record_exception(e)
            raise
        finally:
            if span:
                span.end()

    def AnalyzeContent(self, request, context):
        span = _tracer.start_span("llm.AnalyzeContent") if _tracer else None
        start_time = time.time()
        system_prompt = request.system_prompt
        content = request.content
        task_type = request.task_type
        
        provider = get_provider()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Task: {task_type}\n\nContent:\n{content}"}
        ]
        
        try:
            result = provider.complete(messages, temperature=0.1)
        except Exception as e:
            logging.error(f"AnalyzeContent error: {e}")
            result = str(e)
            
        latency = int((time.time() - start_time) * 1000)
        telemetry = {"latency_ms": latency, "task_type": task_type, "model": provider.model_name}

        if span:
            span.set_attribute("llm.task_type", task_type)
            span.set_attribute("llm.latency_ms", latency)
            span.set_attribute("llm.provider", provider.model_name)
            span.end()
        
        return llm_pb2.AnalyzeContentReply(
            result=result,
            telemetry_json=json.dumps(telemetry)
        )

def start_scheduler():
    scheduler = BackgroundScheduler()
    # Run every 10 minutes (interval in minutes)
    scheduler.add_job(extract_examples, "interval", minutes=10)
    scheduler.start()
    logging.info("APScheduler started: Running extract_examples every 10 minutes.")
    return scheduler

def serve():
    # Start scheduler (background job for few-shot extraction)
    scheduler = start_scheduler()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    llm_pb2_grpc.add_LLMServiceServicer_to_server(LLMServiceServicer(), server)

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
            logging.info(f"gRPC LLMService running SECURELY on port {PORT}")
        except FileNotFoundError:
            logging.warning("TLS enabled but certs missing. Falling back to INSECURE.")
            server.add_insecure_port(f'0.0.0.0:{PORT}')
            logging.info(f"gRPC LLMService running INSECURELY on port {PORT}")
    else:
        server.add_insecure_port(f'0.0.0.0:{PORT}')
        logging.info(f"gRPC LLMService running INSECURELY on port {PORT}")

    server.start()
    try:
        server.wait_for_termination()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()

if __name__ == '__main__':
    serve()

import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Server configuration
    PORT = int(os.getenv("LLM_GRPC_PORT", "50053"))
    DEBUG_OUTPUT = os.getenv("DEBUG_OUTPUT", "False").lower() == "true"
    
    # TLS configuration
    TLS_ENABLED = os.getenv("GRPC_TRANSPORT_SECURITY_ENABLED", "false").lower() == "true"
    TLS_KEY_PATH = os.getenv("TLS_KEY_PATH", "server.key")
    TLS_CERT_PATH = os.getenv("TLS_CERT_PATH", "server.crt")
    
    # LLM Provider configuration
    # Can be a comma-separated list of providers, e.g., "openrouter,gemini,claude"
    LLM_PROVIDER_ORDER = os.getenv("LLM_PROVIDER_ORDER", os.getenv("LLM_PROVIDER", "groq,gemini,openrouter"))
    
    # Provider Health Memory
    PROVIDER_HEALTH_PENALTY_SECONDS = int(os.getenv("PROVIDER_HEALTH_PENALTY_SECONDS", "15"))
    
    # Few-shot examples
    FEWSHOT_PATH = os.getenv("FEWSHOT_PATH", "./few_shot_examples.json")
    FEWSHOT_LIMIT = int(os.getenv("FEWSHOT_LIMIT", "20"))
    
    # Debugging
    LLM_DEBUG_MODE = os.getenv("LLM_DEBUG_MODE", "false").lower() == "true"

config = Config()

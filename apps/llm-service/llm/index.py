"""
LLM Provider Factory
--------------------
Resolves the active LLM provider from the LLM_PROVIDER environment variable
and returns a singleton instance.

Usage (anywhere in the application):
    from llm import get_provider
    provider = get_provider()
    response_text = provider.complete(prompt)

To add a new provider in the future:
  1. Create llm/MyNewProvider.py extending BaseLLMProvider
  2. Add a case in _build() below
  3. Set LLM_PROVIDER=mynew in .env
  No other code changes are required.

Supported values for LLM_PROVIDER:
  openrouter  (default) — OpenRouter multi-model gateway
  claude                — Anthropic Claude direct API
  groq                  — Groq Cloud (ultra-low latency)
  gemini                — Google Gemini
"""

import os
import time
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_instance = None

def _build(provider_name: str):
    name = provider_name.lower().strip()
    if name == "openrouter":
        from llm.OpenRouterProvider import OpenRouterProvider
        return OpenRouterProvider()
    if name == "claude":
        from llm.ClaudeProvider import ClaudeProvider
        return ClaudeProvider()
    if name == "groq":
        from llm.GroqProvider import GroqProvider
        return GroqProvider()
    if name == "gemini":
        from llm.GeminiProvider import GeminiProvider
        return GeminiProvider()
    
    logger.warning(f'Unsupported LLM_PROVIDER: "{provider_name}". Skipping.')
    return None

class FailoverProviderChain:
    def __init__(self, provider_names):
        from config import config
        self.providers = []
        self.provider_names = []
        self.health_memory = {}  # dict mapping provider_name to timestamp when it becomes healthy again
        self.penalty_seconds = config.PROVIDER_HEALTH_PENALTY_SECONDS
        
        for p_name in provider_names:
            p = _build(p_name)
            if p:
                self.providers.append(p)
                self.provider_names.append(p_name.strip().lower())
                
        if not self.providers:
            raise ValueError("No valid providers could be loaded from LLM_PROVIDER_ORDER")
            
        # The primary model name (for telemetry when totally failed)
        self.model_name = self.providers[0].model_name

    def complete(self, messages, **kwargs):
        current_time = time.time()
        telemetry_bag = kwargs.get("telemetry_bag", {})
        
        # Safety valve: if all providers are locked out in health memory, clear health memory to allow immediate retry
        active_lockouts = sum(1 for p in self.provider_names if p in self.health_memory and current_time < self.health_memory[p])
        if active_lockouts == len(self.provider_names):
            logger.warning("[Failover] All providers in failover chain are locked out in health memory — auto-resetting health memory for fresh retry.")
            self.health_memory.clear()

        for i, provider in enumerate(self.providers):
            p_name = self.provider_names[i]
            
            # Check Health Memory
            if p_name in self.health_memory:
                if current_time < self.health_memory[p_name]:
                    logger.info(f"[Failover] Skipping {p_name} due to health memory (unhealthy for {int(self.health_memory[p_name] - current_time)}s more)")
                    continue
                else:
                    # Provider has recovered from its timeout
                    del self.health_memory[p_name]

            start_time = time.time()
            try:
                result = provider.complete(messages, **kwargs)
                # Ensure the selected model is correctly attributed in telemetry
                telemetry_bag["model_name"] = provider.model_name
                return result
            except Exception as e:
                latency_ms = int((time.time() - start_time) * 1000)
                error_str = str(e).lower()
                
                # Check if error is transient or provider call error eligible for failover
                is_transient = any(keyword in error_str for keyword in [
                    "timeout", "429", "500", "502", "503", "504", "dns", "tls", "connection", "rate limit",
                    "401", "403", "unauthorized", "forbidden", "invalid", "auth", "api key", "quota", "exceeded", "http", "payload too large"
                ])
                
                if is_transient:
                    # Mark unhealthy
                    self.health_memory[p_name] = time.time() + self.penalty_seconds
                    
                    fallback = self.provider_names[i+1] if i + 1 < len(self.provider_names) else "None"
                    
                    # Structured telemetry logging (Metrics)
                    logger.warning(
                        "[Failover Metrics] Provider: %s | Reason: %s | Latency: %dms | Fallback: %s",
                        p_name, str(e), latency_ms, fallback
                    )
                    continue  # Try next provider
                else:
                    # Non-transient error (e.g. 400 Bad Request, Validation) - do not failover
                    logger.error(f"[{p_name}] Non-transient error encountered: {e}")
                    raise e
                    
        # If we exhausted all providers, clear health memory so future requests aren't permanently locked out
        self.health_memory.clear()
        raise Exception("All providers in the failover chain failed or are temporarily rate limited.")

def get_provider():
    """Return the singleton LLM provider failover chain."""
    global _instance
    if _instance is None:
        from config import config
        provider_order_str = config.LLM_PROVIDER_ORDER
        provider_names = [p.strip() for p in provider_order_str.split(",") if p.strip()]
        logger.info("[LLMFactory] Initializing FailoverProviderChain with order: %s", provider_names)
        _instance = FailoverProviderChain(provider_names)
    return _instance

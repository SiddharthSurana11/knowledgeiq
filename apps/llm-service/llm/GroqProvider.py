"""
GroqProvider
------------
Concrete LLM provider backed by Groq Cloud (https://groq.com).

Groq exposes an OpenAI-compatible /chat/completions endpoint with
extremely low latency (LPU inference hardware).

Activate with: LLM_PROVIDER=groq

Environment variables read:
  GROQ_API_KEY    — required
  GROQ_MODEL      — optional, defaults to llama-3.1-8b-instant
  GROQ_MAX_TOKENS — optional, defaults to 1200
"""

import os
import logging
import requests
from dotenv import load_dotenv

from llm.BaseLLMProvider import BaseLLMProvider

load_dotenv()

logger = logging.getLogger(__name__)

_API_URL = "https://api.groq.com/openai/v1/chat/completions"
_DEFAULT_MODEL = "llama-3.1-8b-instant"
class GroqProvider(BaseLLMProvider):

    def __init__(self):
        self._api_key = os.getenv("GROQ_API_KEY", "")
        self._model = os.getenv("GROQ_MODEL", _DEFAULT_MODEL)
        self._max_tokens = int(os.getenv("GROQ_MAX_TOKENS", "1200"))

        if not self._api_key:
            logger.warning(
                "[GroqProvider] GROQ_API_KEY is not set. Calls will fail."
            )
        else:
            logger.info("[GroqProvider] Initialised — model: %s", self._model)

    def complete(self, messages: list, **kwargs) -> str:
        max_tokens = kwargs.get("max_tokens", self._max_tokens)
        temperature = kwargs.get("temperature", 0.1)

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        
        payload_messages = list(messages)

        payload = {
            "model": self._model,
            "messages": payload_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        try:
            response = requests.post(
                _API_URL, headers=headers, json=payload, timeout=60
            )
            response.raise_for_status()
            res_json = response.json()
            text = (
                res_json
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            text = text or "[No response returned by Groq.]"

            telemetry_bag = kwargs.get("telemetry_bag")
            if isinstance(telemetry_bag, dict):
                usage = res_json.get("usage", {})
                telemetry_bag["prompt_tokens"] = usage.get("prompt_tokens", 0)
                telemetry_bag["completion_tokens"] = usage.get("completion_tokens", 0)
                telemetry_bag["total_tokens"] = usage.get("total_tokens", 0)
                telemetry_bag["provider_name"] = "groq"
                telemetry_bag["model_name"] = self._model

            return text
        except requests.exceptions.RequestException as e:
            logger.error("[GroqProvider] API call failed: %s", e)
            raise e

"""
OpenRouterProvider
------------------
Concrete LLM provider backed by OpenRouter (https://openrouter.ai).

IMPORTANT — Model Selection:
  Use an instruction-following model, NOT a reasoning/thinking model.
  Reasoning models (e.g. Nemotron, DeepSeek-R1, o1) externalize their
  chain-of-thought even when instructed not to, especially on complex queries.

  Recommended free models (instruction-following, no reasoning leakage):
    google/gemma-4-26b-a4b-it:free  ← current default
    mistralai/mistral-7b-instruct:free
    qwen/qwen-2.5-7b-instruct:free

Environment variables read:
  OPENROUTER_API_KEY     — required
  OPENROUTER_MODEL       — optional, defaults to google/gemma-4-26b-a4b-it:free
  OPENROUTER_MAX_TOKENS  — optional, defaults to 1200
  OPENROUTER_TEMPERATURE — optional, defaults to 0.1
"""

import os
import logging
import requests
from dotenv import load_dotenv

from llm.BaseLLMProvider import BaseLLMProvider

load_dotenv()

logger = logging.getLogger(__name__)

_API_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free"

class OpenRouterProvider(BaseLLMProvider):

    def __init__(self):
        self._api_key = os.getenv("OPENROUTER_API_KEY", "")
        self._model = os.getenv("OPENROUTER_MODEL", _DEFAULT_MODEL)
        self._max_tokens = int(os.getenv("OPENROUTER_MAX_TOKENS", "2500"))
        self._temperature = float(os.getenv("OPENROUTER_TEMPERATURE", "0.1"))

        if not self._api_key:
            logger.warning(
                "[OpenRouterProvider] OPENROUTER_API_KEY is not set. "
                "Calls will fail with 401."
            )
        else:
            logger.info(
                "[OpenRouterProvider] Initialised — model: %s", self._model
            )

    def complete(self, messages: list, **kwargs) -> str:
        """
        Send a chat completion request to OpenRouter.
        """
        max_tokens = kwargs.get("max_tokens", self._max_tokens)
        temperature = kwargs.get("temperature", self._temperature)
        telemetry_bag = kwargs.get("telemetry_bag", None)

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://knowledgeiq.app",
            "X-Title": "KnowledgeIQ",
        }

        # Make a copy so we don't modify the caller's array
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
            data = response.json()
            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"]))
                logger.error("[OpenRouterProvider] API error response: %s", err_msg)
                raise Exception(f"OpenRouter API error: {err_msg}")

            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if not text:
                logger.warning("[OpenRouterProvider] Empty content in response: %s", data)
                raise Exception("OpenRouter model returned empty response or timed out upstream.")

            if telemetry_bag is not None:
                usage = data.get("usage", {})
                telemetry_bag["provider_name"] = "openrouter"
                telemetry_bag["model_name"] = data.get("model", self._model)
                telemetry_bag["prompt_tokens"] = usage.get("prompt_tokens", 0)
                telemetry_bag["completion_tokens"] = usage.get("completion_tokens", 0)
                telemetry_bag["total_tokens"] = usage.get("total_tokens", 0)

            return text
        except requests.exceptions.HTTPError as e:
            logger.error(
                "[OpenRouterProvider] HTTP %s — %s",
                e.response.status_code if e.response else "?",
                e.response.text if e.response else str(e),
            )
            raise e
        except requests.exceptions.RequestException as e:
            logger.error("[OpenRouterProvider] Request failed: %s", e)
            raise e



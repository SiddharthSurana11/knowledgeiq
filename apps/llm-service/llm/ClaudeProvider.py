"""
ClaudeProvider
--------------
Concrete LLM provider backed by Anthropic Claude.

Claude natively supports:
  - A top-level `system` field for identity/behavioral rules.
  - An assistant prefill (last message in `messages` with role "assistant")
    that forces the model to continue from a specific starting point.
  Unlike OpenAI-compatible APIs, Claude's response INCLUDES the prefill text,
  so no prepending is needed.

Environment variables read:
  CLAUDE_API_KEY    — required
  CLAUDE_MODEL      — optional, defaults to claude-3-haiku-20240307
  CLAUDE_MAX_TOKENS — optional, defaults to 1200
"""

import os
import logging
import requests
from dotenv import load_dotenv

from llm.BaseLLMProvider import BaseLLMProvider

load_dotenv()

logger = logging.getLogger(__name__)

_API_URL = "https://api.anthropic.com/v1/messages"
_DEFAULT_MODEL = "claude-3-haiku-20240307"

class ClaudeProvider(BaseLLMProvider):

    def __init__(self):
        self._api_key = os.getenv("CLAUDE_API_KEY", "")
        self._model = os.getenv("CLAUDE_MODEL", _DEFAULT_MODEL)
        self._max_tokens = int(os.getenv("CLAUDE_MAX_TOKENS", "1200"))

        if not self._api_key:
            logger.warning(
                "[ClaudeProvider] CLAUDE_API_KEY is not set. Calls will fail."
            )
        else:
            logger.info(
                "[ClaudeProvider] Initialised — model: %s", self._model
            )

    def complete(self, messages: list, **kwargs) -> str:
        max_tokens = kwargs.get("max_tokens", self._max_tokens)
        temperature = kwargs.get("temperature", 0.1)

        headers = {
            "x-api-key": self._api_key,
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
        }

        # Claude separates system prompt from conversation messages
        system_content = ""
        anthropic_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_content += msg["content"] + "\n"
            else:
                anthropic_messages.append({"role": msg["role"], "content": msg["content"]})
        
        system_content = system_content.strip()

        payload = {
            "model": self._model,
            "system": system_content,
            "messages": anthropic_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        try:
            response = requests.post(
                _API_URL, headers=headers, json=payload, timeout=60
            )
            response.raise_for_status()
            res_json = response.json()
            content = res_json.get(
                "content", [{"text": "[No response returned by Claude.]"}]
            )

            telemetry_bag = kwargs.get("telemetry_bag")
            if isinstance(telemetry_bag, dict):
                usage = res_json.get("usage", {})
                telemetry_bag["provider_name"] = "claude"
                telemetry_bag["model_name"] = self._model
                telemetry_bag["prompt_tokens"] = usage.get("input_tokens", 0)
                telemetry_bag["completion_tokens"] = usage.get("output_tokens", 0)
                telemetry_bag["total_tokens"] = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

            return content[0]["text"]
        except requests.exceptions.RequestException as e:
            logger.error("[ClaudeProvider] API call failed: %s", e)
            raise e

"""
GeminiProvider
--------------
Concrete LLM provider backed by Google Gemini (Generative Language API).

Activate with: LLM_PROVIDER=gemini

Environment variables read:
  GEMINI_API_KEY     — required
  GEMINI_MODEL       — optional, defaults to gemini-2.0-flash
  GEMINI_MAX_TOKENS  — optional, defaults to 1200
  GEMINI_TEMPERATURE — optional, defaults to 0.1
"""

import os
import logging
import requests
from dotenv import load_dotenv

from llm.BaseLLMProvider import BaseLLMProvider

load_dotenv()

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "gemini-2.0-flash"
_API_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)

class GeminiProvider(BaseLLMProvider):

    def __init__(self):
        self._api_key = os.getenv("GEMINI_API_KEY", "")
        self._model = os.getenv("GEMINI_MODEL", _DEFAULT_MODEL)
        self._max_tokens = int(os.getenv("GEMINI_MAX_TOKENS", "2500"))
        self._temperature = float(os.getenv("GEMINI_TEMPERATURE", "0.1"))

        if not self._api_key:
            logger.warning(
                "[GeminiProvider] GEMINI_API_KEY is not set. Calls will fail."
            )
        else:
            logger.info(
                "[GeminiProvider] Initialised — model: %s", self._model
            )

    def complete(self, messages: list, **kwargs) -> str:
        """
        Send a chat completion request to Google Gemini.

        Gemini uses a different message format than OpenAI:
          - System instructions go in a top-level `systemInstruction` field.
          - User/assistant messages go in `contents` with role "user"/"model".
        """
        max_tokens = kwargs.get("max_tokens", self._max_tokens)
        temperature = kwargs.get("temperature", self._temperature)
        telemetry_bag = kwargs.get("telemetry_bag", None)

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json"
        }

        system_content = ""
        gemini_contents = []

        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                system_content += content + "\n"
            else:
                gemini_role = "user" if role == "user" else "model"
                gemini_contents.append({
                    "role": gemini_role,
                    "parts": [{"text": content}]
                })

        payload = {
            "systemInstruction": {
                "parts": [{"text": system_content.strip()}]
            },
            "contents": gemini_contents,
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": temperature,
            },
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                logger.warning("[GeminiProvider] No candidates in response: %s", data)
                return "[No response returned by Gemini.]"

            parts = candidates[0].get("content", {}).get("parts", [])
            text = " ".join(p.get("text", "") for p in parts).strip()
            text = text or "[No response returned by Gemini.]"

            if telemetry_bag is not None:
                usage = data.get("usageMetadata", {})
                telemetry_bag["provider_name"] = "gemini"
                telemetry_bag["model_name"] = self._model
                telemetry_bag["prompt_tokens"] = usage.get("promptTokenCount", 0)
                telemetry_bag["completion_tokens"] = usage.get("candidatesTokenCount", 0)
                telemetry_bag["total_tokens"] = usage.get("totalTokenCount", 0)

            return text
        except requests.exceptions.HTTPError as e:
            logger.error(
                "[GeminiProvider] HTTP %s — %s",
                e.response.status_code if e.response else "?",
                e.response.text[:500] if e.response else str(e),
            )
            raise  # Failover chain will handle rate limits / errors
        except requests.exceptions.RequestException as e:
            logger.error("[GeminiProvider] Request failed: %s", e)
            raise  # Failover chain will handle network errors

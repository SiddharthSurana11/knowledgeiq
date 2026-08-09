"""
BaseLLMProvider
---------------
Abstract base class for all LLM provider implementations.

All concrete providers (OpenRouter, Claude, Groq, Gemini, …) must subclass
this and implement `complete()`.  No business logic in the application should
ever import a concrete provider directly — use the factory in llm/index.py.

Prompt Structure Contract
--------------------------
response_generator.py assembles the prompt as an OpenAI-style messages array:

    [
        {"role": "system", "content": "<identity, rules, formatting contracts, few-shot>"},
        {"role": "user", "content": "<history, evidence, user question>"}
    ]

Every concrete provider MUST accept this standard array and format it natively
for their respective underlying API.
"""

from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    """
    Minimal contract every LLM provider must satisfy.

    The single entry-point is `complete(messages, **kwargs)`, which takes a
    standard OpenAI-style messages array and returns the model's text response.
    """

    @property
    def model_name(self) -> str:
        """Return the current model identifier for telemetry purposes."""
        return getattr(self, "_model", self.__class__.__name__)

    @abstractmethod
    def complete(self, messages: list, **kwargs) -> str:
        """
        Send `messages` to the underlying LLM and return the response text.

        Parameters
        ----------
        messages : list
            A list of dicts: [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
        **kwargs
            Provider-specific overrides (e.g. max_tokens, temperature).
            Also accepts `telemetry_bag` (dict) to capture token usage and model info.

        Returns
        -------
        str
            The model's response text, already stripped of surrounding
            whitespace.  Must never raise — return an error string instead so
            the gRPC layer always receives a valid reply.
        """
        ...

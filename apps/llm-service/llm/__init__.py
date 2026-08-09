# llm/__init__.py
# Re-export get_provider so callers can do:
#   from llm import get_provider
from llm.index import get_provider

__all__ = ["get_provider"]

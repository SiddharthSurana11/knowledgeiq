import os
import logging
from functools import lru_cache
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer

load_dotenv()
DEBUG_OUTPUT = os.getenv("DEBUG_OUTPUT", "False") == "True"
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "chatbot-index")
PINECONE_DIM = int(os.getenv("PINECONE_DIM", "384"))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

logging.basicConfig(level=logging.INFO)

# 🧠 Load Sentence Transformer model once at import!
model = SentenceTransformer(EMBEDDING_MODEL)

def get_pinecone_index() -> 'Pinecone.Index':
    if not PINECONE_API_KEY:
        raise ValueError("❌ PINECONE_API_KEY not set in .env")
    if model.get_sentence_embedding_dimension() != PINECONE_DIM:
        raise ValueError(f"Embedding dimension mismatch: Model={model.get_sentence_embedding_dimension()}, Pinecone={PINECONE_DIM}")
    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        if PINECONE_INDEX not in [idx.name for idx in pc.list_indexes()]:
            pc.create_index(
                name=PINECONE_INDEX,
                dimension=PINECONE_DIM,
                metric='cosine',
                spec=ServerlessSpec(cloud='aws', region='us-east-1')
            )
        return pc.Index(PINECONE_INDEX)
    except Exception as e:
        logging.error(f"Error initializing Pinecone: {e}")
        raise

def insert_embeddings(embeddings: List[Dict[str, Any]], index=None):
    if not index:
        index = get_pinecone_index()
    vectors = [
        (e["id"], e["embedding"], e["metadata"])
        for e in embeddings
    ]
    try:
        index.upsert(vectors=vectors)
    except Exception as e:
        logging.error(f"Failed to upsert vectors: {e}")
        raise
    if DEBUG_OUTPUT:
        import json
        with open("debug_pinecone_upserts.json", "w", encoding="utf-8") as f:
            json.dump(vectors, f, indent=2)




# modules/embedder.py

import os
import numpy as np
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
from typing import List, Dict, Any

load_dotenv()
MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
DEBUG_OUTPUT = os.getenv("DEBUG_OUTPUT", "False") == "True"

# Load model at import
model = SentenceTransformer(MODEL_NAME)

def generate_embeddings(chunk_dicts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Takes a list of chunk dicts (see data_preprocessing.py output) and returns a list of embedding dicts.
    Each output dict: { id, embedding, metadata }
    """
    embeddings = []
    for chunk in chunk_dicts:
        text = chunk['text']
        emb = model.encode(text)
        emb = emb / np.linalg.norm(emb)
        embeddings.append({
            'id': f"{chunk.get('category', 'unknown')}_{chunk.get('filename', 'unknown')}_{chunk.get('chunk_index', 0)}",
            'embedding': emb.tolist(),
            'metadata': {
                'filename': chunk.get('filename'),
                'category': chunk.get('category'),
                'chunk_index': chunk.get('chunk_index'),
                'documentId': chunk.get('documentId', ''),
                'text': text
            }
        })
    # Optional: Save debug output
    if DEBUG_OUTPUT:
        import json
        with open("debug_embeddings.json", "w", encoding="utf-8") as f:
            json.dump(embeddings, f, indent=2)
    return embeddings

# For CLI/dev only: (can remove for prod microservice use)
if __name__ == "__main__":
    import json, sys
    input_file = sys.argv[1]
    with open(input_file, "r", encoding="utf-8") as f:
        chunk_dicts = json.load(f)
    result = generate_embeddings(chunk_dicts)
    print(f"Generated {len(result)} embeddings.")

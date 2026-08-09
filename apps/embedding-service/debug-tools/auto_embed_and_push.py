import os
import logging
from dotenv import load_dotenv

# Import your pipeline modules (update the import paths as per your folder structure)
from modules.chunking.data_extraction import extract_text
from modules.chunking.data_preprocessing import preprocess_document_list
from modules.vectorDB.embedder import generate_embeddings
from modules.vectorDB.vector_db_pinecone import insert_embeddings

# Load env
load_dotenv()

logging.basicConfig(level=logging.INFO)

def run_pipeline(local_file_path, original_name="", category="Other"):
    logging.info("🚀 Starting Extract → Preprocess → Embed → Push")

    # 1. Extract text
    extracted = extract_text(local_file_path)
    if not extracted or not extracted['text']:
        raise Exception("No text extracted!")
    logging.info("✅ Extraction complete")

    # 2. Preprocess
    doc = {
        "file": original_name or os.path.basename(local_file_path),
        "category": category,
        "content": extracted['text']
    }
    processed_list = preprocess_document_list([doc])
    processed_doc = processed_list[0]
    chunk_dicts = [
        {
            "text": chunk["content"],
            "filename": processed_doc["file"],
            "category": processed_doc["category"],
            "chunk_index": chunk["chunk_id"]
        }
        for chunk in processed_doc["chunks"]
    ]
    metadata = processed_doc
    logging.info("✅ Preprocessing complete")

    # 3. Embed
    embeddings = generate_embeddings(chunk_dicts)
    logging.info("✅ Embedding complete")

    # 4. Push to Pinecone
    from modules.vectorDB.vector_db_pinecone import insert_embeddings
    pinecone_result = insert_embeddings(embeddings)
    logging.info("✅ Pushed to Pinecone")

    # (Optional) Log to MongoDB
    # ... your logging code here ...

    return {
        "status": "completed",
        "chunks": len(chunk_dicts),
        "file": original_name or os.path.basename(local_file_path)
    }

# CLI usage for dev/testing
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("❌ Usage: python auto_embed_and_push.py <local_file_path> [original_name] [category]")
        sys.exit(1)
    local_file_path = sys.argv[1]
    original_name = sys.argv[2] if len(sys.argv) > 2 else ""
    category = sys.argv[3] if len(sys.argv) > 3 else "Other"

    out = run_pipeline(local_file_path, original_name, category)
    print(out)

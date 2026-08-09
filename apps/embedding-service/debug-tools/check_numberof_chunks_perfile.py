from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.getenv("MONGODB_URI")
MONGO_DB = os.getenv("MONGODB_DB", "chatbot")  # Your DB name

mongo_client = MongoClient(MONGO_URI)
db = mongo_client[MONGO_DB]

jobs = list(db.embedding_jobs.find())

print(f"📦 Total files processed: {len(jobs)}\n")
print("📄 Chunks per file:")

for job in jobs:
    # Try several possible locations for filename
    fname = (
        job.get("metadata", {}).get("original_name")
        or job.get("metadata", {}).get("filename")
        or job.get("file")
        or job.get("original_name")
        or job.get("filename")
        or "UNKNOWN"
    )
    count = job.get("chunks_count", "UNKNOWN")
    cat = job.get("category", "UNKNOWN")
    print(f"• {fname} ({cat}): {count} chunks")

categories = set(job.get("category", "UNKNOWN") for job in jobs)
print("\n📁 Categories detected:", categories)

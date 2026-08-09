# scripts/feedback_to_fewshot.py
import os
import json
import logging
from pymongo import MongoClient

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGODB_URI")  # e.g. "mongodb+srv://user:pwd@cluster.mongodb.net"
MONGO_DB = os.getenv("MONGODB_DB", "your_db_name")  # Use your real DB name
MAX_EXAMPLES = int(os.getenv("FEWSHOT_LIMIT", "20"))  # Limit for few-shot
FEWSHOT_OUTPUT = os.path.join(os.path.dirname(__file__), "few_shot_examples.json")

def is_good(entry):
    # Only thumbs up OR reviewed thumbs down with clear comment/tag
    if entry.get('feedback') == 'up':
        return True
    if entry.get('feedback') == 'down' and entry.get('reviewed') and (
        (entry.get('tags') and 'Wrong' in entry['tags']) or
        (entry.get('comment') and len(entry.get('comment')) > 10)
    ):
        return True
    return False

def extract_examples(max_examples=MAX_EXAMPLES):
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        db = client[MONGO_DB]
        feedback_col = db["feedback"]

        # Try to actually connect (will raise if not possible)
        client.server_info()

        feedback = list(feedback_col.find({}).sort("timestamp", -1))
        good_examples = [e for e in feedback if is_good(e)]
        few_shot = [
            {
                "question": e.get("question", ""),
                "answer": e.get("claudeResponse", ""),
                "tags": e.get("tags", []),
                "resourceType": e.get("resourceType", "Unknown"),
                "sender": e.get("sender", None)
            } for e in good_examples[:max_examples]
        ]

        with open(FEWSHOT_OUTPUT, "w", encoding="utf-8") as f:
            json.dump(few_shot, f, indent=2, ensure_ascii=False)
        logger.info("Exported %d few-shot examples from MongoDB -> %s", len(few_shot), FEWSHOT_OUTPUT)
    except Exception as e:
        logger.warning("Could not update few-shot examples from MongoDB: %s", e)
        # Optionally, keep the old few_shot_examples.json as-is (no update)

if __name__ == "__main__":
    extract_examples()

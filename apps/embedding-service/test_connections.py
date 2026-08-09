import os
from pymongo import MongoClient
import urllib.request
import json
import ssl

def test_pinecone():
    print("Testing Pinecone...")
    api_key = "[REDACTED_PINECONE_KEY]"
    url = "https://api.pinecone.io/indexes"
    req = urllib.request.Request(url, headers={"Api-Key": api_key})
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, context=ctx, timeout=5) as response:
            data = json.loads(response.read().decode())
            print(f"Pinecone Connection Successful. Indexes: {[i.get('name') for i in data.get('indexes', [])]}")
    except Exception as e:
        print(f"Pinecone Connection Failed: {e}")

def test_mongo():
    print("Testing MongoDB...")
    uri = "[REDACTED_MONGODB_URI]"
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("MongoDB Connection Successful")
    except Exception as e:
        print(f"MongoDB Connection Failed: {e}")

if __name__ == "__main__":
    test_pinecone()
    test_mongo()

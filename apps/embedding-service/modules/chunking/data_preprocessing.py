# modules/data_preprocessing.py

import os
import json
import re
import spacy
import tiktoken
from typing import List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DEBUG_OUTPUT = os.getenv("DEBUG_OUTPUT", "False") == "True"
CHUNK_TOKEN_LIMIT = int(os.getenv("CHUNK_TOKEN_LIMIT", "800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))

# Load NLP/tokenizer
try:
    nlp = spacy.load("en_core_web_sm")
except Exception:
    nlp = spacy.blank("en")
    nlp.add_pipe("sentencizer")
encoding = tiktoken.encoding_for_model("gpt-4")

EMBEDDING_VERSION = "v2"

def clean_text(text):
    """
    Normalize whitespace without destroying punctuation, casing, or paragraph structure.

    What this does:
      1. Replace hyphens between digits with a space (e.g. "5-6" -> "5 6").
      2. Strip non-printable control characters (except whitespace).
      3. Collapse runs of spaces/tabs within a line to a single space.
      4. Normalize 3+ consecutive newlines to exactly two (paragraph break).
      5. Strip leading/trailing whitespace.

    What this does NOT do (by design):
      - Remove or alter non-numeric hyphens or punctuation.
      - Change casing.
      - Collapse paragraph-separating newlines into spaces.
    """
    # Preserve hyphens between digits (e.g. "5-6" -> "5-6")
    text = re.sub(r'(?<=\d)-(?=\d)', '-', text)
    # Remove non-printable control characters (keep \n, \r, \t, space)
    text = re.sub(r'[^\S\n\r\t ]+', '', text)
    # Collapse horizontal whitespace runs (spaces/tabs) within lines
    text = re.sub(r'[^\S\n]+', ' ', text)
    # Normalize excessive blank lines (3+) to a single paragraph break
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def split_into_chunks(text, max_tokens=CHUNK_TOKEN_LIMIT, overlap=CHUNK_OVERLAP):
    paragraphs = text.split('\n')
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    chunks = []
    current_chunk = []
    current_tokens = 0

    for para in paragraphs:
        tokens = encoding.encode(para)
        token_count = len(tokens)

        if token_count > max_tokens:
            # Split large paragraph directly
            sub_chunks = [tokens[i:i + max_tokens] for i in range(0, token_count, max_tokens)]
            for sub in sub_chunks:
                chunk_text = encoding.decode(sub)
                chunks.append(chunk_text)
            continue

        if current_tokens + token_count <= max_tokens:
            current_chunk.append(para)
            current_tokens += token_count
        else:
            chunks.append(" ".join(current_chunk))
            # Overlap tokens
            if overlap:
                overlap_text = encoding.decode(encoding.encode(" ".join(current_chunk))[-overlap:])
                current_chunk = [overlap_text, para]
                current_tokens = len(encoding.encode(overlap_text)) + token_count
            else:
                current_chunk = [para]
                current_tokens = token_count

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks

def tokenize_and_metadata(data, token_limit=CHUNK_TOKEN_LIMIT):
    for item in data:
        cleaned_content = clean_text(item['content'])
        doc = nlp(cleaned_content)
        sentences = [sent.text for sent in doc.sents]
        words = [token.text for token in doc if not token.is_punct]
        chunks = split_into_chunks(cleaned_content, token_limit)
        print(f"[File] {item['file']} -> {len(chunks)} chunks")

        item['cleaned_content'] = cleaned_content
        item['sentences'] = sentences
        item['word_count'] = len(words)
        chunk_dicts = []
        for idx, chunk in enumerate(chunks):
            page_num = "Unknown"
            if item.get("pages"):
                search_str = chunk[:100].strip().lower()
                if search_str:
                    for p in item["pages"]:
                        if search_str in p["text"].lower():
                            page_num = p["page"]
                            break
                            
            chunk_dicts.append({
                "chunk_id": idx + 1,
                "content": chunk,
                "token_count": len(encoding.encode(chunk)),
                "page": page_num,
                "embedding_version": EMBEDDING_VERSION
            })
        item['chunks'] = chunk_dicts
    return data

# This function can be called from your embedding-service app, which will save to MongoDB
def preprocess_document_list(document_list: List[Dict]) -> List[Dict]:
    """
    Main entry for microservice. Takes a list of {file, category, content}, returns same with chunks.
    """
    return tokenize_and_metadata(document_list, token_limit=CHUNK_TOKEN_LIMIT)

# For CLI/dev only: you can remove this in production!
if __name__ == "__main__":
    INPUT_FILE = os.getenv("EXTRACTED_DATA_JSON")
    OUTPUT_FILE = os.getenv("PREPROCESSED_JSON")
    import sys
    files_to_process = sys.argv[1:]

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if files_to_process:
        filtered = [item for item in data if item['file'] in [os.path.basename(fp) for fp in files_to_process]]
        processed_data = tokenize_and_metadata(filtered)
        if os.path.exists(OUTPUT_FILE):
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as fout:
                old_data = json.load(fout)
            old_data = [item for item in old_data if item['file'] not in [os.path.basename(fp) for fp in files_to_process]]
            processed_data = old_data + processed_data
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(processed_data, f, ensure_ascii=False, indent=4)
        print(f"✅ [Selective] Preprocessed {len(filtered)} files → {OUTPUT_FILE}")
    else:
        processed_data = tokenize_and_metadata(data)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(processed_data, f, ensure_ascii=False, indent=4)
        print(f"✅ Preprocessed data with optimized chunking saved to:\n📄 {OUTPUT_FILE}")

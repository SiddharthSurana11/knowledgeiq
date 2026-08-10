#!/usr/bin/env python3
"""
KnowledgeIQ Evaluation Harness
==============================
Offline script to measure retrieval and generation quality against a gold-standard
test set. Calls the live API Gateway HTTP endpoints (POST /api/chat) — does NOT
reimplement retrieval logic.

Prerequisites:
  - API Gateway, Embedding Service, and LLM Service must all be running.
  - Set EVAL_JWT_TOKEN env var to a valid JWT for authentication.
  - Review and correct gold_set.json before running (see eval/README.md).

Usage:
  python run_eval.py                       # Runs against current config
  python run_eval.py --api-url http://localhost:5000

Output:
  - eval/results_YYYYMMDD.json             # Full per-query results + summary
  - Stdout summary table                   # Screenshot-friendly for portfolio
"""

import os
import sys
import json
import re
import time
import argparse
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load env variables from API Gateway
env_path = Path(__file__).parent.parent / 'apps' / 'api-gateway' / '.env'
if not env_path.exists():
    env_path = Path(__file__).parent.parent / '.env'
load_dotenv(str(env_path))

# Ensure UTF-8 output encoding on Windows terminals
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ─── Configuration ──────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
GOLD_SET_PATH = SCRIPT_DIR / "gold_set.json"
RESULTS_DIR = SCRIPT_DIR

# MongoDB connection for supersession checks
MONGO_URI = os.getenv("MONGODB_URI", "")
MONGO_DB = os.getenv("MONGODB_DB", "knowledgeiq")

# ─── Helpers ────────────────────────────────────────────────────────────────

def load_gold_set():
    with open(GOLD_SET_PATH, "r", encoding="utf-8") as f:
        entries = json.load(f)
    # Warn about placeholder entries
    placeholder_count = sum(
        1 for e in entries
        if e.get("expected_documentId") == "PLACEHOLDER_REPLACE_ME"
    )
    if placeholder_count > 0:
        print(f"\n⚠️  WARNING: {placeholder_count}/{len(entries)} gold set entries still have "
              f"PLACEHOLDER_REPLACE_ME documentIds. Results for those entries will be meaningless.")
        print("   Edit eval/gold_set.json and replace with actual documentIds from MongoDB.\n")
    return entries


def call_chat_api(query, category, api_url, jwt_token):
    """Call POST /api/chat and return the parsed JSON response."""
    headers = {"Content-Type": "application/json"}
    if jwt_token:
        headers["Authorization"] = f"Bearer {jwt_token}"

    payload = {"message": query, "history": [], "userId": "eval_harness"}
    if category:
        payload["category"] = category
        payload["scope"] = "category"

    try:
        resp = requests.post(
            f"{api_url}/api/chat",
            json=payload,
            headers=headers,
            timeout=120
        )
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        print(f"  ❌ HTTP {e.response.status_code}: {e.response.text[:200]}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Request failed: {e}")
        return None


def check_supersession(document_id):
    """
    Check if a document is superseded by querying MongoDB directly.
    Returns True if the document has status='superseded'.
    """
    if not MONGO_URI:
        return None  # Can't check without MongoDB connection

    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[MONGO_DB]
        doc = db.documents.find_one(
            {"documentId": document_id},
            {"status": 1}
        )
        client.close()
        if doc:
            return doc.get("status") == "superseded"
    except Exception as e:
        print(f"  ⚠️  MongoDB supersession check failed: {e}")
        return None


def normalize_text_for_eval(text: str) -> str:
    """Strip punctuation and collapse whitespace, lowercase."""
    if not text:
        return ""
    text = re.sub(r'[^\w\s]', '', text.lower())
    return ' '.join(text.split())

def check_faithfulness(expected: str, reply: str) -> bool:
    """
    Evaluates whether expected answer facts appear in the reply text.
    
    Normalization & Resiliency Rules:
    1. Extract user-facing text inside <answer>...</answer> tags if XML isolation tags are present.
    2. Lowercase and strip punctuation/extra whitespace from both expected substring and reply.
    3. Direct normalized substring check is attempted first.
    4. Fallback: Significant token overlap check. Filters out common English stopwords
       ("and", "the", "for", "by", "with", "of", "in", "an", "a", "to", "or", "is", "are").
       For synthesized prose where word order varies (e.g. email aliases like 'buscondmicrosoftcom'
       or multi-word names like 'Michael Howard and Steve Lipner'), requires >= 75% of key semantic
       tokens to be present in the normalized reply.
    """
    if not expected or not reply:
        return False
        
    answer_match = re.search(r'<answer>(.*?)</answer>', reply, re.DOTALL | re.IGNORECASE)
    eval_text = answer_match.group(1) if answer_match else reply

    norm_expected = normalize_text_for_eval(expected)
    norm_reply = normalize_text_for_eval(eval_text)
    
    if norm_expected in norm_reply:
        return True

    stopwords = {"and", "the", "for", "by", "with", "of", "in", "an", "a", "to", "or", "is", "are", "alias"}
    tokens = [t for t in norm_expected.split() if t not in stopwords and len(t) > 1]
    
    if not tokens:
        return False
        
    matching_tokens = sum(1 for t in tokens if t in norm_reply)
    ratio = matching_tokens / len(tokens)
    return ratio >= 0.75


def evaluate_entry(entry, api_url, jwt_token):
    """Evaluate a single gold set entry. Returns a result dict."""
    entry_id = entry["id"]
    query = entry["query"]
    expected_doc_id = entry.get("expected_documentId")
    expected_contains = entry.get("expected_answer_contains")
    test_type = entry.get("test_type", "standard")
    category = entry.get("category")

    print(f"  [{entry_id}] {test_type.upper():20s} | {query[:60]}...", end="", flush=True)

    start_time = time.time()
    response = call_chat_api(query, category, api_url, jwt_token)
    latency_ms = int((time.time() - start_time) * 1000)

    if response is None:
        print(f" → ERROR ({latency_ms}ms)")
        return {
            "id": entry_id, "query": query, "test_type": test_type,
            "status": "error", "latency_ms": latency_ms,
            "recall_at_5": False, "supersession_correct": None,
            "abstention_correct": None, "faithfulness_correct": None
        }

    # Extract response data — handle both {data: {...}} and flat response shapes
    data = response.get("data", response)
    reply_text = data.get("reply", "")
    doc_hits = data.get("document_hits", [])
    is_refusal = data.get("is_refusal", False)

    # ── Recall@5 ────────────────────────────────────────────────────────
    recall_at_5 = False
    if expected_doc_id and expected_doc_id != "PLACEHOLDER_REPLACE_ME":
        hit_doc_ids = [h.get("documentId", "") for h in doc_hits[:5]]
        recall_at_5 = expected_doc_id in hit_doc_ids

    # ── Supersession Accuracy ───────────────────────────────────────────
    supersession_correct = None
    if test_type == "supersession" and expected_doc_id and expected_doc_id != "PLACEHOLDER_REPLACE_ME":
        # Check that the TOP returned document is NOT superseded
        if doc_hits:
            top_doc_id = doc_hits[0].get("documentId", "")
            is_superseded = check_supersession(top_doc_id)
            if is_superseded is not None:
                supersession_correct = not is_superseded  # Correct if NOT superseded
            else:
                supersession_correct = None  # Couldn't verify

    # ── Abstention Correctness ──────────────────────────────────────────
    # Uses the actual isRefusal boolean from the hallucination guard,
    # not text pattern matching (which would be fragile).
    abstention_correct = None
    if test_type == "no_answer_expected":
        abstention_correct = is_refusal is True

    # ── Faithfulness Proxy ──────────────────────────────────────────────
    faithfulness_correct = None
    if expected_contains and test_type != "no_answer_expected":
        faithfulness_correct = check_faithfulness(expected_contains, reply_text)

    status_icon = "✅" if (recall_at_5 or test_type == "no_answer_expected") else "❌"
    print(f" → {status_icon} ({latency_ms}ms)")

    return {
        "id": entry_id,
        "query": query,
        "test_type": test_type,
        "status": "ok",
        "latency_ms": latency_ms,
        "recall_at_5": recall_at_5,
        "supersession_correct": supersession_correct,
        "abstention_correct": abstention_correct,
        "faithfulness_correct": faithfulness_correct,
        "is_refusal": is_refusal,
        "top_doc_id": doc_hits[0].get("documentId", "") if doc_hits else None,
        "top_confidence": doc_hits[0].get("confidence", 0) if doc_hits else 0,
        "reply_preview": reply_text[:150] + "..." if len(reply_text) > 150 else reply_text,
        "doc_hits_count": len(doc_hits)
    }


def compute_summary(results):
    """Compute aggregate metrics from per-query results."""

    def safe_rate(items, key):
        valid = [r for r in items if r.get(key) is not None]
        if not valid:
            return {"correct": 0, "total": 0, "rate": 0.0}
        correct = sum(1 for r in valid if r[key])
        return {"correct": correct, "total": len(valid), "rate": round(correct / len(valid), 4)}

    ok_results = [r for r in results if r["status"] == "ok"]
    standard = [r for r in ok_results if r["test_type"] == "standard"]
    supersession = [r for r in ok_results if r["test_type"] == "supersession"]
    no_answer = [r for r in ok_results if r["test_type"] == "no_answer_expected"]

    latencies = [r["latency_ms"] for r in ok_results]

    return {
        "recall_at_5": safe_rate(standard + supersession, "recall_at_5"),
        "supersession_accuracy": safe_rate(supersession, "supersession_correct"),
        "abstention_correctness": safe_rate(no_answer, "abstention_correct"),
        "faithfulness_proxy": safe_rate(standard + supersession, "faithfulness_correct"),
        "total_queries": len(results),
        "successful_queries": len(ok_results),
        "error_queries": len(results) - len(ok_results),
        "avg_latency_ms": round(sum(latencies) / len(latencies), 0) if latencies else 0,
        "p95_latency_ms": sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0
    }


def print_summary_table(summary, mode_label=""):
    """Print a clean, screenshot-friendly summary table to stdout."""
    header = f"{'=' * 60}"
    title = f"  KnowledgeIQ Evaluation Results{f' — {mode_label}' if mode_label else ''}"

    print(f"\n{header}")
    print(title)
    print(header)
    print(f"  {'Metric':<30s} {'Score':>10s} {'Detail':>16s}")
    print(f"  {'─' * 30}  {'─' * 10} {'─' * 16}")

    def fmt(metric_dict):
        rate_pct = f"{metric_dict['rate'] * 100:.1f}%"
        detail = f"{metric_dict['correct']}/{metric_dict['total']}"
        return rate_pct, detail

    r5_score, r5_detail = fmt(summary["recall_at_5"])
    print(f"  {'Recall@5':<30s} {r5_score:>10s} {r5_detail:>16s}")

    ss_score, ss_detail = fmt(summary["supersession_accuracy"])
    print(f"  {'Supersession Accuracy':<30s} {ss_score:>10s} {ss_detail:>16s}")

    ab_score, ab_detail = fmt(summary["abstention_correctness"])
    print(f"  {'Abstention Correctness':<30s} {ab_score:>10s} {ab_detail:>16s}")

    fp_score, fp_detail = fmt(summary["faithfulness_proxy"])
    print(f"  {'Faithfulness Proxy':<30s} {fp_score:>10s} {fp_detail:>16s}")

    print(f"  {'─' * 30}  {'─' * 10} {'─' * 16}")
    print(f"  {'Total Queries':<30s} {summary['total_queries']:>10d}")
    print(f"  {'Successful':<30s} {summary['successful_queries']:>10d}")
    print(f"  {'Errors':<30s} {summary['error_queries']:>10d}")
    print(f"  {'Avg Latency':<30s} {summary['avg_latency_ms']:>8.0f}ms")
    print(f"  {'P95 Latency':<30s} {summary['p95_latency_ms']:>8.0f}ms")
    print(header)


def run_eval(api_url, jwt_token, mode_label=""):
    """Run the full evaluation suite and return (results, summary)."""
    gold_set = load_gold_set()

    print(f"\n{'─' * 60}")
    print(f"  Running evaluation{f' ({mode_label})' if mode_label else ''}: {len(gold_set)} queries")
    print(f"  API: {api_url}")
    print(f"{'─' * 60}\n")

    results = []
    for entry in gold_set:
        result = evaluate_entry(entry, api_url, jwt_token)
        results.append(result)
        time.sleep(3)

    summary = compute_summary(results)
    print_summary_table(summary, mode_label)

    return results, summary


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="KnowledgeIQ Evaluation Harness")
    parser.add_argument("--api-url", default="http://localhost:5000",
                        help="Base URL of the API Gateway (default: http://localhost:5000)")
    parser.add_argument("--jwt-token", default=os.getenv("EVAL_JWT_TOKEN", ""),
                        help="JWT token for authentication (or set EVAL_JWT_TOKEN env var)")
    args = parser.parse_args()

    if not args.jwt_token:
        print("⚠️  No JWT token provided. If AUTH_ENABLED=true on the API gateway,")
        print("   requests will fail. Set EVAL_JWT_TOKEN env var or use --jwt-token.\n")

    # Run evaluation against current configuration
    results, summary = run_eval(args.api_url, args.jwt_token, mode_label="current config")

    # ── Save results ────────────────────────────────────────────────────
    timestamp = datetime.now().strftime("%Y%m%d")
    output_path = RESULTS_DIR / f"results_{timestamp}.json"

    output = {
        "timestamp": datetime.now().isoformat(),
        "api_url": args.api_url,
        "summary": summary,
        "per_query_results": results
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n📄 Results saved to: {output_path}")

    # ── Guidance for hybrid vs legacy comparison ────────────────────────
    print("\n" + "=" * 60)
    print("  TO COMPARE HYBRID vs LEGACY RETRIEVAL:")
    print("=" * 60)
    print("  1. Run this script with HYBRID_RETRIEVAL_ENABLED=true in")
    print("     api-gateway .env → produces results for hybrid mode.")
    print("  2. Set HYBRID_RETRIEVAL_ENABLED=false, restart api-gateway.")
    print("  3. Run this script again → produces results for legacy mode.")
    print("  4. Compare the two results_YYYYMMDD.json files.")
    print("=" * 60)


if __name__ == "__main__":
    main()

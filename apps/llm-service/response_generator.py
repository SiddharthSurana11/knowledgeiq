import os
import json
import logging
import random
import re
from dotenv import load_dotenv

load_dotenv()

# ── Provider-agnostic LLM call ─────────────────────────────────────────────
from llm import get_provider
_llm = get_provider()
# ───────────────────────────────────────────────────────────────────────────

# Sentinel removed — using structured messages instead

FEWSHOT_PATH = os.getenv("FEWSHOT_PATH", "./few_shot_examples.json")
FEWSHOT_LIMIT = int(os.getenv("FEWSHOT_LIMIT", 20))

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


def load_prompt_module(module_name):
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", f"{module_name}.txt")
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        logging.warning(f"Could not load prompt module {module_name}: {e}")
        return ""


def load_few_shot_examples(n=5):
    if not os.path.exists(FEWSHOT_PATH):
        return []
    try:
        with open(FEWSHOT_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not data:
            return []
        return random.sample(data, min(n, len(data)))
    except Exception as e:
        logging.warning(f"Could not load few-shot examples: {e}")
        return []


def format_few_shot_examples_block(few_shot_examples):
    if not few_shot_examples:
        return ""
    block = "\n\n### EXAMPLE RESPONSES — Match this quality and format exactly ###\n"
    for i, ex in enumerate(few_shot_examples, 1):
        block += f"\nExample {i}:\nUser: {ex['question']}\nAssistant:\n{ex['answer']}\n"
    block += "\n### END OF EXAMPLES ###\n"
    return block


# ── Reasoning leakage patterns ─────────────────────────────────────────────
# These are signatures of a model externalizing its chain-of-thought.
# They should NEVER appear in a user-facing answer.
_LEAKAGE_MARKERS = [
    r"we need to answer",
    r"we need to (extract|synthesize|combine|check|verify|find|look)",
    r"let'?s (extract|parse|look|check|craft|answer|synthesize|approach)",
    r"from the (first|second|third|last) chunk",
    r"from the evidence[,:]",
    r"the evidence (includes|contains|says|mentions|shows)",
    r"now (we need|let'?s|we should|we must|we can)",
    r"we should answer",
    r"we must not",
    r"we can (also|note|add|include)",
    r"(also mention|also note|also include)",
    r"let me (check|verify|look|extract|parse)",
    r"scanning (chunks|evidence|documents)",
    r"based on retrieved (chunks|evidence|content)",
    r"retrieved evidence (includes|contains|shows)",
    r"bullet \d+:",
    r"we have \d+ bullets?",
    r"could (combine|add|drop|merge|include)",
    r"^thus (answer|the answer):",
    r"^so (the answer|we can say)",
    r"the user is asking",
    r"i will scan",
    r"plan:",
    r"final answer formulation",
    r"check constraints",
    r"refining:",
    r"xml tags used",
    r"analyzing retrieved evidence",
    r"chunk \d+ mentions"
]
_LEAKAGE_RE = re.compile("|".join(_LEAKAGE_MARKERS), re.IGNORECASE | re.MULTILINE)


def sanitize_llm_response(raw_response: str):
    """
    XML Envelope Extraction:
    Parses out ONLY the content inside <answer>...</answer> tags.
    If <answer> tags are missing, logs a warning and executes robust anchor extraction and leakage scanning.
    """
    # First, strip <scratchpad> or <thinking> blocks (both closed and unclosed)
    response_no_scratchpad = re.sub(
        r'<(scratchpad|thinking)>.*?(?:</\1>|$)', '', raw_response,
        flags=re.DOTALL | re.IGNORECASE
    ).strip()

    cleaned_answer = ""
    if "<answer>" in response_no_scratchpad and "</answer>" in response_no_scratchpad:
        start_idx = response_no_scratchpad.find("<answer>") + len("<answer>")
        end_idx = response_no_scratchpad.find("</answer>")
        cleaned_answer = response_no_scratchpad[start_idx:end_idx].strip()
    elif "<answer>" in response_no_scratchpad:
        start_idx = response_no_scratchpad.find("<answer>") + len("<answer>")
        cleaned_answer = response_no_scratchpad[start_idx:].strip()
    else:
        # Fallback path when model missing <answer> envelope
        logging.warning("[response_generator] Model response missing <answer> XML envelope. Executing robust fallback anchor extraction.")
        cleaned_answer = response_no_scratchpad
        
        # Look for standard answer headers like "**[One-line", "**Headline", "**Key Points", "Headline:"
        header_patterns = [
            r'(\*\*\[One-line headline answer\]\*\*.*)',
            r'(\*\*Headline.*)',
            r'(Headline:.*)',
            r'(\*\*Key Points\*\*.*)',
            r'(\*\*Summary\*\*.*)'
        ]
        anchor_found = False
        for pattern in header_patterns:
            anchor_match = re.search(pattern, cleaned_answer, re.DOTALL | re.IGNORECASE)
            if anchor_match:
                logging.warning("[response_generator] Extracted clean answer from anchor header pattern.")
                cleaned_answer = anchor_match.group(1).strip()
                anchor_found = True
                break
                
        if not anchor_found and "**" in cleaned_answer:
            first_bold_idx = cleaned_answer.find("**")
            if first_bold_idx > 0:
                prefix = cleaned_answer[:first_bold_idx]
                if _LEAKAGE_RE.search(prefix) or any(kw in prefix.lower() for kw in ["user is asking", "i will scan", "plan:", "formulation", "constraints"]):
                    logging.warning(
                        "[response_generator] Reasoning leakage detected in fallback prefix (%d chars). "
                        "Extracting answer from first '**'.", first_bold_idx
                    )
    # Fallback if cleaned_answer becomes empty after stripping scratchpad
    if not cleaned_answer.strip():
        cleaned_answer = "The retrieved evidence does not contain sufficient details to answer this query confidently."

    # Strip surrounding quotes if the model quoted its entire answer
    if cleaned_answer.startswith('"') and cleaned_answer.endswith('"'):
        cleaned_answer = cleaned_answer[1:-1].strip()
    if cleaned_answer.startswith("'") and cleaned_answer.endswith("'"):
        cleaned_answer = cleaned_answer[1:-1].strip()

    # Extract follow-up question for frontend compatibility
    follow_up = ""
    match = re.search(r"\*\*Follow-up suggestion\*\*[:\s]*(.*?)(?:\n|$)", cleaned_answer, re.I)
    if not match:
        match = re.search(r"Follow[- ]?up suggestion[:\s]*(.*?)(?:\n|$)", cleaned_answer, re.I)
    if match:
        follow_up = match.group(1).strip().strip('*').strip()

    return cleaned_answer, follow_up


import time

def generate_response(retrieved_content, user_query, memory_block="", is_refusal=False):
    # ── Load prompt modules ────────────────────────────────────────────────
    system_prompt = load_prompt_module("system")
    grounding_rules = load_prompt_module("grounding")
    formatting_rules = load_prompt_module("formatting")
    refusal_rules = load_prompt_module("refusal")
    citation_rules = load_prompt_module("citation_rules")

    # Format top 4 retrieved evidence chunks for optimal coverage & prompt payload safety
    xml_chunks = []
    for chunk in (retrieved_content or [])[:4]:
        meta = chunk.get("metadata", {})
        text = meta.get("text", "")
        if not text.strip(): continue
        
        filename = meta.get("filename", "")
        chunk_idx = meta.get("chunk_index", 0)
        
        # Normalize PyMuPDF OCR hyphen/decimal glyph drops (e.g. "56 years" -> "5.6 years")
        text = re.sub(r'\b([1-9])([0-9])\s+years\b', r'\1.\2 years', text, flags=re.I)
        
        xml = f'<chunk index="{chunk_idx}" file="{filename}">\n{text}\n</chunk>'
        xml_chunks.append(xml)
        
    retrieved_text = "\n\n".join(xml_chunks)

    few_shot_examples = load_few_shot_examples(n=1)
    few_shot_block = format_few_shot_examples_block(few_shot_examples)

    chunk_count = len(xml_chunks)

    # ── Build system and user blocks ──────────────────────────────────────
    if is_refusal:
        system_block = (
            f"{system_prompt}\n\n"
            f"### Refusal Contract ###\n{refusal_rules}\n\n"
            f"{few_shot_block}"
        )
        user_block = (
            f"### Conversation History ###\n{memory_block}\n\n"
            f"### User Question ###\n{user_query}\n\n"
            "Place your internal analysis in <scratchpad>...</scratchpad> and your refusal response strictly inside <answer>...</answer>."
        )

    elif not retrieved_text.strip():
        system_block = (
            f"{system_prompt}\n\n"
            f"{few_shot_block}"
        )
        user_block = (
            f"### Conversation History ###\n{memory_block}\n\n"
            "No relevant documents were found. Politely explain inside <answer>...</answer> that no relevant "
            "documentation is available and suggest the user rephrase or upload "
            "relevant documents. Place any internal thinking inside <scratchpad>...</scratchpad>.\n\n"
            f"### User Question ###\n{user_query}"
        )

    else:
        system_block = (
            f"{system_prompt}\n\n"
            f"### Grounding Contract ###\n{grounding_rules}\n\n"
            f"### Output Format Contract ###\n{formatting_rules}\n\n"
            f"### Citation Contract ###\n{citation_rules}\n\n"
            f"{few_shot_block}"
        )
        user_block = (
            f"### Conversation History ###\n{memory_block}\n\n"
            f"### Retrieved Evidence ({chunk_count} chunks) ###\n"
            f"{retrieved_text}\n\n"
            f"### User Question ###\n{user_query}\n\n"
            "Synthesize the evidence above and write the final response. "
            "Place ALL internal reasoning strictly inside <scratchpad>...</scratchpad> "
            "and your final user-facing answer strictly inside <answer>...</answer>. "
            "Do NOT write any text outside of these tags."
        )

    messages = [
        {"role": "system", "content": system_block},
        {"role": "user", "content": user_block}
    ]

    telemetry_bag = {}
    
    start_time = time.time()
    raw_response = _llm.complete(messages=messages, telemetry_bag=telemetry_bag)
    latency_ms = int((time.time() - start_time) * 1000)
    
    cleaned_answer, follow_up = sanitize_llm_response(raw_response)

    resource_type = "Unknown"
    for chunk in sorted(retrieved_content or [], key=lambda x: x.get("score", 0), reverse=True):
        category = chunk.get("metadata", {}).get("category", "").strip()
        if category:
            resource_type = category
            break

    # Prompt Debug Mode logging
    if os.getenv("LLM_DEBUG_MODE", "false").lower() == "true":
        logging.info(
            "\n=== LLM DEBUG MODE ===\n"
            "Model: %s\n"
            "Retrieved Chunks: %d\n"
            "Latency: %d ms\n"
            "Token Usage: %s\n"
            "--- Messages Payload ---\n"
            "%s\n"
            "=======================",
            telemetry_bag.get("model_name", "unknown"),
            chunk_count,
            latency_ms,
            json.dumps({
                "prompt": telemetry_bag.get("prompt_tokens", 0),
                "completion": telemetry_bag.get("completion_tokens", 0),
                "total": telemetry_bag.get("total_tokens", 0)
            }),
            json.dumps(messages, indent=2)
        )

    return {
        "answer": cleaned_answer,
        "follow_up": follow_up,
        "document_hits": [
            chunk.get("metadata", {}).get("filename")
            for chunk in (retrieved_content or [])
            if chunk.get("metadata", {}).get("filename")
        ],
        "resource_type": resource_type,
        "telemetry_json": json.dumps(telemetry_bag)
    }

# For import by app.py, not for CLI

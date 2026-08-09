# KnowledgeIQ Platform — Local Setup & Development Guide

## Local Dependencies & Prerequisites

### 1. Native Tesseract OCR Engine (Required for Image/PDF Extraction)
The `embedding-service` uses `pytesseract` for fallback OCR extraction on scanned PDFs (such as image-only documents like `Microsoft-Policymaker-Guide-Privacy.pdf`). PyTesseract requires the native Tesseract binary installed on your OS:

#### Windows Local Dev Installation:
1. Install Tesseract OCR via Chocolatey:
   ```cmd
   choco install tesseract
   ```
   Or download the official Windows installer from: https://github.com/UB-Mannheim/tesseract/wiki
2. Ensure Tesseract is added to your system `PATH`:
   - Default install path: `C:\Program Files\Tesseract-OCR\tesseract.exe`
3. Verify installation:
   ```cmd
   tesseract --version
   ```

#### Linux / Container Deployment (Phase 5):
Install native binary via `apt`:
```bash
apt-get update && apt-get install -y tesseract-ocr tesseract-ocr-eng
```

---

## Services Overview

- **API Gateway**: `apps/api-gateway` (Node.js, Port `5000`)
- **Embedding Service**: `apps/embedding-service` (Python gRPC, Port `50052`)
- **LLM Service**: `apps/llm-service` (Python gRPC, Port `50053`)

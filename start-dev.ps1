# KnowledgeIQ Local Development Startup Script (Windows PowerShell)
# Automatically spawns 4 terminal windows with venv activation for fast non-Docker iteration.

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting KnowledgeIQ Local Development Services" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$root = Get-Location

# 1. Embedding Service (Python)
Write-Host "[1/4] Starting Embedding Service (gRPC 50052)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\embedding-service'; if (Test-Path venv\Scripts\Activate.ps1) { .\venv\Scripts\Activate.ps1 }; python app.py"

# 2. LLM Service (Python)
Write-Host "[2/4] Starting LLM Service (gRPC 50053)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\llm-service'; if (Test-Path venv\Scripts\Activate.ps1) { .\venv\Scripts\Activate.ps1 }; python app.py"

# 3. API Gateway (Node.js)
Write-Host "[3/4] Starting API Gateway (HTTP 5000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\api-gateway'; npm start"

# 4. Frontend React App (Vite)
Write-Host "[4/4] Starting Frontend React UI (HTTP 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\frontend_reactjs'; npm run dev"

Write-Host "`n✅ All 4 local services spawned successfully in separate windows." -ForegroundColor Green
Write-Host "Access Frontend UI at: http://localhost:5173" -ForegroundColor Cyan

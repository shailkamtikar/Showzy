# Starts the API (port 8000) and the web app (port 5173) in two new PowerShell windows.
# Usage, from the repo root:  .\scripts\dev.ps1
$root = Split-Path -Parent $PSScriptRoot
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\api'; .\.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\web'; npm run dev"
Write-Host 'API  -> http://localhost:8000/docs'
Write-Host 'Web  -> http://localhost:5173'

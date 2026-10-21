# Valhalla Docker Runner Script for Windows PowerShell
$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Valhalla 3D Elevation & Routing Docker Setup        " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker engine is not running."
    }
} catch {
    Write-Host "[ERROR] Docker is not detected or Docker Desktop is not started." -ForegroundColor Red
    Write-Host "Please start Docker Desktop and ensure it is allocated at least 4-8 GB of RAM." -ForegroundColor Yellow
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "[INFO] Starting Valhalla Docker container in background..." -ForegroundColor Green
docker compose up -d

Write-Host "[INFO] Container started. Monitoring build logs (Press Ctrl+C anytime to stop viewing logs)..." -ForegroundColor Yellow
Write-Host "[INFO] Look for 'Server started on port 8002' to confirm readiness." -ForegroundColor Yellow
docker logs -f valhalla

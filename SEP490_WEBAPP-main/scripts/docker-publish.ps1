<#
.SYNOPSIS
  Build and push Docker images (backend + gpu-service) to Docker Hub.

.DESCRIPTION
  - No hardcoded secret. Pass username + token (Personal Access Token) via params
    or the DOCKERHUB_TOKEN env var; login uses --password-stdin so the token is
    not echoed into shell history.
  - Create an Access Token at https://hub.docker.com/settings/security (Read/Write).
  - The backend image is small; the gpu-service image is HEAVY (torch/unsloth) -
    only build it when needed (-Gpu / -All).

.PARAMETER User
  Docker Hub username (image namespace). Required.

.PARAMETER Token
  Docker Hub Personal Access Token or password. If empty, reads DOCKERHUB_TOKEN,
  otherwise prompts securely.

.PARAMETER Tag
  Image tag. Default "latest".

.PARAMETER Backend
  Build/push backend only (default when nothing is specified).

.PARAMETER Gpu
  Build/push gpu-service only.

.PARAMETER All
  Build/push both backend and gpu-service.

.PARAMETER Platform
  Target platform. Default linux/amd64 (matches production server).

.PARAMETER NoPush
  Build only, do NOT push (local test).

.EXAMPLE
  $env:DOCKERHUB_TOKEN="dckr_pat_xxx"; ./scripts/docker-publish.ps1 -User viht7

.EXAMPLE
  ./scripts/docker-publish.ps1 -User viht7 -Token dckr_pat_xxx -All -Tag v1.0.0

.EXAMPLE
  ./scripts/docker-publish.ps1 -User viht7 -All -NoPush
#>
param(
  [Parameter(Mandatory = $true)][string]$User,
  [string]$Token = $env:DOCKERHUB_TOKEN,
  [string]$Tag = 'latest',
  [switch]$Backend,
  [switch]$Gpu,
  [switch]$All,
  [string]$Platform = 'linux/amd64',
  [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

# Repo root = parent of scripts/
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Default: backend only when nothing is chosen.
if (-not ($Backend -or $Gpu -or $All)) { $Backend = $true }
if ($All) { $Backend = $true; $Gpu = $true }

$BackendImage = "$User/trainner-be:$Tag"
$GpuImage = "$User/trainner-gpu:$Tag"

function Assert-LastExit([string]$What) {
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)." }
}

# --- 0. Check docker daemon ---
docker version --format '{{.Server.Version}}' | Out-Null
Assert-LastExit 'Docker daemon check'

# --- 1. Docker Hub login (skip when NoPush) ---
if (-not $NoPush) {
  if ([string]::IsNullOrWhiteSpace($Token)) {
    $secure = Read-Host -AsSecureString "Enter Docker Hub token/password for '$User'"
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  }
  Write-Host "==> Logging in to Docker Hub as '$User'..." -ForegroundColor Cyan
  $Token | docker login docker.io -u $User --password-stdin
  Assert-LastExit 'docker login'
  $Token = $null
}

# --- 2. Build & push BACKEND ---
if ($Backend) {
  Write-Host "==> Build backend: $BackendImage ($Platform)" -ForegroundColor Cyan
  docker build --platform $Platform -t $BackendImage -f "backend/Dockerfile" "backend"
  Assert-LastExit 'Build backend'
  if (-not $NoPush) {
    Write-Host "==> Push $BackendImage" -ForegroundColor Cyan
    docker push $BackendImage
    Assert-LastExit 'Push backend'
  }
}

# --- 3. Build & push GPU SERVICE (heavy) ---
if ($Gpu) {
  Write-Host "==> Build gpu-service: $GpuImage ($Platform) - may take several minutes" -ForegroundColor Cyan
  docker build --platform $Platform -t $GpuImage -f "gpu-service/Dockerfile" "gpu-service"
  Assert-LastExit 'Build gpu-service'
  if (-not $NoPush) {
    Write-Host "==> Push $GpuImage" -ForegroundColor Cyan
    docker push $GpuImage
    Assert-LastExit 'Push gpu-service'
  }
}

Write-Host ""
Write-Host "DONE." -ForegroundColor Green
if ($Backend) { Write-Host "  backend : $BackendImage" }
if ($Gpu) { Write-Host "  gpu     : $GpuImage" }
Write-Host ""
Write-Host "On the production server, point compose to the pushed images:" -ForegroundColor Yellow
Write-Host "  BACKEND_IMAGE=$BackendImage"
if ($Gpu) { Write-Host "  GPU_IMAGE=$GpuImage" }
Write-Host "  docker compose -p trainner -f docker-compose.prod.yml up -d"

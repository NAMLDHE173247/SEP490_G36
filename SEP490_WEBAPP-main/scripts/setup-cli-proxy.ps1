param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$RotateSecrets
)

$ErrorActionPreference = 'Stop'

function New-SecureValue {
  $bytes = [byte[]]::new(48)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-EnvValue([string]$Content, [string]$Name, [string]$Value) {
  $escaped = [Regex]::Escape($Name)
  if ($Content -match "(?m)^$escaped=") {
    return [Regex]::Replace($Content, "(?m)^$escaped=.*$", "$Name=$Value")
  }
  return $Content.TrimEnd() + [Environment]::NewLine + "$Name=$Value" + [Environment]::NewLine
}

$infraDir = Join-Path $Root 'infra\cli-proxy'
$examplePath = Join-Path $infraDir 'config.example.yaml'
$configPath = Join-Path $infraDir 'config.yaml'
$backendEnvPath = Join-Path $Root 'backend\.env'

if (-not (Test-Path -LiteralPath $examplePath)) { throw 'Missing CLIProxyAPI config.example.yaml.' }
if (-not (Test-Path -LiteralPath $backendEnvPath)) { throw 'Missing backend/.env.' }
if ((Test-Path -LiteralPath $configPath) -and -not $RotateSecrets) {
  $existingConfig = [IO.File]::ReadAllText($configPath)
  $existingConfig = $existingConfig.Replace('allow-remote: false', 'allow-remote: true')
  [IO.File]::WriteAllText($configPath, $existingConfig, [Text.UTF8Encoding]::new($false))
  Write-Output 'CLIProxyAPI config already exists. Use -RotateSecrets only when intentionally rotating both local secrets.'
  exit 0
}

$inferenceKey = New-SecureValue
$managementKey = New-SecureValue
$config = [IO.File]::ReadAllText($examplePath)
$config = $config.Replace('secret-key: ""', "secret-key: `"$managementKey`"")
$config = $config.Replace('REPLACE_WITH_RANDOM_INTERNAL_KEY', $inferenceKey)
[IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))

New-Item -ItemType Directory -Force -Path (Join-Path $infraDir 'auths'), (Join-Path $infraDir 'logs') | Out-Null

$backendEnv = [IO.File]::ReadAllText($backendEnvPath)
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_ENABLED' 'true'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_BASE_URL' 'http://127.0.0.1:8317/v1'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_API_KEY' $inferenceKey
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_MANAGEMENT_URL' 'http://127.0.0.1:8317'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_MANAGEMENT_KEY' $managementKey
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_MODEL' 'gpt-5-codex'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_FALLBACK_PROVIDER' 'openrouter'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_TIMEOUT_MS' '60000'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_CIRCUIT_FAILURES' '3'
$backendEnv = Set-EnvValue $backendEnv 'CLIPROXY_CIRCUIT_COOLDOWN_MS' '60000'
[IO.File]::WriteAllText($backendEnvPath, $backendEnv, [Text.UTF8Encoding]::new($false))

Write-Output 'CLIProxyAPI local configuration created. Secrets were not printed.'

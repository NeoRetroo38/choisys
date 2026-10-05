param(
    [ValidateSet('start', 'dev')][string]$Mode = 'start',
    [string]$EnvFile = $(if ($env:CHOISYS_ENV_FILE) { $env:CHOISYS_ENV_FILE } else { 'C:\Users\Admin\daemon.codex.env.local' })
)
$ErrorActionPreference = 'Stop'
$nodeArgs = @()
if (Test-Path -LiteralPath $EnvFile -PathType Leaf) { $nodeArgs += "--env-file=$EnvFile" }
elseif (-not $env:CHOISYS_LOCAL_API_TOKEN) { throw 'Local environment file or CHOISYS_LOCAL_API_TOKEN is required.' }
Push-Location $PSScriptRoot
try {
    if ($Mode -eq 'dev') { $nodeArgs += @('--import', 'tsx', '--watch', 'src/index.ts') }
    else { $nodeArgs += 'dist/index.js' }
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) { throw 'choisys-api exited with an error.' }
} finally { Pop-Location }

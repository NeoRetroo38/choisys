# Mantiene lo que se sirve en la red local siempre en la ultima version de origin/main.
#   .\scripts\lan-watch.ps1              vigila cada 60 s (lo arranca lan-always.ps1)
#   .\scripts\lan-watch.ps1 -Once        comprueba una vez y sale
#   .\scripts\lan-watch.ps1 -DryRun      solo dice que haria
# Solo avanza este worktree en fast-forward y solo si no tiene cambios sin commitear: nunca fuerza nada.
# Si cambian dependencias hace npm ci; si cambia la API o los paquetes, reinicia SOLO lo que corre desde este
# directorio (las cuentas en memoria se pierden al reiniciar la API). No toca procesos de otros worktrees.
param([int]$Interval = 60, [switch]$Once, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Git { param([Parameter(ValueFromRemainingArguments)]$a) $out = & git @a 2>&1; if ($LASTEXITCODE -ne 0) { throw "git $a : $out" }; $out }

function Stop-LanFromThisWorktree {
    $own = @($PID)
    Get-CimInstance Win32_Process | Where-Object {
        $_.ProcessId -notin $own -and $_.CommandLine -and $_.CommandLine -like "*$root*" -and
        $_.CommandLine -notlike '*lan-watch.ps1*' -and $_.Name -in 'node.exe', 'powershell.exe'
    } | ForEach-Object { & taskkill /PID $_.ProcessId /T /F | Out-Null }
}

function Update-Once {
    Invoke-Git fetch --quiet origin main | Out-Null
    $head = (Invoke-Git rev-parse HEAD).Trim()
    $main = (Invoke-Git rev-parse origin/main).Trim()
    if ($head -eq $main) { return $false }
    git merge-base --is-ancestor $head $main
    if ($LASTEXITCODE -ne 0) { Write-Host 'Este worktree se ha separado de main: no avanzo (arreglalo a mano).'; return $false }
    if (Invoke-Git status --porcelain) { Write-Host 'Hay cambios sin commitear: no avanzo.'; return $false }
    $changed = Invoke-Git diff --name-only $head $main
    Write-Host ("main avanzo: {0} -> {1} ({2} archivos)" -f $head.Substring(0, 7), $main.Substring(0, 7), @($changed).Count)
    if ($DryRun) { return $false }
    Invoke-Git merge --ff-only origin/main | Out-Null
    if ($changed -match '^package-lock\.json$|/package\.json$') { npm ci --ignore-scripts --no-audit --no-fund | Out-Null }
    if ($changed -match '^apps/api/|^packages/|^package-lock\.json$') {
        Write-Host 'Cambia la API o las dependencias: reinicio los servicios de este directorio.'
        Stop-LanFromThisWorktree
        Start-Sleep -Seconds 3
        & (Join-Path $PSScriptRoot 'dev-lan.ps1') -SkipEngine
    }
    return $true
}

do {
    try { Update-Once | Out-Null } catch { Write-Host "Aviso: $($_.Exception.Message)" }
    if (-not $Once) { Start-Sleep -Seconds $Interval }
} while (-not $Once)

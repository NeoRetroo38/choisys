# Deja el entorno visible desde Safari siempre que el PC este encendido, con el menor esfuerzo.
#   .\scripts\lan-always.ps1 -Install      crea la tarea "choisys-lan" que arranca todo al iniciar sesion
#   .\scripts\lan-always.ps1 -Uninstall    la quita
#   .\scripts\lan-always.ps1 -Install -Tailscale   igual, pero servido por Tailscale (demos fuera de casa)
#   .\scripts\lan-always.ps1               arranca ahora lo que falte (lo que usa la tarea)
# Solo toca la tarea programada del usuario actual. No toca firewall, router ni ajustes de energia.
param([switch]$Install, [switch]$Uninstall, [switch]$Tailscale)
$ErrorActionPreference = 'Stop'
$taskName = 'choisys-lan'
$script = $MyInvocation.MyCommand.Path

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    [Environment]::SetEnvironmentVariable('CHOISYS_TAILSCALE', $null, 'User')
    Write-Host "Tarea $taskName quitada."
    return
}
if ($Install) {
    # dev-lan.ps1 y lan-watch.ps1 leen esta variable, así el modo se mantiene tras reinicios y actualizaciones.
    [Environment]::SetEnvironmentVariable('CHOISYS_TAILSCALE', $(if ($Tailscale) { '1' } else { $null }), 'User')
    if ($Tailscale) { Write-Host 'Modo Tailscale activado (CHOISYS_TAILSCALE=1).' }
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Arranca motor, API y web de choisys en la red local' -Force | Out-Null
    Write-Host "Tarea $taskName creada: arranca al iniciar sesion."
    return
}

function Test-Port([int]$port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Start-Watcher {
    $running = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*lan-watch.ps1*' -and $_.Name -eq 'powershell.exe' }
    if (-not $running) { Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSScriptRoot\lan-watch.ps1`"" }
}
if ((Test-Port 8081) -and (Test-Port 3000) -and (Test-Port 8765)) { Write-Host 'Ya esta todo en marcha.'; Start-Watcher; return }
if ((Test-Port 8081) -or (Test-Port 3000) -or (Test-Port 8765)) { Write-Host 'Hay servicios a medias: no arranco nada para no pisarlos. Cierralos y vuelve a ejecutar.'; return }
if ($Tailscale) { $env:CHOISYS_TAILSCALE = '1' }
$root = Split-Path -Parent $PSScriptRoot
# La API no arranca sin el cliente de la base de datos generado (npm ci --ignore-scripts no lo genera).
if (-not (Test-Path (Join-Path $root 'node_modules\.prisma\client\index.js'))) { Push-Location $root; npm run db:generate --workspace apps/api | Out-Null; Pop-Location }
& (Join-Path $PSScriptRoot 'dev-lan.ps1')
Start-Watcher

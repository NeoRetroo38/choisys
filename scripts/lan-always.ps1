# Deja el entorno visible desde Safari siempre que el PC este encendido, con el menor esfuerzo.
#   .\scripts\lan-always.ps1 -Install      crea la tarea "choisys-lan" que arranca todo al iniciar sesion
#   .\scripts\lan-always.ps1 -Uninstall    la quita
#   .\scripts\lan-always.ps1               arranca ahora lo que falte (lo que usa la tarea)
# Solo toca la tarea programada del usuario actual. No toca firewall, router ni ajustes de energia.
param([switch]$Install, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$taskName = 'choisys-lan'
$script = $MyInvocation.MyCommand.Path

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea $taskName quitada."
    return
}
if ($Install) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Arranca motor, API y web de choisys en la red local' -Force | Out-Null
    Write-Host "Tarea $taskName creada: arranca al iniciar sesion."
    return
}

function Test-Port([int]$port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
if ((Test-Port 8081) -and (Test-Port 3000) -and (Test-Port 8765)) { Write-Host 'Ya esta todo en marcha.'; return }
if (Test-Port 8081 -or Test-Port 3000 -or Test-Port 8765) { Write-Host 'Hay servicios a medias: no arranco nada para no pisarlos. Cierralos y vuelve a ejecutar.'; return }
& (Join-Path $PSScriptRoot 'dev-lan.ps1')

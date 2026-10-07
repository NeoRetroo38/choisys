# Arranca el entorno de desarrollo para verlo desde Safari en el iPhone, en la misma red privada:
#   servicio C++ (solo loopback) + API (solo en la IPv4 privada del PC) + Expo web en el puerto 8081.
#   .\scripts\dev-lan.ps1              arranca todo y muestra la URL para Safari
#   .\scripts\dev-lan.ps1 -DryRun      solo muestra lo que haría, sin arrancar nada
#   .\scripts\dev-lan.ps1 -Address 192.168.1.50 -SkipEngine
# No lee ni imprime el token local (lo lee apps\api\run.ps1 desde su archivo). No toca firewall ni router.
param(
    [string]$Address,
    [int]$ApiPort = 3000,
    [int]$WebPort = 8081,
    [string]$EnginePath = 'C:\Users\Admin\Documents\Scenarys\backend\neo-cube\run.ps1',
    [switch]$SkipEngine,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Test-PrivateIPv4([string]$ip) {
    $o = $ip.Split('.') | ForEach-Object { [int]$_ }
    return $o[0] -eq 10 -or ($o[0] -eq 172 -and $o[1] -ge 16 -and $o[1] -le 31) -or ($o[0] -eq 192 -and $o[1] -eq 168)
}

if (-not $Address) {
    # Interfaz activa con puerta de enlace y una IPv4 privada.
    $candidates = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { Test-PrivateIPv4 $_ }
    $Address = $candidates | Select-Object -First 1
    if (-not $Address) { throw 'No encuentro una IPv4 privada con puerta de enlace. Usa -Address <ip>.' }
}
if (-not (Test-PrivateIPv4 $Address)) { throw "La dirección $Address no es privada; no se usa." }

$webOrigin = "http://${Address}:$WebPort"
$apiUrl = "http://${Address}:$ApiPort"
Write-Host "IPv4 del PC:  $Address"
Write-Host "API:          $apiUrl  (solo esa interfaz)"
Write-Host "Safari:       $webOrigin"
if ($DryRun) { Write-Host 'DryRun: no se arranca nada.'; return }

if (-not $SkipEngine) {
    if (-not (Test-Path -LiteralPath $EnginePath)) { throw "No existe el servicio C++ en $EnginePath (usa -SkipEngine si ya está en marcha)." }
    Start-Process powershell -ArgumentList '-NoExit', '-File', "`"$EnginePath`"" -WindowStyle Normal
}

$env:API_HOST = $Address
$env:PORT = "$ApiPort"
$env:API_ALLOWED_ORIGINS = $webOrigin
Start-Process powershell -WorkingDirectory $root -WindowStyle Normal -ArgumentList '-NoExit', '-File', "`"$root\apps\api\run.ps1`"", '-Mode', 'dev'

$env:EXPO_PUBLIC_API_URL = $apiUrl
Start-Process powershell -WorkingDirectory $root -WindowStyle Normal -ArgumentList '-NoExit', '-Command', "npm run mobile -- --web --lan --port $WebPort"

Write-Host "Listo. En el iPhone (misma red Wi-Fi), abre en Safari: $webOrigin"
Write-Host 'Para parar: cierra las tres ventanas. El tráfico es HTTP sin cifrar: usa solo una red de confianza.'

# Arranca el entorno de desarrollo para verlo desde Safari en el iPhone, en la misma red privada:
#   servicio C++ (solo loopback) + API (solo en la IPv4 privada del PC) + Expo web en el puerto 8081.
#   .\scripts\dev-lan.ps1              arranca todo y muestra la URL para Safari
#   .\scripts\dev-lan.ps1 -DryRun      solo muestra lo que haría, sin arrancar nada
#   .\scripts\dev-lan.ps1 -Address 192.168.1.50 -SkipEngine
#   .\scripts\dev-lan.ps1 -Tailscale   usa la IP de Tailscale del PC: se ve desde cualquier sitio, solo en tus dispositivos
#                                     (también se activa con la variable de usuario CHOISYS_TAILSCALE=1, que pone lan-always.ps1)
# No lee ni imprime el token local (lo lee apps\api\run.ps1 desde su archivo). No toca firewall ni router.
param(
    [string]$Address,
    [int]$ApiPort = 3000,
    [int]$WebPort = 8081,
    [string]$EnginePath = 'C:\Users\Admin\Documents\Scenarys\backend\neo-cube\run.ps1',
    [switch]$SkipEngine,
    [switch]$Tailscale,
    [switch]$DryRun
)
if ($env:CHOISYS_TAILSCALE -eq '1') { $Tailscale = $true }
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Test-PrivateIPv4([string]$ip) {
    if ($ip -eq '127.0.0.1') { return $true }
    $o = $ip.Split('.') | ForEach-Object { [int]$_ }
    return $o[0] -eq 10 -or ($o[0] -eq 172 -and $o[1] -ge 16 -and $o[1] -le 31) -or ($o[0] -eq 192 -and $o[1] -eq 168) -or
        ($o[0] -eq 100 -and $o[1] -ge 64 -and $o[1] -le 127)
}

function Get-TailscaleExe {
    $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $default = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
    if (Test-Path -LiteralPath $default) { return $default }
    throw 'No encuentro tailscale.exe. Instala Tailscale e inicia sesión.'
}

if ($Tailscale -and -not $Address) {
    $ts = Get-TailscaleExe
    $Address = (& $ts ip -4 2>$null | Select-Object -First 1)
    if (-not $Address) { throw 'Tailscale no tiene IP: abre Tailscale en el PC e inicia sesión.' }
    $Address = $Address.Trim()
}

if (-not $Address) {
    # Interfaz activa con puerta de enlace y una IPv4 privada.
    $candidates = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { Test-PrivateIPv4 $_ }
    $Address = $candidates | Select-Object -First 1
    if (-not $Address) { throw 'No encuentro una IPv4 privada con puerta de enlace. Usa -Address <ip>.' }
}
if (-not (Test-PrivateIPv4 $Address)) { throw "La dirección $Address no es privada; no se usa." }

# Shared validation keeps public HTTPS URLs independent of the private local bind.
# Discovery still runs with an explicit -Address, and includes the MagicDNS short name.
$configArgs = @((Join-Path $PSScriptRoot 'runtime-config.mjs'), '--host', $Address, '--api-port', "$ApiPort", '--web-port', "$WebPort")
if ($Tailscale) { $configArgs += '--tailscale' }
$configJson = & node @configArgs
if ($LASTEXITCODE -ne 0) { throw 'Invalid runtime configuration; check exact HTTP(S) origins and ports.' }
$config = $configJson | ConvertFrom-Json
$webOrigin = $config.webOrigin
$apiUrl = $config.apiUrl
$origins = @($config.allowedOrigins)
Write-Host "IPv4 del PC:  $Address$(if ($Tailscale) { '  (Tailscale)' })"
Write-Host "API local:    http://${Address}:$ApiPort  (solo esa interfaz)"
Write-Host "API cliente:  $apiUrl"
Write-Host "Safari:       $webOrigin"
if (-not $env:CHOISYS_WEB_ORIGIN) { foreach ($n in $config.dnsNames) { Write-Host "              http://${n}:$WebPort" } }
Write-Host 'Cuentas:      npm run check:neon confirma la base del entorno o archivo externo.'
if ($DryRun) { Write-Host 'DryRun: no se arranca nada.'; return }

if (-not $SkipEngine) {
    if (-not (Test-Path -LiteralPath $EnginePath)) { throw "No existe el servicio C++ en $EnginePath (usa -SkipEngine si ya está en marcha)." }
    Start-Process powershell -ArgumentList '-NoExit', '-File', "`"$EnginePath`"" -WindowStyle Normal
}

$env:API_HOST = $Address
$env:PORT = "$ApiPort"
$env:API_ALLOWED_ORIGINS = ($origins -join ',')
# Sin PostgreSQL, la demo usa un archivo privado fuera del repositorio para conservar cuentas y sesiones tras reinicios.
if (-not $env:DATABASE_URL) { $env:CHOISYS_DEV_AUTH_FILE = Join-Path $env:LOCALAPPDATA 'choisys\auth-v1.json' }
Start-Process powershell -WorkingDirectory $root -WindowStyle Normal -ArgumentList '-NoExit', '-File', "`"$root\apps\api\run.ps1`"", '-Mode', 'dev'

$env:EXPO_PUBLIC_API_URL = $apiUrl
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $Address
Start-Process powershell -WorkingDirectory $root -WindowStyle Normal -ArgumentList '-NoExit', '-Command', "npm --workspace apps/mobile run start -- --web --lan --port $WebPort"

if ($Tailscale) { Write-Host "Listo. En el iPhone o el Mac (con Tailscale activo, desde cualquier sitio), abre en Safari: $webOrigin" }
else { Write-Host "Listo. En el iPhone (misma red Wi-Fi), abre en Safari: $webOrigin" }
Write-Host 'Para parar: cierra las tres ventanas. Los orígenes HTTPS necesitan un proxy privado ya configurado.'

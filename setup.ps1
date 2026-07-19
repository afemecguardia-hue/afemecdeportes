param(
    [string]$OracleIC = "C:\oracle\instantclient\instantclient_23_0"
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AFEMEC Deportes - Setup Automático" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Node.js
try {
    $nodeVer = node --version
    Write-Host "[OK] Node.js $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Node.js no instalado. Descargalo de https://nodejs.org" -ForegroundColor Red
    exit 1
}

# 2. Verificar Oracle Instant Client
$icPath = if ($env:ORACLE_IC) { $env:ORACLE_IC } else { "C:\oracle\instantclient\instantclient_23_0" }
if (Test-Path "$icPath\oci.dll") {
    Write-Host "[OK] Oracle Instant Client en $icPath" -ForegroundColor Green
} else {
    Write-Host "[!] Oracle Instant Client no encontrado en $icPath" -ForegroundColor Yellow
    Write-Host "    Descargalo de: https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html"
    $resp = Read-Host "¿Ya lo tenés instalado? Ingresá la ruta (o Enter para usar $icPath)"
    if ($resp) { $icPath = $resp } else { $icPath = $icPath }
}

# 3. Verificar wallet
$walletDir = Join-Path $icPath "network\admin"
if (Test-Path "$walletDir\ewallet.p12") {
    Write-Host "[OK] Wallet encontrada en $walletDir" -ForegroundColor Green
} else {
    Write-Host "[!] No se encontró wallet en $walletDir" -ForegroundColor Yellow
    Write-Host "    Descargá el wallet desde Oracle Cloud > Autonomous Database > DB Connection > Download Wallet"
    Write-Host "    Extraé los archivos en: $walletDir"
}

# 4. Crear .env si no existe
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[!] Se creó .env desde .env.example" -ForegroundColor Yellow
    Write-Host "    Editá .env con tu password de Oracle DB" -ForegroundColor Yellow
}

# 5. npm install
Write-Host "`nEjecutando npm install..." -ForegroundColor Cyan
npm install

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Setup completado!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Para iniciar: npm run dev" -ForegroundColor Cyan
Write-Host "  API: http://localhost:3046" -ForegroundColor Cyan
Write-Host "  Web: http://localhost:3045" -ForegroundColor Cyan

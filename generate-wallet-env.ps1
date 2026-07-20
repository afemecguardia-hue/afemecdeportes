Write-Host "=== Generar variables de entorno para el wallet ===" -ForegroundColor Cyan
Write-Host ""

$walletDir = "C:\Users\user\Desktop\afemecdeportes666\Wallet_afemecdeportes"

if (!(Test-Path $walletDir)) {
    Write-Host "No se encontró la carpeta Wallet_afemecdeportes" -ForegroundColor Red
    exit 1
}

$files = @{
    "ORACLE_WALLET_TNS" = "tnsnames.ora"
    "ORACLE_WALLET_PEM" = "ewallet.pem"
    "ORACLE_WALLET_SSO" = "cwallet.sso"
}

Write-Host "Copiá estas variables a tu servicio en la nube:" -ForegroundColor Yellow
Write-Host ""

foreach ($key in $files.Keys) {
    $filePath = Join-Path $walletDir $files[$key]
    if (Test-Path $filePath) {
        $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($filePath))
        Write-Host "$key=$base64" -ForegroundColor Green
        Write-Host ""
    }
}

Write-Host "ORACLE_USER=admin" -ForegroundColor Green
Write-Host ""
Write-Host "ORACLE_PASSWORD=@Yelindo2000" -ForegroundColor Green
Write-Host ""
Write-Host "ORACLE_CONNECT=afemecdeportes_high" -ForegroundColor Green

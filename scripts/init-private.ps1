$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $ProjectDir ".env.private"
$GeneratedPassword = ""

function New-HexSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToHexString($buffer).ToLowerInvariant()
}

if (-not (Test-Path $EnvFile)) {
  $buffer = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  $encryptionKey = [Convert]::ToBase64String($buffer)
  $GeneratedPassword = "Kf$((New-HexSecret 9))9"
  $sessionSecret = New-HexSecret
  @(
    "CONFIG_ENCRYPTION_KEY=$encryptionKey"
    "LOCAL_AUTH_EMAIL=admin@local.test"
    "LOCAL_AUTH_NAME=本地管理员"
    "LOCAL_ADMIN_PASSWORD=$GeneratedPassword"
    "LOCAL_AUTH_SESSION_SECRET=$sessionSecret"
    "PARSER_API_KEY=$(New-HexSecret)"
    "LOCAL_OCR_MODE=paddleocr"
    "DEEPSEEK_API_KEY="
    "QDRANT_API_KEY=$(New-HexSecret)"
    "PAYMENT_CALLBACK_SECRET=$(New-HexSecret)"
    "OPERATIONS_SWEEP_SECRET=$(New-HexSecret)"
    "MAIL_RELAY_TOKEN=$(New-HexSecret)"
    "SMTP_ENABLED=true"
    "SMTP_HOST=smtp.qq.com"
    "SMTP_PORT=465"
    "SMTP_USERNAME="
    "SMTP_PASSWORD="
    "SMTP_FROM_EMAIL="
    "SMTP_FROM_NAME=KnowFlow"
    "SMTP_USE_SSL=true"
    "SMTP_USE_STARTTLS=false"
    "EMAIL_CODE_EXPIRY_MINUTES=10"
    "EMAIL_CODE_RESEND_SECONDS=60"
    "EMAIL_CODE_MAX_ATTEMPTS=5"
    "EMAIL_CODE_LENGTH=6"
  ) | Set-Content -Path $EnvFile -Encoding utf8
  Write-Host "已生成 $EnvFile，请随备份保存。"
}

$ExistingEnv = Get-Content $EnvFile
if (-not ($ExistingEnv -match '^LOCAL_ADMIN_PASSWORD=')) {
  $GeneratedPassword = "Kf$((New-HexSecret 9))9"
  "LOCAL_ADMIN_PASSWORD=$GeneratedPassword" | Add-Content -Path $EnvFile -Encoding utf8
  Write-Host "已为旧配置补充本地超级管理员密码。"
}
if (-not ($ExistingEnv -match '^LOCAL_AUTH_SESSION_SECRET=')) {
  "LOCAL_AUTH_SESSION_SECRET=$(New-HexSecret)" | Add-Content -Path $EnvFile -Encoding utf8
}
if (-not ($ExistingEnv -match '^MAIL_RELAY_TOKEN=')) {
  "MAIL_RELAY_TOKEN=$(New-HexSecret)" | Add-Content -Path $EnvFile -Encoding utf8
}
if (-not ($ExistingEnv -match '^LOCAL_OCR_MODE=')) {
  "LOCAL_OCR_MODE=paddleocr" | Add-Content -Path $EnvFile -Encoding utf8
  Write-Host "已为旧配置启用本地 PaddleOCR。"
}

docker compose --env-file $EnvFile -f (Join-Path $ProjectDir "docker-compose.private.yml") up -d --build
Write-Host "KnowFlow 已启动：http://localhost:3000"
Write-Host "本地 OCR：PaddleOCR（企业文档默认走本机免费识别）"
if ($GeneratedPassword) {
  Write-Host "超级管理员：admin@local.test"
  Write-Host "初始密码：$GeneratedPassword"
  Write-Host "密码已保存到 $EnvFile"
}

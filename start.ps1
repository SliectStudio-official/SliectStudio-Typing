$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$configPath = Join-Path $root 'launcher.config.ps1'
$launcherMode = $null
$launcherJwtSecret = $null

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureString)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Write-ConfigFile {
  param([string]$Content)
  $utf8BOM = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($configPath, $Content, $utf8BOM)
}

if (Test-Path $configPath) {
  . $configPath
}

if (-not $launcherMode) {
  Write-Host '========================================'
  Write-Host '   LAN Typing Practice - First Start Wizard'
  Write-Host '========================================'
  do {
    $choice = Read-Host 'Choose mode [1] Quick Start (Dev)  [2] Production Deploy'
    if ([string]::IsNullOrWhiteSpace($choice)) {
      $choice = '1'
    }
  } until ($choice -eq '1' -or $choice -eq '2')
  $launcherMode = if ($choice -eq '2') { 'production' } else { 'development' }
  if ($launcherMode -eq 'production') {
    $launcherJwtSecret = New-RandomSecret
  }
  Write-ConfigFile "`$launcherMode = '$launcherMode'"
}

if ($launcherMode -eq 'production' -and -not $launcherJwtSecret) {
  $launcherJwtSecret = New-RandomSecret
  Write-ConfigFile "`$launcherMode = '$launcherMode'`r`n`$launcherJwtSecret = '$launcherJwtSecret'"
}

$env:NODE_ENV = if ($launcherMode -eq 'production') { 'production' } else { 'development' }
if ($launcherJwtSecret) {
  $env:JWT_SECRET = $launcherJwtSecret
} elseif (Test-Path Env:JWT_SECRET) {
  Remove-Item Env:JWT_SECRET
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host '[Step 1] Installing dependencies...'
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw 'npm install failed'
  }
  Write-Host '[OK] Dependencies installed.'
} else {
  Write-Host '[Step 1] Dependencies already installed.'
}

$basePort = 3000
$port = $basePort
$maxPort = 3010
while ($port -le $maxPort) {
  $tcpConn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $tcpConn) { break }
  $port++
}
if ($port -gt $maxPort) {
  throw "No available port between $basePort and $maxPort"
}
$env:PORT = $port

Write-Host "[Step 2] Starting server on port $port..."
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'node server.js' -WorkingDirectory $root

$bootstrapStatus = $null
for ($i = 0; $i -lt 60; $i++) {
  try {
    $bootstrapStatus = Invoke-RestMethod -Uri "http://localhost:$port/api/bootstrap/status" -TimeoutSec 2
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $bootstrapStatus) {
  throw 'Server start timeout'
}

$launchUrl = "http://localhost:$port"
if ($bootstrapStatus.needsBootstrap) {
  $launchUrl = "http://localhost:$port/setup.html"
  Write-Host '[Step 3] First use - Please open browser to complete setup'
}

Start-Process $launchUrl
Write-Host '========================================'
Write-Host "Server ready: http://localhost:$port"
Write-Host '========================================'

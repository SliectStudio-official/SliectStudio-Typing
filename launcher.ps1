[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null 2>&1

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ''
Write-Host '========================================'
Write-Host '  LAN Typing Practice - Launcher'
Write-Host '========================================'
Write-Host ''

# ============================================================
# Utility Functions
# ============================================================

function Refresh-SessionPath {
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

function Get-NodeMajorVersion {
    try {
        $v = & node -v 2>$null
        if ($v -match 'v(\d+)') { return [int]$Matches[1] }
    } catch {}
    return 0
}

function Test-NodeReady {
    return (Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Write-ConfigFile {
    param([string]$Content)
    $utf8BOM = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($configPath, $Content, $utf8BOM)
}

# ============================================================
# Phase 1: Node.js Environment Check & Auto-Fix
# ============================================================

function Uninstall-CurrentNode {
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $hasWinget) { return }
    Write-Host '[UNINSTALL] Removing current Node.js via winget...'
    $list = winget list --name 'Node.js' --source winget 2>$null
    if ($list -match 'OpenJS.NodeJS') {
        winget uninstall OpenJS.NodeJS.LTS --silent --accept-source-agreements 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        Refresh-SessionPath
        Write-Host '[OK] Uninstalled.'
    }
}

function Download-WithRetry {
    param([string[]]$Urls, [string]$OutFile)

    foreach ($url in $Urls) {
        $label = if ($url -match 'nodejs\.org') { 'Official' }
                 elseif ($url -match 'npmmirror') { 'npmmirror' }
                 elseif ($url -match 'huaweicloud') { 'Huawei' }
                 elseif ($url -match 'tuna') { 'TUNA' }
                 else { $url }
        Write-Host "[DOWNLOAD] Trying $label ..."
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $ProgressPreference = 'SilentlyContinue'
                Invoke-WebRequest -Uri $url -OutFile $OutFile -UseBasicParsing -TimeoutSec 120
                if (Test-Path $OutFile) {
                    $size = (Get-Item $OutFile).Length
                    if ($size -gt 1MB) {
                        Write-Host "[OK] Downloaded ($([math]::Round($size/1MB, 1)) MB) from $label"
                        return $true
                    }
                }
                Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Host "[WARN] Attempt $attempt failed: $($_.Exception.Message)"
            }
            if ($attempt -lt 3) { Start-Sleep -Seconds 3 }
        }
    }
    Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
    return $false
}

function Ensure-NodeV22 {
    if (Test-NodeReady) {
        $major = Get-NodeMajorVersion
        Write-Host "[FOUND] Node.js v$major : $((Get-Command node).Source)"
        if ($major -lt 23) { return $true }
        Write-Host "[WARN] Node.js v$major is NOT compatible (better-sqlite3 needs v22)"
    }

    $searchDirs = @(
        "${env:ProgramFiles}\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "${env:LOCALAPPDATA}\Programs\nodejs",
        "${env:APPDATA}\npm",
        "$env:USERPROFILE\AppData\Roaming\npm",
        "$env:USERPROFILE\AppData\Local\Programs\nodejs",
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs",
        "C:\nodejs"
    )

    $nodePath = $null
    foreach ($dir in $searchDirs) {
        if (Test-Path (Join-Path $dir 'node.exe')) { $nodePath = $dir; break }
    }
    if (-not $nodePath) {
        try {
            $regPath = 'HKLM:\SOFTWARE\Node.js'
            if (Test-Path $regPath) {
                $regItem = Get-ItemProperty -Path $regPath -ErrorAction Stop
                if ($regItem.InstallPath) { $nodePath = $regItem.InstallPath.TrimEnd('\') }
            }
        } catch {}
    }
    if (-not $nodePath) {
        Write-Host '[SEARCH] Scanning disk for node.exe...'
        $found = Get-ChildItem -Path C:\ -Filter node.exe -Recurse -Depth 4 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { $nodePath = $found.DirectoryName }
    }

    if ($nodePath) {
        Write-Host "[FOUND] Node.js at: $nodePath"
        $env:Path = "$nodePath;$env:Path"
        $npmCandidate = Join-Path $nodePath 'npm.cmd'
        if (-not (Test-Path $npmCandidate)) {
            $npmCandidate = Join-Path $nodePath 'node_modules\npm\bin\npm-cli.js'
        }
        if (Test-Path $npmCandidate) { $env:Path = "$(Split-Path $npmCandidate -Parent);$env:Path" }

        if (Test-NodeReady) {
            $major = Get-NodeMajorVersion
            if ($major -lt 23) { return $true }
            Write-Host "[WARN] Node.js v$major is NOT compatible, needs v22 LTS"
        }
    }

    Write-Host '[FIX] Auto-downgrading to Node.js v22 LTS...'

    Uninstall-CurrentNode

    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Host '[INSTALL] winget install OpenJS.NodeJS.LTS --version 22.14.0 ...'
        winget install OpenJS.NodeJS.LTS --version 22.14.0 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
        Refresh-SessionPath
        if (Test-NodeReady) {
            $major = Get-NodeMajorVersion
            if ($major -lt 23) {
                Write-Host "[OK] Node.js v$major installed via winget"
                return $true
            }
        }
        Write-Host '[WARN] winget did not produce v22. Trying MSI download...'
    }

    $nodeInstaller = Join-Path $env:TEMP 'node-v22.14.0-x64.msi'
    $urls = @(
        'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi',
        'https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-x64.msi',
        'https://registry.npmmirror.com/-/binary/node/v22.14.0/node-v22.14.0-x64.msi',
        'https://mirrors.huaweicloud.com/nodejs/v22.14.0/node-v22.14.0-x64.msi',
        'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v22.14.0/node-v22.14.0-x64.msi'
    )

    if (Download-WithRetry -Urls $urls -OutFile $nodeInstaller) {
        Write-Host '[INSTALL] Running MSI installer (silent)...'
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
        Refresh-SessionPath
        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
        if (Test-NodeReady) {
            $major = Get-NodeMajorVersion
            if ($major -lt 23) {
                Write-Host "[OK] Node.js v$major installed"
                return $true
            }
        }
    }

    $localMsi = Join-Path $root 'node-v22.14.0-x64.msi'
    if (Test-Path $localMsi) {
        Write-Host '[INSTALL] Found local MSI in project folder. Installing...'
        Start-Process msiexec.exe -ArgumentList "/i `"$localMsi`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
        Refresh-SessionPath
        if (Test-NodeReady) {
            $major = Get-NodeMajorVersion
            if ($major -lt 23) {
                Write-Host "[OK] Node.js v$major installed from local MSI"
                return $true
            }
        }
    }

    Write-Host ''
    Write-Host '========================================'
    Write-Host '  Auto-install failed - Manual Steps'
    Write-Host '========================================'
    Write-Host ''
    Write-Host 'IMPORTANT: Install Node.js v22 LTS (NOT v23/v24)'
    Write-Host ''
    Write-Host 'Option A - Download MSI and place in project folder:'
    Write-Host '  1. Download: https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
    Write-Host '  2. Or mirror: https://cdn.npmmirror.com/binaries/node/v22.14.0/'
    Write-Host '  3. Save as: <project>\node-v22.14.0-x64.msi'
    Write-Host '  4. Re-run start.bat (will auto-detect local MSI)'
    Write-Host ''
    Write-Host 'Option B - Uninstall v24 first, then install v22:'
    Write-Host '  1. Control Panel > Uninstall Node.js'
    Write-Host '  2. Download v22 LTS from https://nodejs.org'
    Write-Host '  3. Install with "Add to PATH" checked'
    Write-Host '  4. Re-run start.bat'
    Write-Host '========================================'
    Read-Host 'Press Enter to exit'
    exit 1
}

# ============================================================
# Phase 1: Run
# ============================================================

Write-Host '[Phase 1] Checking Node.js environment...'
if (-not (Ensure-NodeV22)) {
    Write-Host '[ERROR] Node.js v22 is required. Cannot continue.'
    Read-Host 'Press Enter to exit'
    exit 1
}
$nodeVersion = & node -v 2>$null
Write-Host "[OK] Node.js $nodeVersion ready."
Write-Host ''

# ============================================================
# Phase 2: First Start Wizard (mode config)
# ============================================================

$configPath = Join-Path $root 'launcher.config.ps1'
$launcherMode = $null
$launcherJwtSecret = $null

if (Test-Path $configPath) {
    . $configPath
}

if (-not $launcherMode) {
    Write-Host '========================================'
    Write-Host '   LAN Typing Practice - First Start'
    Write-Host '========================================'
    do {
        $choice = Read-Host 'Choose mode [1] Quick Start (Dev)  [2] Production Deploy'
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
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

# ============================================================
# Phase 3: npm install
# ============================================================

Write-Host ''
Write-Host '[Phase 3] Checking dependencies...'

$needInstall = $false
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    $needInstall = $true
} elseif (-not (Test-Path (Join-Path $root 'node_modules\better-sqlite3\build'))) {
    Write-Host '[WARN] node_modules exists but better-sqlite3 is broken. Reinstalling...'
    Remove-Item -Path (Join-Path $root 'node_modules') -Recurse -Force -ErrorAction SilentlyContinue
    $needInstall = $true
}

if ($needInstall) {
    Write-Host '[INSTALL] Running npm install...'
    npm install --prefer-offline 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '========================================'
        Write-Host '  npm install FAILED'
        Write-Host '========================================'
        Write-Host 'Common causes:'
        Write-Host '  1. Node.js v23/v24 - better-sqlite3 has no prebuilt binary'
        Write-Host '  2. Network issue - try: npm config set registry https://registry.npmmirror.com'
        Write-Host '========================================'
        Read-Host 'Press Enter to exit'
        exit 1
    }
    Write-Host '[OK] Dependencies installed.'
} else {
    Write-Host '[OK] Dependencies ready.'
}

# ============================================================
# Phase 4: Start Server
# ============================================================

Write-Host ''
Write-Host '[Phase 4] Starting server...'

$basePort = 3000
$port = $basePort
$maxPort = 3010
while ($port -le $maxPort) {
    $tcpConn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $tcpConn) { break }
    $port++
}
if ($port -gt $maxPort) {
    Write-Host '[ERROR] No available port between 3000 and 3010'
    Read-Host 'Press Enter to exit'
    exit 1
}
$env:PORT = $port

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
    Write-Host '[ERROR] Server start timeout'
    Read-Host 'Press Enter to exit'
    exit 1
}

$launchUrl = "http://localhost:$port"
if ($bootstrapStatus.needsBootstrap) {
    $launchUrl = "http://localhost:$port/setup.html"
    Write-Host '[INFO] First use - opening setup page'
}

Start-Process $launchUrl
Write-Host ''
Write-Host '========================================'
Write-Host "  Server ready: http://localhost:$port"
Write-Host '========================================'
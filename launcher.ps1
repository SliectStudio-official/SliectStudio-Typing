[Console]::OutputEncoding = [System.Text.Encoding]UTF8
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

function Get-NodeVersion {
    try {
        $v = & node -v 2>$null
        if ($v -match 'v(\d+)\.(\d+)\.(\d+)') {
            return @{
                Major = [int]$Matches[1]
                Minor = [int]$Matches[2]
                Patch = [int]$Matches[3]
                Full  = $v
            }
        }
    } catch {}
    return $null
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

function Ensure-NodeV22 {
    # ---- 0. 先检查本地 MSI 安装包 ----
    $localMsi = Join-Path $root 'node-v22.14.0-x64.msi'
    $hasLocalMsi = Test-Path $localMsi

    # ---- 1. 检查 PATH 中是否有可用的 Node.js ----
    if (Test-NodeReady) {
        $v = Get-NodeVersion
        $exePath = (Get-Command node).Source
        Write-Host "[FOUND] Node.js $($v.Full) : $exePath"
        Write-Host "[OK] Node.js is working. Continuing with current version."
        return $true
    }

    # ---- 2. 尝试从常见路径找到 Node.js ----
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

    if ($nodePath) {
        Write-Host "[FOUND] Node.js at: $nodePath"
        $env:Path = "$nodePath;$env:Path"
        $npmCandidate = Join-Path $nodePath 'npm.cmd'
        if (-not (Test-Path $npmCandidate)) {
            $npmCandidate = Join-Path $nodePath 'node_modules\npm\bin\npm-cli.js'
        }
        if (Test-Path $npmCandidate) { $env:Path = "$(Split-Path $npmCandidate -Parent);$env:Path" }
        Refresh-SessionPath

        if (Test-NodeReady) {
            $v = Get-NodeVersion
            Write-Host "[OK] Node.js $($v.Full) found at $nodePath. Continuing."
            return $true
        }
    }

    # ---- 3. 尝试查询注册表 ----
    try {
        $regPath = 'HKLM:\SOFTWARE\Node.js'
        if (Test-Path $regPath) {
            $regItem = Get-ItemProperty -Path $regPath -ErrorAction Stop
            if ($regItem.InstallPath) {
                $nodePath = $regItem.InstallPath.TrimEnd('\')
                Write-Host "[FOUND] Node.js via registry: $nodePath"
                $env:Path = "$nodePath;$env:Path"
                Refresh-SessionPath
                if (Test-NodeReady) {
                    $v = Get-NodeVersion
                    Write-Host "[OK] Node.js $($v.Full) found via registry. Continuing."
                    return $true
                }
            }
        }
    } catch {}

    # ---- 4. 全盘搜索 node.exe ----
    Write-Host '[SEARCH] Scanning disk for node.exe...'
    try {
        $found = Get-ChildItem -Path C:\ -Filter node.exe -Recurse -Depth 4 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) {
            $nodePath = $found.DirectoryName
            Write-Host "[FOUND] Node.js at: $nodePath"
            $env:Path = "$nodePath;$env:Path"
            Refresh-SessionPath
            if (Test-NodeReady) {
                $v = Get-NodeVersion
                Write-Host "[OK] Node.js $($v.Full) found on disk. Continuing."
                return $true
            }
        }
    } catch {}

    # ---- 5. 真正找不到任何 Node.js 时才尝试安装 ----
    Write-Host ''
    Write-Host '[FIX] No Node.js found. Installing...'
    Write-Host ''

    # 有本地 MSI 优先使用
    if ($hasLocalMsi) {
        Write-Host '[INSTALL] Found local MSI package. Installing from local...'
        Start-Process msiexec.exe -ArgumentList "/i `"$localMsi`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
        Refresh-SessionPath
        Start-Sleep -Seconds 3
        if (Test-NodeReady) {
            $v = Get-NodeVersion
            if ($v) {
                Write-Host "[OK] Node.js $($v.Full) installed from local MSI"
                return $true
            }
        }
    }

    # 尝试 winget 安装
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Host '[INSTALL] Trying winget...'
        winget install OpenJS.NodeJS.LTS --version 22.14.0 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
        Start-Sleep -Seconds 5
        Refresh-SessionPath
        if (Test-NodeReady) {
            $v = Get-NodeVersion
            if ($v) {
                Write-Host "[OK] Node.js $($v.Full) installed via winget"
                return $true
            }
        }
    }

    # 下载 MSI 安装
    $nodeInstaller = Join-Path $env:TEMP 'node-v22.14.0-x64.msi'
    $urls = @(
        'https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-x64.msi',
        'https://registry.npmmirror.com/-/binary/node/v22.14.0/node-v22.14.0-x64.msi',
        'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi',
        'https://mirrors.huaweicloud.com/nodejs/v22.14.0/node-v22.14.0-x64.msi',
        'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v22.14.0/node-v22.14.0-x64.msi'
    )

    foreach ($url in $urls) {
        $label = if ($url -match 'nodejs\.org') { 'Official' }
                 elseif ($url -match 'npmmirror') { 'npmmirror' }
                 elseif ($url -match 'huaweicloud') { 'Huawei' }
                 elseif ($url -match 'tuna') { 'TUNA' }
                 else { $url }
        Write-Host "[DOWNLOAD] Trying $label ..."
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $ProgressPreference = 'SilentlyContinue'
                Invoke-WebRequest -Uri $url -OutFile $nodeInstaller -UseBasicParsing -TimeoutSec 120
                if (Test-Path $nodeInstaller) {
                    $size = (Get-Item $nodeInstaller).Length
                    if ($size -gt 1MB) {
                        Write-Host "[OK] Downloaded ($([math]::Round($size/1MB, 1)) MB) from $label"
                        break
                    }
                }
                Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Host "[WARN] Attempt $attempt: $($_.Exception.Message)"
            }
            if ($attempt -lt 3) { Start-Sleep -Seconds 3 }
        }

        if (Test-Path $nodeInstaller) {
            try {
                Write-Host '[INSTALL] Running MSI installer (silent)...'
                Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
                Refresh-SessionPath
                Start-Sleep -Seconds 3

                if (Test-NodeReady) {
                    $v = Get-NodeVersion
                    if ($v) {
                        Write-Host "[OK] Node.js $($v.Full) installed from $label"
                        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
                        return $true
                    }
                }
            } finally {
                Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # ---- 6. 全部失败，手动指引 ----
    Write-Host ''
    Write-Host '========================================'
    Write-Host '  Auto-install failed - Manual Steps'
    Write-Host '========================================'
    Write-Host ''
    Write-Host 'IMPORTANT: Install Node.js v22 LTS'
    Write-Host ''
    Write-Host 'Option A - Local MSI (Recommended, no internet needed):'
    Write-Host '  1. Download: https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
    Write-Host '  2. Save as: <project>\node-v22.14.0-x64.msi'
    Write-Host '  3. Re-run start.bat (will auto-detect local MSI)'
    Write-Host ''
    Write-Host 'Option B - Manual install:'
    Write-Host '  1. Download v22 LTS from https://nodejs.org'
    Write-Host '  2. Install with "Add to PATH" checked'
    Write-Host '  3. Re-run start.bat'
    Write-Host '========================================'
    Read-Host 'Press Enter to exit'
    exit 1
}

# ============================================================
# Phase 1: Run
# ============================================================

Write-Host '[Phase 1] Checking Node.js environment...'
if (-not (Ensure-NodeV22)) {
    Write-Host '[ERROR] Node.js is required. Cannot continue.'
    Read-Host 'Press Enter to exit'
    exit 1
}
$v = Get-NodeVersion
Write-Host "[OK] Node.js $($v.Full) ready."
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
        Write-Host '  1. Network issue - try: npm config set registry https://registry.npmmirror.com'
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

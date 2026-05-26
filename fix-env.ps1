$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '========================================'
Write-Host '  Node.js / npm Environment Fix'
Write-Host '========================================'

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

function Start-App {
    Write-Host ''
    Write-Host '[LAUNCH] Starting application...'
    Write-Host ''
    & (Join-Path $root 'start.ps1')
    exit $LASTEXITCODE
}

function AutoInstall-NodeV22 {
    Write-Host ''
    Write-Host '[AUTO] Installing Node.js v22 LTS (compatible with better-sqlite3)...'

    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Host '[INSTALL] winget install OpenJS.NodeJS.LTS --version 22.14.0 ...'
        winget install OpenJS.NodeJS.LTS --version 22.14.0 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
        Refresh-SessionPath
        if (Test-NodeReady) {
            $major = Get-NodeMajorVersion
            if ($major -lt 23) {
                Write-Host "[OK] Node.js v$major installed via winget"
                Start-App
            }
        }
    }

    Write-Host '[INSTALL] Downloading Node.js v22.14.0 MSI...'
    $nodeInstaller = Join-Path $env:TEMP 'node-v22.14.0-x64.msi'
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $nodeInstaller -UseBasicParsing
    } catch {
        Write-Host "[WARN] Official download failed: $_"
        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue

        Write-Host '[INSTALL] Retrying via npmmirror (China mirror)...'
        try {
            Invoke-WebRequest -Uri 'https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-x64.msi' -OutFile $nodeInstaller -UseBasicParsing
        } catch {
            Write-Host "[FAIL] Mirror download also failed: $_"
            Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
            return $false
        }
    }

    Write-Host '[INSTALL] Running installer (silent)...'
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

    Write-Host "[WARN] Install completed but version check failed."
    return $false
}

function Show-ManualSteps {
    Write-Host ''
    Write-Host '========================================'
    Write-Host '  Auto-install failed - Manual Steps'
    Write-Host '========================================'
    Write-Host ''
    Write-Host 'IMPORTANT: Install Node.js v22 LTS (NOT v23/v24)'
    Write-Host 'v23+ causes better-sqlite3 native build failure'
    Write-Host ''
    Write-Host '1. Open: https://nodejs.org/en/download/prebuilt-installer'
    Write-Host '2. Choose: v22.14.0 LTS (64-bit .msi)'
    Write-Host '3. Or mirror: https://npmmirror.com/mirrors/node/v22.14.0/'
    Write-Host '4. Run installer - check "Add to PATH"'
    Write-Host '5. Re-run fix-env.bat'
    Write-Host '========================================'
    Write-Host ''
    Read-Host 'Press Enter to exit'
    exit 1
}

# ============================================================
# Main Logic
# ============================================================

# 1. 当前 PATH 已有 node/npm → 校验版本
if (Test-NodeReady) {
    $major = Get-NodeMajorVersion
    Write-Host "[FOUND] Node.js v$major in PATH: $((Get-Command node).Source)"
    if ($major -ge 23) {
        Write-Host "[WARN] Node.js v$major 不兼容 (better-sqlite3 无预编译包)"
        Write-Host "[FIX] 需要 Node.js v22 LTS, 正在自动降级..."
        if (AutoInstall-NodeV22) { Start-App }
        Show-ManualSteps
    }
    Start-App
}

# 2-4. 搜索硬盘上的 Node.js
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
        Write-Host "[INFO] Node.js v$major detected"
        if ($major -ge 23) {
            Write-Host "[WARN] Node.js v$major 不兼容, 需要 v22 LTS"
            Write-Host "[FIX] 正在自动降级..."
            if (AutoInstall-NodeV22) { Start-App }
            Show-ManualSteps
        }
        Start-App
    }
}

# 5. 没有 Node.js → 全自动安装
if (AutoInstall-NodeV22) { Start-App }
Show-ManualSteps
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null 2>&1

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
                 elseif ($url -match 'registry\.nppa') { 'nppa mirror' }
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

function AutoInstall-NodeV22 {
    Write-Host ''
    Write-Host '[AUTO] Installing Node.js v22 LTS ...'

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
        Write-Host '[WARN] winget install did not produce v22. Trying MSI download...'
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
        Write-Host '[WARN] Install completed but version still not v22.'
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
    Write-Host 'Option A - Download MSI and place in project folder:'
    Write-Host '  1. Download: https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
    Write-Host '  2. Or mirror: https://cdn.npmmirror.com/binaries/node/v22.14.0/'
    Write-Host '  3. Save as: <project>\node-v22.14.0-x64.msi'
    Write-Host '  4. Re-run fix-env.bat (will auto-detect local MSI)'
    Write-Host ''
    Write-Host 'Option B - Uninstall v24 first, then install v22:'
    Write-Host '  1. Control Panel > Uninstall Node.js'
    Write-Host '  2. Download v22 LTS from https://nodejs.org'
    Write-Host '  3. Install with "Add to PATH" checked'
    Write-Host '  4. Re-run fix-env.bat'
    Write-Host '========================================'
    Write-Host ''
    Read-Host 'Press Enter to exit'
    exit 1
}

# ============================================================
# Main Logic
# ============================================================

if (Test-NodeReady) {
    $major = Get-NodeMajorVersion
    Write-Host "[FOUND] Node.js v$major in PATH: $((Get-Command node).Source)"
    if ($major -ge 23) {
        Write-Host "[WARN] Node.js v$major is NOT compatible (better-sqlite3 needs v22)"
        Write-Host "[FIX] Auto-downgrading to v22 LTS..."
        if (AutoInstall-NodeV22) { Start-App }
        Show-ManualSteps
    }
    Start-App
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
        Write-Host "[INFO] Node.js v$major detected"
        if ($major -ge 23) {
            Write-Host "[WARN] Node.js v$major is NOT compatible, needs v22 LTS"
            Write-Host "[FIX] Auto-downgrading..."
            if (AutoInstall-NodeV22) { Start-App }
            Show-ManualSteps
        }
        Start-App
    }
}

if (AutoInstall-NodeV22) { Start-App }
Show-ManualSteps
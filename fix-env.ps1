$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '========================================'
Write-Host '  Node.js / npm Environment Fix'
Write-Host '========================================'

$nodePath = $null
$npmPath  = $null

# 1. 先试当前 PATH
$foundNode = Get-Command node  -ErrorAction SilentlyContinue
$foundNpm  = Get-Command npm   -ErrorAction SilentlyContinue
if ($foundNode -and $foundNpm) {
    Write-Host '[OK] Node.js & npm already in PATH'
    Write-Host "     node : $($foundNode.Source)"
    Write-Host "     npm  : $($foundNpm.Source)"
    & (Join-Path $root 'start.ps1')
    exit $LASTEXITCODE
}

# 2. 扫描常见安装目录
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

foreach ($dir in $searchDirs) {
    if (Test-Path (Join-Path $dir 'node.exe')) {
        $nodePath = $dir
        Write-Host "[FOUND] Node.js at: $dir"
        break
    }
}

if (-not $nodePath) {
    # 3. 查注册表
    try {
        $regPath = 'HKLM:\SOFTWARE\Node.js'
        if (Test-Path $regPath) {
            $regItem = Get-ItemProperty -Path $regPath -ErrorAction Stop
            if ($regItem.InstallPath) {
                $nodePath = $regItem.InstallPath.TrimEnd('\')
                Write-Host "[FOUND] Node.js via registry: $nodePath"
            }
        }
    } catch {}
}

if (-not $nodePath) {
    # 4. 搜整个磁盘
    Write-Host '[SEARCH] Scanning disk for node.exe (may take a moment)...'
    $found = Get-ChildItem -Path C:\ -Filter node.exe -Recurse -Depth 4 -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) {
        $nodePath = $found.DirectoryName
        Write-Host "[FOUND] node.exe at: $nodePath"
    }
}

if ($nodePath) {
    Write-Host ''
    Write-Host '[FIX] Temporarily adding Node.js to PATH for this session...'
    $env:Path = "$nodePath;$env:Path"

    $npmCandidate = (Join-Path $nodePath 'npm.cmd')
    if (-not (Test-Path $npmCandidate)) {
        $npmCandidate = (Join-Path $nodePath 'node_modules\npm\bin\npm-cli.js')
    }
    if (Test-Path $npmCandidate) {
        $env:Path = "$(Split-Path $npmCandidate -Parent);$env:Path"
    }

    Write-Host '[OK] Node.js added to PATH. Starting application...'
    Write-Host ''
    & (Join-Path $root 'start.ps1')
    exit $LASTEXITCODE
}

# 5. 未找到 Node.js — 全自动安装
Write-Host ''
Write-Host '[AUTO] Node.js not found — attempting automatic installation...'

function Refresh-SessionPath {
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

function Test-NodeReady {
    $n = Get-Command node  -ErrorAction SilentlyContinue
    $p = Get-Command npm   -ErrorAction SilentlyContinue
    return ($n -and $p)
}

# 5a. 尝试 winget
$hasWinget = Get-Command winget -ErrorAction SilentlyContinue
if ($hasWinget) {
    Write-Host '[INSTALL] winget install OpenJS.NodeJS.LTS ...'
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Refresh-SessionPath
    if (Test-NodeReady) {
        Write-Host '[OK] Node.js installed via winget. Starting...'
        Write-Host ''
        & (Join-Path $root 'start.ps1')
        exit $LASTEXITCODE
    }
    Write-Host '[WARN] winget install completed but node/npm not in PATH yet.'
}

# 5b. 尝试直接下载 Node.js MSI 安装器
Write-Host '[INSTALL] Downloading Node.js LTS installer...'
$nodeInstaller = Join-Path $env:TEMP 'node-lts-installer.msi'
try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $nodeInstaller -UseBasicParsing
    Write-Host '[INSTALL] Running Node.js MSI installer (silent)...'
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
    Refresh-SessionPath
    Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
    if (Test-NodeReady) {
        Write-Host '[OK] Node.js installed via MSI. Starting...'
        Write-Host ''
        & (Join-Path $root 'start.ps1')
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "[WARN] Download failed: $_"
    Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
    # 5c. 换国内镜像再试
    Write-Host '[INSTALL] Retrying via npmmirror (China mirror)...'
    try {
        Invoke-WebRequest -Uri 'https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-x64.msi' -OutFile $nodeInstaller -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
        Refresh-SessionPath
        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
        if (Test-NodeReady) {
            Write-Host '[OK] Node.js installed via mirror. Starting...'
            Write-Host ''
            & (Join-Path $root 'start.ps1')
            exit $LASTEXITCODE
        }
    } catch {
        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
    }
}

# 5d. 全部失败 — 兜底提示
Write-Host ''
Write-Host '========================================'
Write-Host '  Auto-install failed — Manual Steps'
Write-Host '========================================'
Write-Host '1. Open: https://nodejs.org'
Write-Host '2. Download LTS version'
Write-Host '3. Run installer — check "Add to PATH"'
Write-Host '4. Re-run fix-env.bat'
Write-Host '========================================'
Write-Host ''
Read-Host 'Press Enter to exit'
exit 1
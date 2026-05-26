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

# 5. 未找到 Node.js — 尝试自动安装
Write-Host ''
Write-Host '[WARN] Node.js not found on this machine.'
Write-Host ''

$autoInstall = Read-Host 'Attempt auto-install via winget? [Y/n]'
if ($autoInstall -eq '' -or $autoInstall -eq 'y' -or $autoInstall -eq 'Y') {
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Host '[INSTALL] Running: winget install OpenJS.NodeJS.LTS --silent'
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host '[OK] Node.js installed. Please re-run this script.'
            Read-Host 'Press Enter to exit'
            exit 0
        }
    }
    Write-Host '[FAIL] winget not available. Please install Node.js manually:'
}

Write-Host ''
Write-Host '========================================'
Write-Host '  Manual Installation Steps'
Write-Host '========================================'
Write-Host '1. Open: https://nodejs.org'
Write-Host '2. Download LTS version (recommended)'
Write-Host '3. Run the installer — check "Add to PATH"'
Write-Host '4. Restart this script'
Write-Host '========================================'
Write-Host ''
Read-Host 'Press Enter to exit'
exit 1
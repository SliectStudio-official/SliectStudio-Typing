<#
set-version.ps1 — 产物版本的唯一写入口（唯一真值文件 VERSION）
规则见 AGENTS.md §4.3：
  格式 大版本.小版本.YYMMDD.HHMM
  -Major：数据规范/命令行接口/配置格式不兼容时递增，并把小版本重置为 0
  -Minor：新增功能且向后兼容时递增
  缺省：只刷新日期段与时间段（每次构建都要刷）
  同一分钟内重复构建一律拒绝写入，避免两个不同的包叫同一个版本
  -Check：只复核不写入，对比 VERSION 与 package.json / version.json
#>
[CmdletBinding()]
param(
  [switch]$Major,
  [switch]$Minor,
  [switch]$Check,
  [string]$Root = ''
)
$ErrorActionPreference = 'Stop'
if (-not $Root) {
  if ($PSScriptRoot) { $Root = $PSScriptRoot }
  elseif ($MyInvocation.MyCommand.Definition) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Definition }
  else { $Root = (Get-Location).Path }
}
$versionFile = Join-Path $Root 'VERSION'
$contractFile = Join-Path $Root 'CONTRACT_VERSION'
if (-not (Test-Path $versionFile)) { throw "VERSION file not found: $versionFile" }
$current = (Get-Content $versionFile -Raw).Trim()
if ($current -notmatch '^(\d+)\.(\d+)\.(\d{6})\.(\d{4})$') {
  throw "VERSION 内容不符合格式 大版本.小版本.YYMMDD.HHMM: $current"
}
$verMajor = [int]$Matches[1]
$verMinor = [int]$Matches[2]
$date = $Matches[3]
$time = $Matches[4]
if ($Major -and $Minor) { throw '只能同时指定一个递增开关' }

function Update-PackageVersionMirror {
  param($Root, $verMajor, $verMinor)
  $pkgFile = Join-Path $Root "package.json"
  if (-not (Test-Path $pkgFile)) { return }
  $mirror = "$verMajor.$verMinor.0"
  $raw = Get-Content $pkgFile -Raw
  $newRaw = [regex]::Replace($raw, '"version"\s*:\s*"[^"]*"', '"version": "' + $mirror + '"', 1)
  if ($newRaw -ne $raw) {
    Set-Content -Path $pkgFile -Value $newRaw -Encoding utf8 -NoNewline
    Write-Host "package.json 镜像版本已同步: $mirror"
  }
}

if ($Check) {
  Write-Host "产物版本 VERSION              : $current"
  if (Test-Path $contractFile) { Write-Host "数据规范版本 CONTRACT_VERSION : $((Get-Content $contractFile -Raw).Trim())" }
  $pkgFile = Join-Path $Root 'package.json'
  if (Test-Path $pkgFile) {
    $pkgVer = (Get-Content $pkgFile -Raw | ConvertFrom-Json).version
    $mirror = "$verMajor.$verMinor.0"
    if ($pkgVer -ne $mirror) { Write-Host "[WARN] package.json version=$pkgVer 应为镜像值 $mirror（跑一次不带开关的 set-version.ps1 会自动同步）" } else { Write-Host "package.json 镜像版本一致: $pkgVer" }
  }
  $vjFile = Join-Path $Root 'version.json'
  if (Test-Path $vjFile) {
    $vjVer = (Get-Content $vjFile -Raw | ConvertFrom-Json).version
    if ($vjVer -ne $current) { Write-Host "[WARN] version.json version=$vjVer 与 VERSION 不一致" } else { Write-Host 'version.json 与 VERSION 一致' }
  }
  return
}

if ($Major) { $verMajor = $verMajor + 1; $verMinor = 0 } elseif ($Minor) { $verMinor = $verMinor + 1 }
$now = Get-Date
$newDate = $now.ToString('yyMMdd')
$newTime = $now.ToString('HHmm')
$new = "$verMajor.$verMinor.$newDate.$newTime"
if ($new -eq $current) {
  throw "同一分钟内重复构建，拒绝写入: $current —— 等到下一分钟，或用 -Major / -Minor 显式递增"
}
Set-Content -Path $versionFile -Value $new -Encoding ascii -NoNewline
Update-PackageVersionMirror -Root $Root -verMajor $verMajor -verMinor $verMinor
Write-Host "产物版本: $current -> $new"
if (Test-Path $contractFile) { Write-Host "数据规范版本: $((Get-Content $contractFile -Raw).Trim()) 未变（规范不兼容变更才动）" }
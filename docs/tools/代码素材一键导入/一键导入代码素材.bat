@echo off
chcp 65001 >nul
setlocal enableextensions
title 代码素材一键导入
echo.
echo ================================================
echo   代码素材一键导入（3 个语言分类 + 5 篇素材）
echo ================================================
echo.
set "HERE=%~dp0"
set "ROOT="

rem 1) 优先用本目录（工具被解压到项目根目录时就是这里）
if exist "%HERE%data\typing.db" if exist "%HERE%node_modules\better-sqlite3" set "ROOT=%HERE%"

rem 2) 否则往上找 1~2 层（工具放在项目里的子文件夹时）
if not defined ROOT if exist "%HERE%..\data\typing.db" if exist "%HERE%..\node_modules\better-sqlite3" set "ROOT=%HERE%..\"
if not defined ROOT if exist "%HERE%..\..\data\typing.db" if exist "%HERE%..\..\node_modules\better-sqlite3" set "ROOT=%HERE%..\..\"

rem 3) 还找不到就让人输路径（可直接把文件夹拖进窗口）
:ASKROOT
if not defined ROOT (
  echo [提示] 没自动找到项目目录。
  echo        请把“项目根目录”拖到本窗口后按回车，或直接输入路径。
  echo        项目根目录 = 里面有 server.js 和 data 文件夹的那一层。
  echo.
  set /p "ROOT=项目根目录: "
)
if not defined ROOT goto :BAD
set "ROOT=%ROOT%"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if not exist "%ROOT%\data\typing.db" (
  echo [×] 这个目录里没有 data\typing.db: %ROOT%
  echo.
  set "ROOT="
  goto :ASKROOT
)
if not exist "%ROOT%\node_modules\better-sqlite3" (
  echo [×] 这个目录里没有 node_modules\better-sqlite3: %ROOT%
  echo.
  set "ROOT="
  goto :ASKROOT
)

rem 4) 找 node
set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE for /d %%D in ("C:\node-v*") do if exist "%%D\node.exe" set "NODE=%%D\node.exe"
if not defined NODE (
  echo.
  echo [×] 没找到 Node.js。
  echo     本站是用 Node.js 跑的，正常应该有；如果装在别处，
  echo     请把 node.exe 的完整路径贴进来（例如 C:\Program Files\nodejs\node.exe）。
  echo.
  set /p "NODE=node.exe 路径: "
)
if not defined NODE goto :BAD

echo.
echo [·] 项目目录: %ROOT%
echo [·] Node:     %NODE%
echo.
echo [注意] 建议先在面板里把服务停掉再运行本工具，跑完再启动。
echo.
if /i "%~1"=="/silent" goto :RUN
pause
:RUN
echo.
pushd "%ROOT%"
if exist "%ROOT%\data\typing.db-wal" (
  echo [i] 检测到 WAL 文件，说明数据库正在被使用；若下面报错请先停服务。
)
"%NODE%" "%HERE%seed-code.cjs" "%ROOT%"
set "CODE=%ERRORLEVEL%"
popd
echo.
if "%CODE%"=="0" (
  echo [✓] 导入完成。
) else (
  echo [×] 导入失败，错误码 %CODE%，请看上面的提示。
)
goto :END

:BAD
echo.
echo [×] 参数不完整，已退出。

:END
if /i "%~1"=="/silent" exit /b %CODE%
echo.
pause
exit /b %CODE%

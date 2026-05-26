@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-env.ps1"
pause
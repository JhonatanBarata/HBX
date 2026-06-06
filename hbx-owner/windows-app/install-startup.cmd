@echo off
setlocal
set "ROOT=%~dp0"
powershell -ExecutionPolicy Bypass -File "%ROOT%scripts\install-startup.ps1"
endlocal

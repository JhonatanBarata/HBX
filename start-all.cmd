@echo off
REM Run orchestration start from repository root -> scripts\start-all.ps1
pushd "%~dp0scripts"
powershell -NoProfile -ExecutionPolicy Bypass -File "start-all.ps1"
popd

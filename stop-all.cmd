@echo off
REM Run orchestration stop from repository root -> scripts\stop-all.ps1
pushd "%~dp0scripts"
powershell -NoProfile -ExecutionPolicy Bypass -File "stop-all.ps1"
popd

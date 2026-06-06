@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%HBX Master.exe" (
  start "" /D "%ROOT%" "%ROOT%HBX Master.exe"
  endlocal
  exit /b 0
)
where pythonw.exe >nul 2>nul
if %errorlevel%==0 (
  start "" /D "%ROOT%" pythonw.exe "%ROOT%hbx_master_launcher.py"
) else (
  start "" /D "%ROOT%" python.exe "%ROOT%hbx_master_launcher.py"
)
endlocal


@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%HBX Owner.exe" (
  start "" /D "%ROOT%" "%ROOT%HBX Owner.exe"
  endlocal
  exit /b 0
)
where pythonw.exe >nul 2>nul
if %errorlevel%==0 (
  start "" /D "%ROOT%" pythonw.exe "%ROOT%hbx_owner_launcher.py"
) else (
  start "" /D "%ROOT%" python.exe "%ROOT%hbx_owner_launcher.py"
)
endlocal


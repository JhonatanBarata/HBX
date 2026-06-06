@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist package.json (
  echo Execute a partir da raiz do HBX.
  exit /b 1
)
if "%HBX_OWNER_LOCAL_TOKEN%"=="" (
  echo Configure HBX_OWNER_LOCAL_TOKEN antes de iniciar.
  exit /b 1
)
echo HBX Owner Local Agent: http://127.0.0.1:3107
node .\hbx-owner\local-agent\server.js

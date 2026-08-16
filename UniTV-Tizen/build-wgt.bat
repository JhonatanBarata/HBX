@echo off
REM Empacota o projeto em UniTV.wgt usando o Tizen CLI (Windows).
REM Requer Tizen Studio + TV Extensions no PATH e um perfil de assinatura criado.
REM Uso: build-wgt.bat <NOME_DO_PERFIL>
setlocal
set PROFILE=%1
if "%PROFILE%"=="" set PROFILE=UniTVProfile
cd /d "%~dp0"

echo ==^> tizen build-web
call tizen build-web -- .
if errorlevel 1 goto :err

echo ==^> tizen package (wgt) com perfil: %PROFILE%
call tizen package -t wgt -s %PROFILE% -- .buildResult
if errorlevel 1 goto :err

echo ==^> Gerado em .buildResult:
dir /b .buildResult\*.wgt
echo Instale: sdb connect ^<IP_TV^>:26101  ^&^&  tizen install -n .buildResult\UniTV.wgt -t ^<TV_TARGET^>
goto :eof
:err
echo Falha no empacotamento. Verifique se o Tizen CLI esta no PATH e o perfil existe.
exit /b 1

@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "APP_EXECUTABLE=%SCRIPT_DIR%Paseo.exe"
set "CLI_ENTRY=%SCRIPT_DIR%resources\app.asar\node_modules\@getpaseo\cli\dist\index.js"

if not exist "%APP_EXECUTABLE%" (
  echo Bundled Paseo executable not found at %APP_EXECUTABLE% 1>&2
  exit /b 1
)

if not exist "%CLI_ENTRY%" (
  echo Bundled Paseo CLI entrypoint not found at %CLI_ENTRY% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%APP_EXECUTABLE%" "%CLI_ENTRY%" %*

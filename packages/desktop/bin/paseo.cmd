@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "RESOURCES_DIR=%SCRIPT_DIR%.."
set "APP_EXECUTABLE=%RESOURCES_DIR%\..\Paseo.exe"
set "CLI_ENTRY=%RESOURCES_DIR%\app.asar\node_modules\@getpaseo\cli\dist\index.js"

if not exist "%APP_EXECUTABLE%" (
  echo Bundled Paseo executable not found at %APP_EXECUTABLE% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%APP_EXECUTABLE%" "%CLI_ENTRY%" %*

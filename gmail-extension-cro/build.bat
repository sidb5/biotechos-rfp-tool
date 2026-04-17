@echo off
REM BiotechOS Quote Assistant — production build script (Windows)
REM Usage: build.bat
REM Output: biotechos-quote-assistant-v0.1.0.zip (in the gmail-extension-cro folder)

setlocal
set VERSION=0.1.0
set OUT=biotechos-quote-assistant-v%VERSION%.zip
set STAGING=_build_staging

echo [1/4] Cleaning previous build...
if exist "%STAGING%" rmdir /s /q "%STAGING%"
if exist "%OUT%" del /f /q "%OUT%"

echo [2/4] Copying extension files...
mkdir "%STAGING%"
copy manifest.production.json "%STAGING%\manifest.json" >nul
xcopy /e /i /q icons "%STAGING%\icons" >nul
xcopy /e /i /q src "%STAGING%\src" >nul

echo [3/4] Creating ZIP...
REM PowerShell is available on all Windows 10+ machines
powershell -NoProfile -Command "Compress-Archive -Path '%STAGING%\*' -DestinationPath '%OUT%' -Force"

echo [4/4] Cleaning up staging...
rmdir /s /q "%STAGING%"

echo.
echo Done: %OUT%
echo Upload this file at https://chrome.google.com/webstore/devconsole
endlocal

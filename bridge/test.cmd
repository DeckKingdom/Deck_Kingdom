@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fm-bridge.ps1" -Test
echo.
echo Nothing was sent. Have a look at fm-test.json in this folder.
pause

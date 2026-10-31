@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fm-bridge.ps1" -Discover
echo.
echo Done - send Claude the file fm-discover.txt from this folder.
pause

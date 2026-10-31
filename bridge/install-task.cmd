@echo off
rem Runs the bridge every 5 minutes, hidden, while this user is logged on (FileMaker has to be open anyway).
schtasks /Create /F /TN "Deck Kingdom FileMaker bridge" /SC MINUTE /MO 5 /TR "wscript.exe \"%~dp0run-hidden.vbs\""
echo.
echo Installed. It runs every 5 minutes; progress is written to fm-bridge.log in this folder.
pause

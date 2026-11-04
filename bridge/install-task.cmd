@echo off
rem Runs the bridge every minute, hidden, while this user is logged on (FileMaker has to be open anyway).
rem A run that's still going (e.g. the big first import) is never doubled up - the next one just waits.
schtasks /Create /F /TN "Deck Kingdom FileMaker bridge" /SC MINUTE /MO 1 /TR "wscript.exe \"%~dp0run-hidden.vbs\""
echo.
echo Installed. It runs every minute; progress is written to fm-bridge.log in this folder.
pause

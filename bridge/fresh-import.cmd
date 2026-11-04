@echo off
rem FRESH START: only after the customers and jobs have been cleared in ops (fresh-start-clear.sql).
rem Brings every job from 1 January this year across again, with its customers, plus accounts created
rem or edited since then. Then switches the bridge to every minute.
cd /d "%~dp0"
echo This sends every FileMaker job since 1 January to ops. It can take a few minutes - leave this window open.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fm-bridge.ps1" -FreshStart
if errorlevel 1 (
  echo.
  echo Something went wrong - see the last lines of fm-bridge.log in this folder, or send it to Claude.
  pause
  exit /b 1
)
echo.
schtasks /Create /F /TN "Deck Kingdom FileMaker bridge" /SC MINUTE /MO 1 /TR "wscript.exe \"%~dp0run-hidden.vbs\"" >nul
echo Done. The bridge now runs every minute by itself.
pause

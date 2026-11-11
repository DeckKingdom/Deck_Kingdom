@echo off
rem FINAL IMPORT - the last run before FileMaker is retired.
rem Stops the every-minute bridge, then sends EVERY FileMaker job (all years) with its customer
rem accounts and sites. Records already in ops are updated in place - nothing is deleted, and sample
rem requests, products, shipments, collections, loading and tasks are not touched.
rem Afterwards the bridge stays OFF: ops is the system from then on.
cd /d "%~dp0"
echo FINAL IMPORT from FileMaker into ops.
echo  - Take a Backup in ops first (bottom of the menu).
echo  - Make sure everything is finished in FileMaker - nothing changed there afterwards comes across.
echo.
choice /M "Ready to start"
if errorlevel 2 exit /b 0
schtasks /Delete /F /TN "Deck Kingdom FileMaker bridge" >nul 2>&1
echo.
echo Sending every job - this can take a while (20-40 minutes for many years). Leave this window open.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fm-bridge.ps1" -FinalImport
if errorlevel 1 (
  echo.
  echo Something went wrong - see the last lines of fm-bridge.log in this folder, or send it to Claude.
  echo It is safe to run final-import.cmd again: records are updated, never duplicated.
  pause
  exit /b 1
)
echo.
echo Done. Every FileMaker job is now in ops, and the bridge is switched off.
echo From now on raise and edit everything in ops only.
pause

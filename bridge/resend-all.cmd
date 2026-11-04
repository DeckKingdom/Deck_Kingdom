@echo off
rem Sends every FileMaker job from the start date again (nothing in ops is deleted).
rem Use after a bridge update so older jobs pick up new fields.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fm-bridge.ps1" -Full
pause

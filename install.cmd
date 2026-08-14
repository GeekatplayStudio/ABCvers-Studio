@echo off
rem ABCvers Studio - install dependencies. Geekatplay Studio, Vladimir Chopine.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set EXITCODE=%ERRORLEVEL%
if not "%1"=="--no-pause" if %EXITCODE% NEQ 0 pause
exit /b %EXITCODE%

@echo off
rem ABCvers Studio - build and serve. Geekatplay Studio, Vladimir Chopine.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% NEQ 0 pause
exit /b %EXITCODE%

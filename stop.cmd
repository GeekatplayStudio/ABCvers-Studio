@echo off
rem ABCvers Studio - stop the server. Geekatplay Studio, Vladimir Chopine.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1" %*
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% NEQ 0 pause
exit /b %EXITCODE%

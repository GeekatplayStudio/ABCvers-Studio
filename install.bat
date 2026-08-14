@echo off
rem ABCvers Studio - install dependencies.
rem Geekatplay Studio, Vladimir Chopine.
setlocal

echo.
echo   ABCvers Studio - install
echo   ------------------------
echo.

call npm install
if errorlevel 1 (
  echo.
  echo   Install failed - see the error above.
  pause
  exit /b 1
)

echo.
echo   Done. Next: build.bat, then start.bat
echo.
pause

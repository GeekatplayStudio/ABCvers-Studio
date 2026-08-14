@echo off
rem ABCvers Studio - typecheck and build to .\dist.
rem Geekatplay Studio, Vladimir Chopine.
setlocal

echo.
echo   ABCvers Studio - build
echo   -----------------------
echo.

if not exist "node_modules" (
  echo   Dependencies are not installed yet - running install.bat first.
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run build
if errorlevel 1 (
  echo.
  echo   Build failed - see the error above.
  pause
  exit /b 1
)

echo.
echo   Built to .\dist
echo.
pause

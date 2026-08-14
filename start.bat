@echo off
rem ABCvers Studio - build and serve, opening the browser.
rem Geekatplay Studio, Vladimir Chopine.
rem Runs in the foreground - press Ctrl+C to stop the server.
setlocal

echo.
echo   ABCvers Studio - start
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

echo   Building...
call npm run build
if errorlevel 1 (
  echo.
  echo   Build failed - not starting.
  pause
  exit /b 1
)

set URL=http://localhost:4173/
echo.
echo   Starting at %URL%  (Ctrl+C here to stop)
echo.

rem Open the browser a couple of seconds after the server has had a chance to
rem bind the port, without blocking the server itself.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

call npm run serve

@echo off
rem Starts Adjustment Support on this computer: installs what it needs the first time, then opens http://localhost:3000
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing, this takes a few minutes...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
if not exist .next (
  echo Building the app...
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)
echo.
echo Adjustment Support is starting at http://localhost:3000  (close this window to stop it)
echo.
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:3000"
call npm start
pause

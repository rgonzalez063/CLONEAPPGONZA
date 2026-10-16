@echo off
rem Starts Adjustment Support on this computer. Installs and builds the first time, and again whenever this folder holds a newer version.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then double-click this file again.
  pause
  exit /b 1
)
set WANT=unknown
set HAVE=none
if exist VERSION set /p WANT=<VERSION
if exist .app-version set /p HAVE=<.app-version
set NEEDSETUP=0
if not exist node_modules set NEEDSETUP=1
if not exist .next set NEEDSETUP=1
if not "%WANT%"=="%HAVE%" set NEEDSETUP=1
if "%NEEDSETUP%"=="1" (
  echo Setting up version %WANT%, this takes a few minutes the first time...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
  if exist .next rmdir /s /q .next
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
  echo %WANT%> .app-version
)
echo.
echo Adjustment Support is starting at http://localhost:3000  (close this window to stop it)
echo.
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:3000"
call npm start
pause

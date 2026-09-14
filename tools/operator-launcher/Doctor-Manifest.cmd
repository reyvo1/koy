@echo off
setlocal
cd /d "%~dp0\..\.."
set "MANIFEST="
set /p "MANIFEST=Approved manifest path: "
if not defined MANIFEST (
  echo STATUS: STOPPED
  echo Manifest path is required.
  pause
  exit /b 1
)
npm.cmd run operator:doctor -- --manifest "%MANIFEST%"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo STATUS: STOPPED
pause
exit /b %EXIT_CODE%

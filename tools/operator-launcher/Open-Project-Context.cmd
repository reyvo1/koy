@echo off
setlocal
cd /d "%~dp0\..\.."
npm.cmd run operator:context
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo STATUS: STOPPED
pause
exit /b %EXIT_CODE%

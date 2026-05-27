@echo off
rem Memshare - local installer for Windows.
rem Double-click this file to install and launch.

setlocal

set "REPO_URL=https://github.com/aryasgit/memshare.git"
set "INSTALL_DIR=%USERPROFILE%\Memshare"

cls
echo ------------------------------------------------------
echo   Memshare * local installer (Windows)
echo ------------------------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   X  Node.js is not installed.
  echo.
  echo      Memshare needs Node.js 20 or newer.
  echo      Download the LTS installer from:
  echo          https://nodejs.org
  echo.
  echo      Then double-click this file again.
  echo.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo   X  git is not installed.
  echo.
  echo      Install Git for Windows from:
  echo          https://git-scm.com/download/win
  echo.
  echo      Then double-click this file again.
  echo.
  pause
  exit /b 1
)

if exist "%INSTALL_DIR%\.git" (
  echo   ^>  Updating existing Memshare at %INSTALL_DIR%
  git -C "%INSTALL_DIR%" pull --ff-only
  if errorlevel 1 ( pause & exit /b 1 )
) else (
  echo   ^>  Cloning Memshare to %INSTALL_DIR%
  git clone --depth 1 "%REPO_URL%" "%INSTALL_DIR%"
  if errorlevel 1 ( pause & exit /b 1 )
)

cd /d "%INSTALL_DIR%"

echo   ^>  Installing dependencies (this only happens once)
call npm install --silent --no-audit --no-fund
if errorlevel 1 ( pause & exit /b 1 )

echo.
echo ------------------------------------------------------
echo   Memshare is starting at http://localhost:8787
echo.
echo   A LAN URL will print below - hand it to teammates
echo   on the same Wi-Fi and they're in.
echo.
echo   Close this window to stop.
echo ------------------------------------------------------
echo.

start "" http://localhost:8787/app.html
call npm run local

@echo off
title Buat EXE - Rexel Game
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Download dulu dari https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b
)
if not exist node_modules (
  echo Install pertama kali, butuh internet. Mohon tunggu...
  call npm install
)
call npm run build
echo.
echo Selesai. File exe ada di folder dist.
pause

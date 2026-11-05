@echo off
rem Double-cliquez sur ce fichier (Windows) pour lancer le relais du direct.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js n'est pas installe : telechargez-le sur https://nodejs.org puis relancez. & pause & exit /b 1)
start "" "http://localhost:8686"
node relais-direct.js
pause

@echo off
title MusiKa Discord Bot + Web (musika.luisjourney.xyz)
set PYTHONUTF8=1
cd /d "%~dp0"

echo Iniciando tunel de Cloudflare hacia https://musika.luisjourney.xyz ...
start "Cloudflare Tunnel - MusiKa" /min "%~dp0cloudflared.exe" tunnel run --url http://localhost:8080 musika

echo Iniciando Bot de Discord y servidor Web en puerto 8080...
"%~dp0.venv\Scripts\python.exe" -u "%~dp0bot.py"
pause

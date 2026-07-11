@echo off
rem 地域カードバトル起動: ローカルサーバーを立ててブラウザで開く
cd /d "%~dp0"
start "" "http://localhost:8000"
node serve.js 8000
pause

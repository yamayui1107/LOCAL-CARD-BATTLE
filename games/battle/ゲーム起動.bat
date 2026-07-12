@echo off
rem 地域カードバトル起動: ローカルサーバーを立ててブラウザで開く（ビルド不要のオーバーレイ配信）
cd /d "%~dp0..\.."
start "" "http://localhost:8000"
node scripts\serve.mjs battle 8000
pause

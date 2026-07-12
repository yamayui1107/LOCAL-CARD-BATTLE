@echo off
rem IT用語カードバトル起動: ローカルサーバーを立ててブラウザで開く（ビルド不要のオーバーレイ配信）
cd /d "%~dp0..\.."
start "" "http://localhost:8001"
node scripts\serve.mjs it-battle 8001
pause

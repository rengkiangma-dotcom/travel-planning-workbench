@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动本地旅游工作台，浏览器地址：http://127.0.0.1:18646/
start "" "http://127.0.0.1:18646/"
"E:\node.exe" server.cjs
pause

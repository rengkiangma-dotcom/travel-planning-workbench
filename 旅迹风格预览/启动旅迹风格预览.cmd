@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 本地预览地址：http://127.0.0.1:18647/
echo 在浏览器打开上面的地址。关闭这个窗口即可停止本次服务。
"E:\node.exe" server.cjs
pause

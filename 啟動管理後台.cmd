@echo off
chcp 65001 >nul
title 臺大醫院 疫情訊息週報 - 管理者審核入口

echo ============================================================
echo   正在啟動 疫情訊息週報 管理者審核後台 (http://localhost:8787)...
echo ============================================================
echo.

cd /d "%~dp0"
start "" "http://localhost:8787/admin-portal.html"
python scripts\admin_server.py --port 8787

pause

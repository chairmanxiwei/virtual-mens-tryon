@echo off
chcp 65001 > nul
title 虚拟男装 AI 后端（8000端口，Real模式）
cls

echo ==============================
echo 虚拟男装 AI 后端启动脚本（已优化）
echo 功能：自动清理8000端口 + 启动Real模式
echo ==============================
echo.

:: 检查并清理8000端口
echo 检查8000端口占用情况...
netstat -ano | findstr :8000 > port_check.txt
if %errorlevel% equ 0 (
    echo 发现8000端口被占用，正在清理...
    for /f "tokens=5" %%a in (port_check.txt) do (
        taskkill /PID %%a /F
        echo 已终止占用8000端口的进程 %%a
    )
) else (
    echo 8000端口未被占用，无需清理
)
del port_check.txt

echo.
echo 正在启动后端服务...
echo ==============================

:: 启动后端服务
python -m uvicorn server.src.api.main_v3:app --host 0.0.0.0 --port 8000

echo ==============================
echo 服务启动失败！
echo 可能原因：
echo 1. Python/uvicorn 未安装
echo 2. 8000端口仍被占用（重启电脑）
echo 3. 目录路径错误
echo ==============================
pause > nul
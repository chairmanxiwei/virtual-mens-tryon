@echo off
chcp 65001 >nul
echo 虚拟男装 - 前端服务启动器
echo ================================
echo.

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未检测到 Node.js，请先安装 Node.js
    echo 下载地址：https://nodejs.org/zh-cn/download/
    pause
    exit /b 1
)

echo 检测到 Node.js 已安装

:: 进入前端项目目录
cd "node-server"

echo 进入前端项目目录：%cd%

:: 检查 package.json 是否存在
if not exist "package.json" (
    echo 错误：package.json 文件不存在
    pause
    exit /b 1
)

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo 检测到 node_modules 目录不存在，开始安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo 错误：依赖安装失败
        pause
        exit /b 1
    )
    echo 依赖安装成功
) else (
    echo 检测到 node_modules 目录已存在，跳过依赖安装
)

:: 启动前端服务
echo 启动前端服务...
echo 服务将运行在 http://localhost:3000
echo 按 Ctrl+C 停止服务

echo 正在启动前端服务...
npm start
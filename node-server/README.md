# 商务风格虚拟男装搭配系统 (Node.js版)

## 项目简介
基于 Node.js + Express + EJS 构建的虚拟男装搭配系统，集成 Python 微服务进行 3D 建模。

## 快速开始

### 1. 环境准备
- Node.js (v18+)
- Python 3.10+ (需安装 `numpy`, `opencv-python`)

### 2. 安装依赖
```bash
# 进入项目目录
cd frontend

# 安装 Node.js 依赖
npm install

# 确保 Python 依赖已安装 (在父目录的 venv 中)
# pip install numpy opencv-python
```

### 3. 启动服务
运行：
```bash
npm start
```
访问：http://localhost:3000

## 功能特性
- **用户认证**：登录/注册 (Admin: admin@example.com / admin123)
- **虚拟试穿**：上传全身照仅作为触发信号，3D 预览始终展示固定 GIF
- **AI 搭配**：基于场景推荐穿搭
- **衣橱管理**：数字化衣橱

## 3D 预览规则说明
- 上传图片仅用于触发预览刷新，不会影响 3D 预览内容
- 3D 预览始终渲染固定的 GIF（`/assets/gifs/sample.gif`）
- 用户上传文件不会被用于模型生成或纹理计算

## 稳定性测试
已包含自动化稳定性测试脚本，用于验证高并发/连续上传场景下的系统稳定性。
```bash
node tests/stability_test.js
```
测试内容：连续上传 10 张图片，验证上传触发与 GIF 预览刷新稳定性。

## 常见问题
- **上传后页面无变化？** 请检查控制台日志，确认 GIF 资源是否可访问。
- **GIF 未显示？** 检查 `/assets/gifs/sample.gif` 是否存在且可访问。

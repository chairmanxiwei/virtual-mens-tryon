# 虚拟男装：AI 搭配推荐与虚拟试衣

本仓库为前后端分离结构：

- `frontend/`：静态前端页面（HTML/CSS/JS）
- `node-server/`：Node.js 登录与页面服务（Express + EJS）
- `server/`：Python 后端 API（FastAPI，AI 试衣/搭配/缺失单品文生图）

## 快速开始

### 1) 配置环境变量

根目录 `.env` 用于本地运行（已在 `.gitignore` 中忽略，不要提交到仓库）。

至少需要配置（按需）：

- 数据库：DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME
- DashScope：DASHSCOPE_TRYON_API_KEY、DASHSCOPE_LLM_API_KEY（以及可选 DASHSCOPE_API_KEY）
- OSS（真实试衣/公网 URL 需要）：OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET_NAME / OSS_ENDPOINT

### 2) 启动 Python API（8000）

```bash
cd server/src
python -m uvicorn api.main_v3:app --host localhost --port 8000
```

健康检查：`http://localhost:8000/health`

### 3) 启动 Node 服务（3000）

```bash
cd node-server
npm ci
npm run start
```

打开：`http://localhost:3000`

## 测试

### Node

```bash
cd node-server
npm test
```

### Python

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s src -p "test_*.py"
```

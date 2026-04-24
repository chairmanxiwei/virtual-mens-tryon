# 架构概览

## 数据流

1. 用户在 Node Web 页面提交场景/风格/温度等信息（AI搭配页）。
2. Node Web 调用 Python API：
   - `/api/outfit/recommend` 生成 3 套穿搭与缺失单品卡片。
   - 缺失单品卡片返回 `image_task_id`，前端轮询任务接口拿到真实图片 URL 后更新展示。
3. 用户选择衣服并发起试衣：
   - Node Web 调用 Python API `/api/virtual-tryon`（异步任务），前端轮询任务结果。

## 运行进程

- Node Web（默认 3000）：nodejs-login-app/server.js
- Python API（默认 8000）：pack_project_1773835237667/projects/src/api/main_v3.py（uvicorn 启动）


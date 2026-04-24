# 项目结构

本仓库是一个小型单仓库（monorepo），包含两个可独立运行的子项目：

- Node Web（页面/账号/衣橱管理/AI搭配入口）：nodejs-login-app/
- Python API（搭配推荐/缺失单品文生图/虚拟试衣/天气/上传等）：pack_project_1773835237667/projects/

## 目录说明（顶层）

```
虚拟男装/
├── nodejs-login-app/                  # Node.js Web 应用（主要前端/服务端渲染）
├── pack_project_1773835237667/projects/ # Python FastAPI 服务（推荐/试衣/文生图）
├── scripts/                           # 启动与排查脚本（Windows/Python）
├── docs/                              # 仓库级文档（上手/结构/贡献/部署）
├── .gitignore
├── LICENSE
└── README.md
```

## Node Web：nodejs-login-app/

- server.js：Express 入口
- routes/：路由定义
- controllers/：控制器（请求处理）
- services/：业务服务（DB/调用 Python API/识别等）
- views/：EJS 页面模板
- public/：静态资源（css/js/img）
- tests/：Node 内置测试（node --test）

## Python API：pack_project_1773835237667/projects/

- src/api/main_v3.py：当前实际运行的 API（8000）
- requirements.txt：最小运行依赖
- docs/：后端侧接口/集成文档
- scripts/：启动/打包/环境加载脚本

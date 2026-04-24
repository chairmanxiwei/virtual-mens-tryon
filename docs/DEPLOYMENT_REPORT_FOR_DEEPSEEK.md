# 虚拟男装（cls.troby.cn）部署报告（给 DeepSeek 使用）

## 1. 项目概览

本项目是一个“虚拟男装/虚拟试衣 + AI 穿搭推荐 + 登录/衣橱管理”的全栈网站，当前仓库同时包含：

- Node.js（Express）Web 服务：提供页面渲染（EJS）、登录/会话、衣橱 CRUD、前端静态资源与部分代理接口。
- Python（FastAPI）AI 后端：提供天气查询、衣橱数据对接、虚拟试衣任务、缺失单品图片生成（DashScope/OSS）等 API。
- Nginx：对外提供 HTTPS（443），反向代理到本机端口 3000（Node）与 8000（Python）。
- systemd + gunicorn：用于守护 Python API（127.0.0.1:8000）。
- pm2：用于守护 Node Web（127.0.0.1:3000）。

对外访问域名：

- 生产域名：`https://cls.troby.cn`

内部端口规划（本机监听）：

- Node Web：`127.0.0.1:3000`
- Python API：`127.0.0.1:8000`

代码根目录（生产机固定）：

- `/root/虚拟男装`

## 2. 目录结构与关键文件

仓库关键目录：

- `node-server/`：Node Web（Express + EJS）
- `server/src/api/main_v3.py`：Python FastAPI 主服务（建议生产用它）
- `server/src/api/main.py`：旧/备用 FastAPI（已按生产域名做兼容，但不建议作为主入口）
- `docs/`：文档（本报告也在这里）

生产部署相关交付物（仓库根目录）：

- `.env.example`：环境变量模板（本地/生产变量全量清单）
- `.env.production`：生产配置（带占位符）
- `deploy.sh`：服务器本机一键部署脚本（release 目录 + 软链发布）
- `virtual-man-fashion.service`：systemd（Python API）
- `ecosystem.config.cjs`：pm2（Node Web）
- `ssl.cls.troby.cn.conf`：Nginx 站点配置（TLS/HSTS/安全头/反代）
- `health-check.sh`：健康检查脚本（DB/OSS/高德/DashScope/首页/证书）
- `rollback.sh`：回滚脚本（软链切换 + systemd 重启）
- `hardening-deploy.patch`：关键改造补丁（硬编码清理/配置收敛/部署资产）

## 3. 运行链路（请求如何在系统内流转）

### 3.1 用户访问网站

1) 用户浏览器访问 `https://cls.troby.cn`
2) Nginx（443）反代到 `127.0.0.1:3000`（Node Web）
3) Node Web 渲染页面（EJS），并提供静态资源（CSS/JS/img）

### 3.2 前端调用 AI 后端

前端页面中会通过运行时注入的 `AI_API_BASE`（默认等于 `PUBLIC_BASE_URL`）请求后端 API：

- `https://cls.troby.cn/api/...` 由 Nginx 反代到 `127.0.0.1:8000`
- `https://cls.troby.cn/files/...` 由 Nginx 反代到 `127.0.0.1:8000`

这确保浏览器侧同源（避免跨域/混合内容问题）。

### 3.3 虚拟试衣与 OSS

Python API 内部会：

- 生成本地临时文件并通过 `/files/{key}` 暴露（经 Nginx 反代）
- 如果开启 OSS，结果可能上传至 OSS，并返回 OSS 公网 URL（`OSS_PUBLIC_BASE_URL`）

## 4. 环境变量（生产关键点）

生产环境使用：

- Node：`dotenv-flow` 读取 `.env.production`（放在 `/root/虚拟男装/.env.production`）
- Python：`python-decouple` + `.env.production`（由 systemd 注入 EnvironmentFile）

### 4.1 七大模块变量清单

1) 高德地图
- `AMAP_API_KEY`：Web Service（天气/地理编码等）
- `AMAP_JS_API_KEY`：JS 地图加载 Key（页面 `<script src="...&key=...">`）

2) 阿里云大模型（DashScope）
- `DASHSCOPE_API_KEY` / `DASHSCOPE_LLM_API_KEY` / `DASHSCOPE_TRYON_API_KEY` 等

3) 阿里云 OSS
- `OSS_BUCKET_NAME`
- `OSS_ENDPOINT`
- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`
- `OSS_PUBLIC_BASE_URL`：必须为
  - `https://virtual-tryon-final.oss-cn-shanghai.aliyuncs.com/`

4) MySQL
- `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`

5) 后端服务/跨域/基址
- `PUBLIC_BASE_URL=https://cls.troby.cn`
- `AI_BACKEND_BASE_URL=http://127.0.0.1:8000`
- `CORS_ORIGINS=https://cls.troby.cn`
- `WARDROBE_IMAGE_BASE_URL=https://cls.troby.cn`

6) 虚拟试衣模式与任务控制
- `TRYON_CHAIN_ENABLED`、`TRYON_MAX_WAIT_SECONDS`、`MISSING_IMAGE_TASK_LIMIT` 等

7) 前端/登录系统安全
- `SESSION_SECRET`：必须 ≥ 32 字节随机串（Node 端会强校验）
- `SESSION_COOKIE_DOMAIN=.troby.cn`
- `SESSION_COOKIE_SAMESITE=lax`
- `DEBUG_*`：生产必须为 0
- 上传与 body 限制：`UPLOAD_MAX_BYTES`、`APP_MAX_BODY_SIZE`

## 5. 生产部署（推荐流程）

### 5.1 首次准备（服务器）

1) 创建目录
- `/root/虚拟男装`
- `/root/虚拟男装/releases`
- `/root/虚拟男装/shared/logs`

2) 放置生产配置
- `/root/虚拟男装/.env.production`

3) 安装 Nginx 站点配置
- 将 `ssl.cls.troby.cn.conf` 放入 `/etc/nginx/conf.d/ssl.cls.troby.cn.conf`
- `nginx -t && systemctl reload nginx`

4) 证书
- 证书路径默认：
  - `/etc/letsencrypt/live/cls.troby.cn/fullchain.pem`
  - `/etc/letsencrypt/live/cls.troby.cn/privkey.pem`

### 5.2 一键部署（服务器本机 root 执行）

- 执行：`bash /root/虚拟男装/current/deploy.sh`

该脚本会：

- clone 到 `/root/虚拟男装/releases/<timestamp>`
- 创建 venv 并安装 Python 依赖
- `node-server` 执行 `npm ci`（并尝试 build）
- 初始化数据库（如存在 `database_init.sql`）
- 切换 `/root/虚拟男装/current` 软链到新版本
- 安装/更新 systemd 服务并重启（Python）
- pm2 启动/重载（Node）
- 执行健康检查脚本

### 5.3 Linux 兼容注意

由于仓库是在 Windows 环境编辑，部署前建议：

- `dos2unix deploy.sh health-check.sh rollback.sh`
- `chmod +x deploy.sh health-check.sh rollback.sh`

## 6. systemd / pm2 / Nginx 配置摘要

### 6.1 systemd（Python API）

- 服务名示例：`virtual-man-fashion.service`
- 关键点：
  - `WorkingDirectory=/root/虚拟男装`
  - `EnvironmentFile=/root/虚拟男装/.env.production`
  - `ExecStart=... gunicorn ... --bind 127.0.0.1:8000`
  - `Restart=always`

### 6.2 pm2（Node Web）

- `ecosystem.config.cjs` 固定：
  - `cwd=/root/虚拟男装/current/node-server`
  - `script=server.js`
  - `NODE_ENV=production`

### 6.3 Nginx（HTTPS 反代）

- 443：
  - `/` -> Node 3000
  - `/api/` -> Python 8000
  - `/files/` -> Python 8000
- 安全：
  - HSTS、TLS1.3、OCSP Stapling、安全响应头
- 体积：
  - `client_max_body_size 10m`

## 7. 健康检查与回滚

### 7.1 健康检查（health-check.sh）

检查项：

- MySQL 连通：`SELECT 1`
- OSS 读写：上传/读取/删除临时对象
- 高德 API：weather 接口 HTTP 200
- DashScope Token：models 接口 HTTP 200
- 首页 200：`PUBLIC_BASE_URL/`
- HTTPS 证书剩余天数：≥ 30 天

### 7.2 回滚（rollback.sh）

策略：

- 备份 `/root/虚拟男装` 到 `/root/虚拟男装.bak`
- `current` 软链切到上一个 release 目录
- `systemctl restart virtual-man-fashion.service`

目标：在 30 秒内完成切换（取决于服务重启速度）。

## 8. CI/CD（GitHub Actions）

CI：

- Node：`node-server` 下 `npm ci && npm test`
- Python：`python -m compileall server/src`

CD：

- main 分支自动部署到生产机（通过 SSH）
- 部署后执行 `health-check.sh`
- 如失败则执行 `rollback.sh`

需要在仓库 Secrets 配置：

- `PROD_HOST/PROD_USER/PROD_SSH_KEY/REPO_URL`

## 9. 常见故障与排查路径（给 DeepSeek 的诊断入口）

### 9.1 502/504

- `systemctl status virtual-man-fashion.service -l`
- `tail -n 200 /root/虚拟男装/shared/logs/gunicorn-error.log`
- `curl -v http://127.0.0.1:8000/health`
- `nginx -t && tail -n 200 /var/log/nginx/error.log`

### 9.2 403/SignatureDoesNotMatch（OSS）

- 检查 `.env.production`：
  - `OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_ENDPOINT/OSS_BUCKET_NAME`
- OSS endpoint 必须匹配 bucket 所在区域

### 9.3 高德地图不显示

- 检查：
  - `AMAP_JS_API_KEY` 是否配置
  - Key 是否绑定域名 `cls.troby.cn`
  - CSP 是否允许 amap 域名（Node 端 helmet CSP）

### 9.4 登录/会话失效

- 必查：
  - `SESSION_SECRET` 是否足够强且稳定（重启不变）
  - `SESSION_COOKIE_DOMAIN=.troby.cn`
  - HTTPS 下 `SameSite` 与 `Secure` 配置是否正确

## 10. DeepSeek 后续指导任务清单（建议它按优先级推进）

P0（上线稳定性/安全）：

- 校验 `.env.production` 是否还有 `<REPLACE_...>` 未替换，并阻止启动（建议加启动前检查脚本）
- 增加 `logrotate` 配置，避免日志打爆磁盘
- 配置 `certbot renew` 定时任务 + 续签后 reload nginx
- 增加 MySQL 备份策略（每日 dump 到 OSS/本地）
- 引入 Nginx `limit_req` 与基础 WAF 规则（防刷/爆破）

P1（可维护性）：

- 将 `deploy.sh` 增强为同时支持 `apt` 与 `dnf/yum`（自动识别）
- 将敏感配置改为从 Vault/阿里云 KMS/环境注入（避免落盘）
- 增加应用级 `/ready` 依赖检查（DB/OSS/DashScope 可用性）

P2（性能与体验）：

- 将静态资源走 CDN（或 Nginx gzip/brotli + cache-control）
- 对试衣任务引入队列与并发上限可观测化（已有部分参数，可继续完善）

## 11. 给 DeepSeek 的“指令模板”（可直接复制）

你是我的 DevOps/后端工程师，请基于以下项目做后续指导：

- 项目根目录：`/root/虚拟男装`
- Node：`/root/虚拟男装/current/node-server/server.js`（pm2 守护，127.0.0.1:3000）
- Python：`/root/虚拟男装/current/server/src/api/main_v3.py`（systemd + gunicorn，127.0.0.1:8000）
- Nginx：`/etc/nginx/conf.d/ssl.cls.troby.cn.conf`（443 -> 3000/8000）
- 生产域名：`https://cls.troby.cn`
- 配置文件：`/root/虚拟男装/.env.production`
- 健康检查：`/root/虚拟男装/current/health-check.sh`
- 回滚：`/root/虚拟男装/current/rollback.sh`

请你输出：

1) 上线前必须确认的变量清单（含如何生成强随机值）
2) 证书申请/续签/自动化方案（含命令）
3) 监控与告警建议（Nginx + systemd + 应用日志）
4) 发生 502/413/跨域/登录异常时的排查步骤（逐条命令）
5) 进一步安全加固建议（HSTS/CSP/RateLimit/headers/权限/最小化暴露端口）


# 虚拟男装智能穿搭系统 - 配置指南

## 概述

本项目包含 Node.js 后端服务和 Python AI 后端服务。所有敏感配置通过环境变量管理，不包含在代码仓库中。

---

## 快速开始

### 1. 复制环境变量模板

```bash
# Node.js 后端
cd node-server
cp .env.example .env

# Python AI 后端
cd server
cp .env.example .env
```

### 2. 配置必要参数

请根据以下指南填写 `.env` 文件中的各项配置。

---

## 配置项说明

### 数据库配置

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `DB_HOST` | MySQL 主机地址 | 数据库服务器地址 |
| `DB_PORT` | MySQL 端口 | 默认：3306 |
| `DB_USER` | 数据库用户名 | MySQL 创建的用户 |
| `DB_PASS` | 数据库密码 | MySQL 用户的密码 |
| `DB_NAME` | 数据库名称 | 需预先创建的数据库 |

### 会话配置

| 变量名 | 说明 | 要求 |
|--------|------|------|
| `SESSION_SECRET` | 会话密钥 | **必须至少32字节**，用于加密会话数据 |

生成示例：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### API 密钥配置

#### 阿里云 DashScope（通义千问）

用于 LLM 对话和虚拟试衣功能。

1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com/)
2. 开通 DashScope 服务
3. 在 API-KEY 管理创建新的 Key

```env
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
```

#### 高德地图 API

用于天气查询和地图功能。

1. 访问 [高德开放平台](https://lbs.amap.com/)
2. 创建应用获取 Web 服务 API 密钥

```env
AMAP_JS_API_KEY=您的高德JS API Key
AMAP_API_KEY=您的高德Web API Key
```

#### 阿里云 OSS

用于文件存储（用户上传的图片等）。

1. 访问 [阿里云 OSS 控制台](https://oss.console.aliyun.com/)
2. 创建 Bucket 并获取 Access Key

```env
OSS_ACCESS_KEY_ID=您的AccessKey ID
OSS_ACCESS_KEY_SECRET=您的AccessKey Secret
OSS_BUCKET_NAME=您的Bucket名称
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
```

#### GitHub OAuth（登录功能）

1. 访问 GitHub → Settings → Developer settings → OAuth Apps
2. 创建 New OAuth App
3. 设置回调 URL 为：`${PUBLIC_BASE_URL}/auth/github/callback`

```env
GITHUB_CLIENT_ID=您的Client ID
GITHUB_CLIENT_SECRET=您的Client Secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

### 服务地址配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AI_BACKEND_BASE_URL` | Python AI 服务地址 | http://127.0.0.1:8000 |
| `PUBLIC_BASE_URL` | 公共访问地址 | http://localhost:3000 |

---

## 密码哈希生成

管理员和测试用户的密码需要使用 bcrypt 哈希：

```bash
node -e "console.log(require('bcryptjs').hashSync('your_password', 10))"
```

将生成的哈希值填入：

```env
ADMIN_PASSWORD_HASH=$2a$10$生成的哈希值
USER_PASSWORD_HASH=$2a$10$生成的哈希值
```

---

## 启动项目

### Node.js 后端

```bash
cd node-server
npm install
npm start
```

### Python AI 后端

```bash
cd server
pip install -r requirements.txt
python -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 安全注意事项

1. **绝不提交 .env 文件** - 所有 .env 文件已加入 .gitignore
2. **生产环境** - 请使用强密码和 HTTPS
3. **API 密钥** - 定期轮换，建议使用环境变量而非文件
4. **SESSION_SECRET** - 必须使用足够长度（32字节以上）的随机字符串

---

## 常见问题

### Q: 启动报错 "SESSION_SECRET 未配置或长度不足"

A: 需要设置至少32字节的 SESSION_SECRET 环境变量。

### Q: 数据库连接失败

A: 请检查 DB_HOST, DB_USER, DB_PASS, DB_NAME 配置是否正确，并确保数据库服务已启动。

### Q: AI 功能不可用

A: 请确保 Python AI 后端服务已启动，并正确配置 DASHSCOPE_API_KEY。

---

## 团队协作

新成员加入时：
1. 克隆仓库后，复制 `.env.example` 为 `.env`
2. 向项目管理员索取必要的配置值
3. 不要将 `.env` 文件提交到仓库

---
name: "frontend-design"
description: "适用于前端设计的skill，使用Node.js构建动态前端，支持响应式设计、组件开发和实时预览。"
---

# 前端设计Skill

## 功能介绍

前端设计Skill是一个强大的工具，用于构建现代化、动态的前端应用。它基于Node.js开发，支持响应式设计、组件化开发和实时预览功能，帮助开发者快速创建高质量的前端界面。

## 支持的技术栈

### 核心技术
- **Node.js**：构建动态后端服务
- **Express**：轻量级Web框架
- **EJS**：嵌入式JavaScript模板引擎
- **CSS3**：现代样式设计
- **JavaScript (ES6+)**：前端交互逻辑

### 前端框架（可选）
- **React**：组件化前端开发
- **Vue.js**：渐进式JavaScript框架
- **Bootstrap**：响应式UI组件库

### 工具链
- **Nodemon**：开发时自动重启服务器
- **Webpack**：模块打包工具
- **Babel**：JavaScript编译器
- **ESLint**：代码质量检查

## 主要功能

### 1. 动态前端开发
- 基于Node.js的服务器端渲染
- 实时数据交互和API集成
- 动态内容生成和模板渲染

### 2. 响应式设计
- 适配不同设备屏幕尺寸
- 移动优先的设计理念
- 灵活的布局系统

### 3. 组件化开发
- 可重用的UI组件
- 模块化代码结构
- 组件库管理

### 4. 实时预览
- 开发时的热重载
- 即时看到代码更改效果
- 提高开发效率

### 5. API集成
- 与后端API无缝集成
- 处理异步数据请求
- 实现前后端分离架构

### 6. 性能优化
- 代码压缩和优化
- 资源加载策略
- 缓存机制

## 使用方法

### 基本用法

```bash
# 启动前端开发服务器
node frontend-server.js

# 使用热重载启动
npm run dev

# 构建生产版本
npm run build
```

### 配置选项

前端设计Skill支持以下配置选项：

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `port` | 服务器端口 | 3000 |
| `host` | 服务器主机 | localhost |
| `publicDir` | 静态文件目录 | ./public |
| `viewsDir` | 视图模板目录 | ./views |
| `enableHotReload` | 启用热重载 | true |
| `apiBaseUrl` | API基础URL | /api |

### 示例配置

```javascript
// frontend-config.js
module.exports = {
  port: 3000,
  host: 'localhost',
  publicDir: './public',
  viewsDir: './views',
  enableHotReload: true,
  apiBaseUrl: '/api'
};
```

## 项目结构

```
frontend-project/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   └── images/
├── views/
│   ├── index.ejs
│   ├── about.ejs
│   └── partials/
│       ├── header.ejs
│       └── footer.ejs
├── routes/
│   ├── index.js
│   └── api.js
├── middleware/
│   └── logger.js
├── frontend-server.js
├── frontend-config.js
├── package.json
└── README.md
```

## 示例代码

### 基本服务器设置

```javascript
// frontend-server.js
const express = require('express');
const path = require('path');
const config = require('./frontend-config');

const app = express();

// 设置静态文件目录
app.use(express.static(path.join(__dirname, config.publicDir)));

// 设置视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, config.viewsDir));

// 解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 路由
app.get('/', (req, res) => {
  res.render('index', {
    title: '前端设计Skill',
    message: '欢迎使用前端设计Skill！'
  });
});

// API路由
app.get('/api/data', (req, res) => {
  res.json({
    success: true,
    data: {
      items: [
        { id: 1, name: '项目1' },
        { id: 2, name: '项目2' },
        { id: 3, name: '项目3' }
      ]
    }
  });
});

// 启动服务器
app.listen(config.port, config.host, () => {
  console.log(`前端服务器运行在 http://${config.host}:${config.port}`);
});
```

### 前端模板示例

```ejs
<!-- views/index.ejs -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %></title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <% include partials/header %>
  
  <main>
    <h1><%= message %></h1>
    <div id="api-data">加载中...</div>
  </main>
  
  <% include partials/footer %>
  <script src="/js/main.js"></script>
</body>
</html>
```

### 前端交互示例

```javascript
// public/js/main.js
// 获取API数据
fetch('/api/data')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const dataContainer = document.getElementById('api-data');
      dataContainer.innerHTML = '';
      
      const ul = document.createElement('ul');
      data.data.items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.name;
        ul.appendChild(li);
      });
      
      dataContainer.appendChild(ul);
    }
  })
  .catch(error => {
    console.error('获取数据失败:', error);
  });

// 响应式导航
function toggleNav() {
  const nav = document.querySelector('nav');
  nav.classList.toggle('active');
}

// 绑定事件
document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.menu-button');
  if (menuButton) {
    menuButton.addEventListener('click', toggleNav);
  }
});
```

## 系统要求

- **Node.js**：14.0+
- **npm**：6.0+
- **浏览器**：支持ES6+的现代浏览器

## 安装依赖

```bash
# 安装核心依赖
npm install express ejs nodemon

# 安装可选依赖
npm install react react-dom vue bootstrap

# 安装开发工具
npm install webpack babel-loader eslint --save-dev
```

## 配置文件

### package.json示例

```json
{
  "name": "frontend-design-project",
  "version": "1.0.0",
  "description": "前端设计项目",
  "main": "frontend-server.js",
  "scripts": {
    "start": "node frontend-server.js",
    "dev": "nodemon frontend-server.js",
    "build": "webpack --mode production"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ejs": "^3.1.9",
    "nodemon": "^3.0.2"
  },
  "devDependencies": {
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4",
    "babel-loader": "^9.1.3",
    "eslint": "^8.56.0"
  }
}
```

## 最佳实践

### 代码组织
- 使用模块化结构
- 分离关注点
- 遵循命名约定

### 性能优化
- 使用CDN加载第三方库
- 实现懒加载
- 优化图片资源

### 可访问性
- 遵循WCAG指南
- 使用语义化HTML
- 确保键盘可导航

### 安全性
- 防止XSS攻击
- 验证用户输入
- 使用HTTPS

## 故障排除

### 服务器启动失败

如果服务器启动失败，检查以下几点：
- 端口是否被占用
- 依赖是否正确安装
- 配置文件是否正确

### 前端代码不更新

如果前端代码更改后没有实时更新：
- 确保启用了热重载
- 清除浏览器缓存
- 检查文件路径是否正确

### API请求失败

如果API请求失败：
- 检查API端点是否正确
- 验证服务器是否运行
- 检查网络连接

## 示例项目

### 基础前端应用

```bash
# 创建基础前端项目
node create-frontend-project.js --template basic --name my-frontend-app

# 启动开发服务器
cd my-frontend-app && npm run dev
```

### 响应式网站

```bash
# 创建响应式网站项目
node create-frontend-project.js --template responsive --name my-responsive-site

# 构建生产版本
cd my-responsive-site && npm run build
```

## 总结

前端设计Skill提供了一个完整的前端开发解决方案，基于Node.js构建动态前端应用。它支持现代前端技术栈，提供实时预览和响应式设计能力，帮助开发者快速创建高质量的前端界面。

通过合理的项目结构和配置选项，前端设计Skill可以适应各种前端开发场景，从简单的静态网站到复杂的单页应用。它的模块化设计和扩展性使其成为前端开发的理想工具。
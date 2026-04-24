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

app.get('/about', (req, res) => {
  res.render('about', {
    title: '关于我们',
    description: '前端设计Skill是一个强大的前端开发工具。'
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

app.post('/api/submit', (req, res) => {
  const { name, email, message } = req.body;
  
  // 模拟表单处理
  console.log('收到表单数据:', { name, email, message });
  
  res.json({
    success: true,
    message: '表单提交成功！'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).render('404', {
    title: '页面未找到'
  });
});

// 启动服务器
app.listen(config.port, config.host, () => {
  console.log(`前端服务器运行在 http://${config.host}:${config.port}`);
  console.log(`API文档: http://${config.host}:${config.port}/api`);
});

module.exports = app;
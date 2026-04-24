const http = require('http');
const fs = require('fs');
const path = require('path');

// 服务器配置
const config = {
  port: 3000,
  host: 'localhost',
  publicDir: './public',
  viewsDir: './views'
};

// MIME类型映射
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

// 读取文件并发送响应
function sendFile(res, filePath, contentType = 'text/plain') {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1><p>The file you are looking for does not exist.</p>');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// 渲染简单的HTML页面
function renderPage(res, pageName, data = {}) {
  const filePath = path.join(__dirname, config.viewsDir, `${pageName}.html`);
  
  // 检查HTML文件是否存在
  if (fs.existsSync(filePath)) {
    sendFile(res, filePath, 'text/html');
  } else {
    // 如果HTML文件不存在，使用EJS文件
    const ejsPath = path.join(__dirname, config.viewsDir, `${pageName}.ejs`);
    if (fs.existsSync(ejsPath)) {
      fs.readFile(ejsPath, 'utf8', (err, template) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>500 Internal Server Error</h1>');
          return;
        }
        
        // 简单的模板替换
        let renderedHtml = template;
        for (const [key, value] of Object.entries(data)) {
          const regex = new RegExp(`<%=\s*${key}\s*%>`, 'g');
          renderedHtml = renderedHtml.replace(regex, value);
        }
        
        // 处理包含文件
        renderedHtml = renderedHtml.replace(/<%\s*include\s+([^\s%]+)\s*%>/g, (match, includePath) => {
          const fullIncludePath = path.join(__dirname, config.viewsDir, includePath.replace(/'/g, ''));
          try {
            return fs.readFileSync(fullIncludePath, 'utf8');
          } catch (e) {
            return '';
          }
        });
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderedHtml);
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>');
    }
  }
}

// 创建服务器
const server = http.createServer((req, res) => {
  // 解析URL
  const url = new URL(req.url, `http://${config.host}:${config.port}`);
  let pathname = url.pathname;
  
  // 处理根路径
  if (pathname === '/') {
    renderPage(res, 'index', {
      title: '前端设计Skill',
      message: '欢迎使用前端设计Skill！'
    });
    return;
  }
  
  // 处理API请求
  if (pathname === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: {
        items: [
          { id: 1, name: '项目1' },
          { id: 2, name: '项目2' },
          { id: 3, name: '项目3' }
        ]
      }
    }));
    return;
  }
  
  if (pathname === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('收到表单数据:', data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: '表单提交成功！'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: '无效的请求数据'
        }));
      }
    });
    return;
  }
  
  // 处理静态文件
  if (pathname.startsWith('/public/')) {
    const filePath = path.join(__dirname, pathname);
    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'text/plain';
    sendFile(res, filePath, contentType);
    return;
  }
  
  // 处理其他路径
  if (pathname === '/about') {
    renderPage(res, 'about', {
      title: '关于我们',
      description: '前端设计Skill是一个强大的前端开发工具。'
    });
    return;
  }
  
  // 404处理
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<h1>404 Not Found</h1><p>The page you are looking for does not exist.</p>');
});

// 启动服务器
server.listen(config.port, config.host, () => {
  console.log(`服务器运行在 http://${config.host}:${config.port}`);
  console.log(`首页: http://${config.host}:${config.port}`);
  console.log(`关于页面: http://${config.host}:${config.port}/about`);
  console.log(`API示例: http://${config.host}:${config.port}/api/data`);
});

console.log('正在启动服务器...');
console.log('使用内置http模块，无需外部依赖');
console.log('服务器配置:', config);
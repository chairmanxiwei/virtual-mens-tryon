module.exports = {
  // 服务器配置
  port: 3000,
  host: 'localhost',
  
  // 目录配置
  publicDir: './public',
  viewsDir: './views',
  
  // 功能配置
  enableHotReload: true,
  apiBaseUrl: '/api',
  
  // 安全配置
  enableCORS: true,
  corsOptions: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  
  // 性能配置
  enableCompression: true,
  enableETag: true,
  
  // 日志配置
  enableLogging: true,
  logLevel: 'info'
};
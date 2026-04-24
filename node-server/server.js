const express = require('express');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const NodeCache = require('node-cache');
const mysql = require('mysql2');
const axios = require('axios');
const outfitAdminRouter = require('./routes/outfitAdmin');
const projectRoot = path.resolve(__dirname, '..');
require('dotenv-flow').config({
    path: projectRoot,
    node_env: process.env.NODE_ENV || 'development',
    silent: true
});

const app = express();
const PORT = process.env.PORT || 3000;
const IS_TEST = process.env.NODE_ENV === 'test';
const DEBUG_HTTP = process.env.DEBUG_HTTP === '1';
const DEBUG_SESSION = process.env.DEBUG_SESSION === '1';
const DEBUG_CSP = process.env.DEBUG_CSP === '1';
const APP_MAX_BODY_SIZE = process.env.APP_MAX_BODY_SIZE || '10mb';
const AI_BACKEND_BASE_URL = (process.env.AI_BACKEND_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!IS_TEST && SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET 未配置或长度不足 32 字节，拒绝启动。');
}

let AI_BACKEND_ORIGIN = AI_BACKEND_BASE_URL;
try {
    AI_BACKEND_ORIGIN = new URL(AI_BACKEND_BASE_URL).origin;
} catch (e) {
    // ignore invalid URL and keep raw value
}

// 数据库连接池（从环境变量读取）
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const promisePool = pool.promise();
global.db = promisePool;

// 数据库初始化函数
async function initDatabase() {
    console.log('开始初始化数据库...');
    try {
        // 测试数据库连接
        await global.db.query('SELECT 1');
        console.log('数据库连接成功');

        async function tryQuery(sql) {
            try {
                await global.db.query(sql);
            } catch (e) {}
        }
        
        // 创建 users 表
        await global.db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // 为 users 表创建索引（存在则忽略错误）
        try { await global.db.query(`CREATE INDEX idx_users_username ON users(username)`); } catch(e) {}
        try { await global.db.query(`CREATE UNIQUE INDEX idx_users_email ON users(email)`); } catch(e) {}

        // 创建clothes表
        await global.db.query(`
            CREATE TABLE IF NOT EXISTS clothes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                color VARCHAR(100) NOT NULL,
                type VARCHAR(100) NOT NULL,
                image VARCHAR(500) NOT NULL,
                thumb VARCHAR(500),
                size VARCHAR(50),
                brand VARCHAR(100),
                material VARCHAR(100),
                style VARCHAR(100),
                pattern VARCHAR(100),
                season VARCHAR(100),
                price DECIMAL(10, 2),
                description TEXT,
                user_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('clothes表初始化完成');
        await tryQuery(`ALTER TABLE clothes ADD COLUMN pattern VARCHAR(100) DEFAULT '纯色'`);
        await tryQuery(`ALTER TABLE clothes ADD COLUMN user_id INT`);
        await tryQuery(`CREATE INDEX idx_clothes_user_id ON clothes(user_id)`);
        // clothes 索引（存在则忽略）
        try { await global.db.query(`CREATE INDEX idx_clothes_type ON clothes(type)`); } catch(e) {}
        try { await global.db.query(`CREATE INDEX idx_clothes_color ON clothes(color)`); } catch(e) {}
        await tryQuery(`ALTER TABLE clothes ADD COLUMN primary_color_name VARCHAR(64)`);
        await tryQuery(`ALTER TABLE clothes ADD COLUMN primary_color_pct TINYINT UNSIGNED`);
        await tryQuery(`ALTER TABLE clothes ADD COLUMN secondary_color_name VARCHAR(64)`);
        await tryQuery(`ALTER TABLE clothes ADD COLUMN secondary_color_pct TINYINT UNSIGNED`);
        await tryQuery(`ALTER TABLE clothes ADD COLUMN background_color_name VARCHAR(64)`);
        await tryQuery(`ALTER TABLE clothes ADD COLUMN color_palette_json JSON`);
        try { await global.db.query(`CREATE INDEX idx_clothes_user_created ON clothes(user_id, created_at)`); } catch(e) {}
        try { await global.db.query(`CREATE INDEX idx_clothes_user_type ON clothes(user_id, type)`); } catch(e) {}
        try { await global.db.query(`CREATE INDEX idx_clothes_user_season ON clothes(user_id, season)`); } catch(e) {}
        try { await global.db.query(`CREATE INDEX idx_clothes_primary_color ON clothes(primary_color_name)`); } catch(e) {}

        try {
            await global.db.query(`
                CREATE TABLE IF NOT EXISTS clothes_color_components (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    cloth_id INT NOT NULL,
                    rank TINYINT UNSIGNED NOT NULL,
                    color_name VARCHAR(64) NOT NULL,
                    pct TINYINT UNSIGNED NOT NULL,
                    r TINYINT UNSIGNED,
                    g TINYINT UNSIGNED,
                    b TINYINT UNSIGNED,
                    is_background TINYINT(1) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_cloth_rank (cloth_id, rank),
                    INDEX idx_components_cloth (cloth_id),
                    INDEX idx_components_name (color_name),
                    CONSTRAINT fk_components_cloth FOREIGN KEY (cloth_id) REFERENCES clothes(id) ON DELETE CASCADE
                )
            `);
        } catch (e) {}
        
        
        // 创建outfit_suggestions表
        await global.db.query(`
            CREATE TABLE IF NOT EXISTS outfit_suggestions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                image VARCHAR(500) NOT NULL,
                thumb VARCHAR(500),
                occasion VARCHAR(100),
                season VARCHAR(100),
                style VARCHAR(100),
                difficulty VARCHAR(50),
                rating INT,
                views INT,
                shirt_id INT,
                pants_id INT,
                shoes_id INT,
                jacket_id INT,
                accessories VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('outfit_suggestions表初始化完成');
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN difficulty VARCHAR(50) DEFAULT '简单'`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN rating INT DEFAULT 0`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN views INT DEFAULT 0`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN shirt_id INT`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN pants_id INT`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN shoes_id INT`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN jacket_id INT`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN accessories VARCHAR(255) DEFAULT ''`);
        await tryQuery(`ALTER TABLE outfit_suggestions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await tryQuery(`CREATE INDEX idx_outfit_occasion ON outfit_suggestions(occasion)`);
        await tryQuery(`CREATE INDEX idx_outfit_season ON outfit_suggestions(season)`);
        await tryQuery(`CREATE INDEX idx_outfit_style ON outfit_suggestions(style)`);
        await tryQuery(`CREATE INDEX idx_outfit_rating ON outfit_suggestions(rating)`);
        // outfit_suggestions 索引（存在则忽略）
        try { await global.db.query(`CREATE INDEX idx_outfit_name ON outfit_suggestions(name)`); } catch(e) {}
        
        // 检查outfit_suggestions表是否有数据
        const [outfitRows] = await global.db.query('SELECT COUNT(*) as count FROM outfit_suggestions');
        if (outfitRows[0].count === 0) {
            const demoImage = process.env.DEMO_OUTFIT_IMAGE_URL || '/img/placeholder.svg';
            // 插入一些示例数据
            await global.db.query(`
                INSERT INTO outfit_suggestions (name, description, image, thumb, occasion, season, style) VALUES
                (?, '适合正式商务场合的经典搭配', ?, ?, '商务会议', '四季', '商务正式'),
                (?, '适合日常休闲的时尚搭配', ?, ?, '休闲聚会', '四季', '休闲时尚'),
                (?, '适合运动或户外活动的搭配', ?, ?, '户外运动', '四季', '运动风格'),
                (?, '适合正式晚宴的优雅搭配', ?, ?, '正式晚宴', '四季', '经典优雅')
            `, [
                '商务正装', demoImage, demoImage,
                '休闲时尚', demoImage, demoImage,
                '运动风格', demoImage, demoImage,
                '晚宴着装', demoImage, demoImage
            ]);
            console.log('示例数据插入完成');
        }
        
        console.log('数据库初始化完成');
    } catch (error) {
        console.error('数据库初始化失败:', error.message);
        console.warn('⚠️  数据库初始化失败，服务器将继续运行，但部分功能可能无法使用');
    }
}

// 清理临时文件
const UPLOAD_TEMP_DIRS = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'public', 'uploads', 'photos')
];
UPLOAD_TEMP_DIRS.forEach(dir => {
    if (fs.existsSync(dir)) {
        console.log(`正在清理临时目录: ${dir}`);
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.endsWith('.tmp') || file.startsWith('tmp-')) {
                    fs.unlinkSync(path.join(dir, file));
                }
            });
        } catch (err) {
            console.warn(`清理临时目录失败: ${err.message}`);
        }
    }
});

// 缓存与监控
const cache = new NodeCache({ stdTTL: 600, checkperiod: process.env.NODE_ENV === 'test' ? 0 : 600 });
const metrics = { requests: 0, slow: 0, errors: 0, lastErrors: [], avgResponseMs: 0 };
const sseClients = new Set();
const readiness = { ok: true, details: {} };

// ========== 安全中间件 ==========
// ========== 安全中间件 ==========
console.log('即将应用 helmet 配置...');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
    defaultSrc: ["'self'"],
    styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com",
        "https://trae-api-cn.mchost.guru",
        "https://a.amap.com",
        "https://*.amap.com"
    ],
    scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://unpkg.com",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://trae-api-cn.mchost.guru",
    "https://webapi.amap.com",
    "https://a.amap.com",
    "https://*.amap.com",
    "https://jsapi.amap.com"
],
scriptSrcAttr: [
    "'self'",
    "'unsafe-inline'"  // 允许内联事件处理器
],
    workerSrc: [
        "'self'",
        "blob:",
        "https://webapi.amap.com",
        "https://*.amap.com"
    ],
    imgSrc: [
        "'self'",
        "https://trae-api-cn.mchost.guru",
        "data:",
        "https://via.placeholder.com",
        "https://*.tile.openstreetmap.org",
        "https://tile.openstreetmap.org",
        "https://tf-cdn.trae.com.cn",
        "https://*.openstreetmap.fr",
        "https://openstreetmap.fr",
        "https://*.trae.com.cn",
        "https://unpkg.com",
        "https://*.is.autonavi.com",
        "https://webapi.amap.com",
        "https://*.amap.com",
        "https://dashscope-7c2c.oss-cn-shanghai.aliyuncs.com",
        "https://*.aliyuncs.com",
        "https://*.aliyun.com",
        "https://dashscope.aliyuncs.com"
    ],
    fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.gstatic.com"
    ],
    connectSrc: [
        "'self'",
        "https://unpkg.com",
        "https://*.tile.openstreetmap.org",
        "http://ip-api.com",
        "https://ip-api.com",
        "https://restapi.amap.com",
        "https://webapi.amap.com",
        "https://jsapi.amap.com",
        "https://*.amap.com",   // 关键：允许所有 amap.com 子域名
        AI_BACKEND_ORIGIN
    ],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
    reportUri: '/csp-report'
}
    }
}));
console.log('helmet 配置已应用，CSP 包含高德域名');

// 可选：打印最终 CSP 头用于调试
app.use((req, res, next) => {
    if (DEBUG_CSP) {
        res.on('finish', () => {
            const csp = res.getHeader('Content-Security-Policy');
            if (csp) console.log('最终发送的 CSP:', csp);
        });
    }
    next();
});

app.use(compression());
const corsOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const corsOriginsSet = new Set(corsOrigins);
const allowAllCorsOrigins = corsOriginsSet.size === 0;
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowAllCorsOrigins || corsOriginsSet.has(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
console.log('CORS 配置已启用');

// 请求计时与 OPTIONS 处理
app.use((req, res, next) => {
    const start = Date.now();
    
    res.setHeader('X-Response-Time', 'calculating...');
    res.on('finish', () => {
        const ms = Date.now() - start;
        metrics.requests += 1;
        const n = metrics.requests;
        metrics.avgResponseMs = Math.round(((metrics.avgResponseMs * (n - 1)) + ms) / n);
        if (ms > 2000) {
            metrics.slow += 1;
            const msg = `SLOW ${req.method} ${req.url} ${ms}ms`;
            sseClients.forEach(c => { try { c.write(`data: ${msg}\n\n`); } catch(e) {} });
        }
    });
    if (req.method === 'OPTIONS') {
        console.log('处理 OPTIONS 请求:', req.url);
        return res.status(204).end();
    }
    next();
});

// 解析请求体
app.use(express.urlencoded({ extended: true, limit: APP_MAX_BODY_SIZE }));
app.use(express.json({ limit: APP_MAX_BODY_SIZE }));



// 代理路由 - 天气查询
app.get('/api/proxy/weather', async (req, res) => {
  try {
    const { lat, lon, unit } = req.query;
    const response = await axios.get(`${AI_BACKEND_BASE_URL}/api/weather/query`, {
      params: { lat, lon, unit }
    });
    res.json(response.data);
  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ success: false, message: '代理请求失败' });
  }
});

// 代理路由 - 穿搭推荐
app.post('/api/proxy/outfit/recommend', async (req, res) => {
  try {
    const response = await axios.post(`${AI_BACKEND_BASE_URL}/api/outfit/recommend`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ success: false, message: '代理请求失败' });
  }
});
// 直接代理 outfit/recommend（前端调用路径）
 app.post('/api/outfit/recommend', async (req, res) => {
     try {
             const response = await axios.post(`${AI_BACKEND_BASE_URL}/api/outfit/recommend`, req.body);
                     res.json(response.data);
                         } catch (error) {
                                 console.error('代理请求失败:', error);
                                         res.status(502).json({ success: false, message: '后端服务异常' });
                                             }
                                             })

app.post('/api/proxy/virtual-tryon', async (req, res) => {
  try {
    const response = await axios.post(`${AI_BACKEND_BASE_URL}/api/virtual-tryon`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ success: false, message: '代理请求失败' });
  }
});

// 调试：打印解析后的请求体
app.use((req, res, next) => {
    if (DEBUG_HTTP) {
        console.log('--- Body Parser Debug ---');
        console.log('req.body:', req.body);
        console.log('req.headers.content-type:', req.headers['content-type']);
    }
    next();
});

// 信任代理（Render 的负载均衡器）
app.set('trust proxy', true);

// 会话配置
const sessionCookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
const sessionCookieSecure = sessionCookieSameSite === 'none' ? true : 'auto';
const sessionMiddleware = session({
    secret: SESSION_SECRET || 'test-session-secret-please-change-immediately',
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: sessionCookieSecure,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: sessionCookieSameSite,
        ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {})
    }
});
app.use(sessionMiddleware);

// 会话调试
app.use((req, res, next) => {
    if (DEBUG_SESSION) {
        console.log('会话状态:', req.session ? '已初始化' : '未初始化');
        console.log('会话用户:', req.session && req.session.user ? req.session.user.email : '未登录');
        console.log('会话ID:', req.sessionID || '未定义');
        if (req.session && req.session.csrfToken) {
            console.log('CSRF令牌:', req.session.csrfToken.substring(0, 10) + '...');
        }
    }
    next();
});
// 手动处理 /uploads/outfits/ 下的图片请求
// 手动处理 /uploads/outfits/ 下的图片请求
app.get('/uploads/outfits/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'uploads', 'outfits', filename);
    console.log('========== 图片请求 ==========');
    console.log('请求文件名:', filename);
    console.log('__dirname:', __dirname);
    console.log('拼接后的完整路径:', filePath);
    console.log('文件是否存在:', fs.existsSync(filePath));
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('图片发送失败:', err);
            res.status(404).send('图片不存在');
        }
    });
});
// 搭配管理路由
app.use('/admin/outfits', outfitAdminRouter);
// 视图引擎与静态文件
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// 禁用静态文件缓存，方便调试
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    setHeaders: (res, path, stat) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
    maxAge: 0,
    setHeaders: (res, path, stat) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// 图像处理相关
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('sharp 未安装，缩略图生成将跳过'); }
const ASSETS_DIR = path.join(__dirname, 'assets', 'wardrobe');
const THUMBS_DIR = path.join(ASSETS_DIR, 'thumbs');
try {
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
} catch (e) {
    console.warn('创建资产目录失败:', e.message);
}
function ensureThumb(file) {
    const src = path.join(ASSETS_DIR, file);
    const dst = path.join(THUMBS_DIR, file);
    if (sharp && fs.existsSync(src) && !fs.existsSync(dst)) {
        sharp(src).resize(480).jpeg({ quality: 70 }).toFile(dst).catch(err => {
            console.warn('缩略图生成失败:', file, err.message);
        });
    }
}
['item1.jpg','item2.jpg','item3.jpg'].forEach(ensureThumb);

// 数据库查询函数
async function getClothes() {
    try {
        const [rows] = await global.db.query('SELECT * FROM clothes');
        return rows;
    } catch (error) {
        console.error('获取衣服数据失败:', error.message);
        return [];
    }
}
async function getOutfitSuggestions() {
    try {
        const [rows] = await global.db.query('SELECT * FROM outfit_suggestions');
        return rows;
    } catch (error) {
        console.error('获取 outfit 数据失败:', error.message);
        return [];
    }
}
async function preloadData() {
    console.log('预加载数据...');
    clothes = await getClothes();
    outfitSuggestions = await getOutfitSuggestions();
    console.log(`预加载完成: 衣服 ${clothes.length} 件, Outfit 建议 ${outfitSuggestions.length} 个`);
}
let clothes = [], outfitSuggestions = [];
if (process.env.NODE_ENV !== 'test') {
    preloadData();
}

// 导入服务与路由
const clothingRecognitionService = require('./services/clothing_recognition');
const enhancedClothingRecognition = require('./services/enhanced_clothing_recognition');
const faceDetection = require('./services/face_detection');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const wardrobeRoutes = require('./routes/wardrobe');
const aiOutfitRoutes = require('./routes/ai-outfit');
const virtualTryonRoutes = require('./routes/virtual-tryon');
const aiServiceRoutes = require('./routes/ai-service');
const pifuhdRoutes = require('./routes/pifuhd');
const githubOAuthRoutes = require('./routes/github-oauth');
const outfitAdminRoutes = require('./routes/outfitAdmin');


// 初始化数据库
if (process.env.NODE_ENV !== 'test') {
    initDatabase();
}

console.log('注册路由...');
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/wardrobe', wardrobeRoutes);
app.use('/ai-outfit', aiOutfitRoutes);
app.use('/virtual-tryon', virtualTryonRoutes);
app.use('/api/ai-service', aiServiceRoutes);
app.use('/api/pifuhd', pifuhdRoutes);
app.use('/auth/github', githubOAuthRoutes);
app.use('/admin/outfits', outfitAdminRoutes);


// 用户偏好接口
app.post('/api/preferences', (req, res) => {
    try {
        req.session.preferences = req.body || {};
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: '偏好保存失败' });
    }
});
app.get('/api/preferences', (req, res) => {
    res.json({ success: true, data: req.session.preferences || {} });
});

// 获取用户衣物列表的API
app.get('/api/wardrobe/clothes', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }
    try {
        const clothes = await require('./services/wardrobeService').getClothes(req.session.user.id);
        res.json({ success: true, data: clothes });
    } catch (error) {
        console.error('获取衣物列表失败:', error);
        res.status(500).json({ success: false, error: '获取衣物列表失败' });
    }
});

// 获取用户衣橱统计数据的API
app.get('/api/wardrobe/stats', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }
    try {
        const userId = req.session.user.id;
        const [rows] = await global.db.query('SELECT * FROM clothes WHERE user_id = ?', [userId]);
        const totalCount = rows.length;
        const types = new Set(rows.map(row => row.type));
        const typeCount = types.size;
        res.json({ 
            success: true, 
            data: {
                total: totalCount,
                types: typeCount
            }
        });
    } catch (error) {
        console.error('获取衣橱统计数据失败:', error);
        res.status(500).json({ success: false, error: '获取衣橱统计数据失败' });
    }
});

// 全局请求日志
app.use((req, res, next) => {
    console.log(`全局请求: ${req.method} ${req.url}`);
    next();
});

// CSP 违规报告接收端点
app.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body;
    console.log('🚨 CSP Violation:', JSON.stringify(report, null, 2));
    fs.appendFile('csp-reports.log', JSON.stringify(report) + '\n', (err) => {
        if (err) console.error('写入CSP报告失败:', err);
    });
    res.status(204).send();
});

// 健康与监控端点
app.get('/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        pid: process.pid,
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
        timestamp: Date.now()
    });
});
app.get('/metrics', (req, res) => {
    const m = process.memoryUsage();
    res.json({
        success: true,
        data: {
            requests: metrics.requests,
            slow: metrics.slow,
            errors: metrics.errors,
            avgResponseMs: metrics.avgResponseMs,
            lastErrors: metrics.lastErrors,
            memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal },
            timestamp: Date.now()
        }
    });
});
app.get('/ready', (req, res) => {
    computeReadiness();
    res.json({ success: true, data: readiness });
});
app.get('/monitor/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
    res.write('retry: 10000\n\n');
    sseClients.add(res);
    req.on('close', () => { sseClients.delete(res); });
});

function computeReadiness() {
    const root = process.env.PIFUHD_ROOT;
    const py = process.env.PIFUHD_PYTHON || 'python';
    let okRoot = false, okCkpt = false;
    try {
        okRoot = !!root && fs.existsSync(root);
        okCkpt = okRoot && fs.existsSync(path.join(root, 'checkpoints', 'pifuhd.pt'));
        if (!okCkpt) {
            const local1 = path.join(__dirname, 'checkpoints', 'pifuhd.pt');
            const workspace = path.join(__dirname, '..', 'checkpoints', 'pifuhd.pt');
            okCkpt = fs.existsSync(local1) || fs.existsSync(workspace);
        }
    } catch (e) {}
    const okSharp = !!sharp;
    readiness.ok = true;
    readiness.details = { pifuhdRoot: okRoot, pifuhdCkpt: okCkpt, python: !!py, sharp: okSharp };
}

// 404 页面
app.use((req, res) => {
    res.status(404).render('404', { title: '页面未找到' });
});


// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err.stack);  // 打印完整堆栈到终端
    res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});


// 未捕获异常处理
process.on('uncaughtException', (err) => {
    const errorMsg = `[${new Date().toISOString()}] Uncaught Exception: ${err.message}\n${err.stack}\n`;
    console.error(errorMsg);
    fs.appendFileSync('crash.log', errorMsg);
    metrics.errors += 1;
    metrics.lastErrors.unshift({ t: Date.now(), m: 'uncaught:' + String(err && err.message || err) });
    metrics.lastErrors = metrics.lastErrors.slice(0, 50);
    sseClients.forEach(c => { try { c.write(`data: CRASH ${String(err && err.message || err)}\n\n`); } catch(e) {} });
    console.warn('⚠️  服务器遇到未捕获异常，正在尝试恢复...');
});
process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\nPromise: ${promise}\n`;
    console.error(errorMsg);
    fs.appendFile('error.log', errorMsg, () => {});
    metrics.errors += 1;
    metrics.lastErrors.unshift({ t: Date.now(), m: 'unhandled:' + String(reason) });
    metrics.lastErrors = metrics.lastErrors.slice(0, 50);
});

// 进程信号处理
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，正在优雅关闭服务器...');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('收到 SIGINT 信号，正在优雅关闭服务器...');
    process.exit(0);
});
if (require.main === module) {
    (async () => {
        try {
            await global.db.query('SELECT 1');
            console.log('数据库连接测试成功');
        } catch (err) {
            console.error('数据库连接测试失败:', err);
        }
    })();
    app.listen(PORT, () => {
        console.log(`服务器运行在 http://localhost:${PORT}`);
        console.log('环境变量验证:');
        console.log('ADMIN_PASSWORD_HASH 存在:', !!process.env.ADMIN_PASSWORD_HASH);
        console.log('USER_PASSWORD_HASH 存在:', !!process.env.USER_PASSWORD_HASH);
        console.log('数据库配置已从环境变量加载。');
        console.log('测试用户: admin@example.com / user@example.com (从数据库获取)');
    });
}

module.exports = app;

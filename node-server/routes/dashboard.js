const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 原有的上传目录配置（暂时保留，稍后我们会测试）
const uploadDir = path.join(__dirname, '../public/uploads/home');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 原有的 multer 配置（带自定义存储）
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safeFieldname = file.fieldname.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, safeFieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// 原有的路由
router.get('/', dashboardController.getDashboard);
router.get('/edit', dashboardController.getHomeEditor);
router.post('/save-home', upload.any(), dashboardController.saveHomeContent);

router.get('/home-content', (req, res) => {
    try {
        const HOME_CONTENT_PATH = path.join(__dirname, '../config/home-content.json');
        const body = fs.existsSync(HOME_CONTENT_PATH) ? JSON.parse(fs.readFileSync(HOME_CONTENT_PATH, 'utf8')) : {};
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: body });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;

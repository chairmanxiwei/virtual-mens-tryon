const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const photoDir = path.join(__dirname, '..', 'public', 'uploads', 'photos');
fs.ensureDirSync(photoDir);
const GIF_URL = '/assets/gifs/sample.gif';
const PLACEHOLDER_URL = '/img/placeholder.svg';

function generateUniqueFilename(originalFilename) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalFilename);
    return 'photo-' + uniqueSuffix + ext;
}

// ==================== Multer 配置 ====================
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, photoDir),
    filename: (req, file, cb) => cb(null, generateUniqueFilename(file.originalname))
});

const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.mimetype) || allowed.includes(ext);
        cb(ok ? null : new Error('只支持JPEG/PNG/WebP图像'), ok);
    }
});

// ==================== 路由 ====================

// 虚拟试穿页面
router.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    const uploaded = req.query.uploaded === 'success' || req.query.uploaded === 'processing';
    const filename = req.query.filename;
    const modeled = req.query.modeled === 'success';
    const processing = req.query.uploaded === 'processing';
    res.render('virtual-tryon', {
        title: '虚拟试穿',
        user: req.session.user,
        uploaded,
        filename,
        modeled,
        processing,
        csrfToken: req.session.csrfToken,
        gifUrl: GIF_URL,
        placeholderUrl: PLACEHOLDER_URL
    });
});

// 上传中间件
const uploadMiddleware = upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]);

// 上传照片并触发 PIFuHD 处理
router.post('/upload', (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            const codeMap = {
                'LIMIT_FILE_SIZE': 'filesize',
                'LIMIT_UNEXPECTED_FILE': 'filetype'
            };
            return res.redirect(`/virtual-tryon?error=${codeMap[err.code] || 'upload_error'}`);
        } else if (err) {
            console.error('Upload error:', err);
            const msg = err.message === '只支持JPEG/PNG/WebP图像' ? 'filetype' : 'upload_failed';
            return res.redirect(`/virtual-tryon?error=${msg}`);
        }
        next();
    });
}, async (req, res) => {
    if (!req.session.user) return res.redirect('/?error=unauthorized');
    if (!req.body.csrfToken || req.body.csrfToken !== req.session.csrfToken) {
        return res.redirect('/virtual-tryon?error=csrf');
    }

    const file = (req.files && (req.files.photo?.[0] || req.files.image?.[0])) || null;
    if (!file) return res.redirect('/virtual-tryon?error=nofile');

    const filename = file.filename;
    const ts = Date.now();
    res.redirect(`/virtual-tryon?uploaded=success&filename=${filename}&gif=1&ts=${ts}`);
});

// 检查模型是否已生成（供前端轮询）
router.get('/check-model', (req, res) => {
    const gifPath = path.join(__dirname, '..', 'public', 'assets', 'gifs', 'sample.gif');
    const ok = fs.existsSync(gifPath);
    res.json({ ready: ok, gif: GIF_URL, placeholder: PLACEHOLDER_URL });
});

module.exports = router;

// controllers/wardrobeController.js
console.log('开始加载 wardrobeController');
const axios = require('axios');
const sharp = require('sharp');
const getColors = require('get-image-colors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const clothingRecognitionService = require('../services/clothing_recognition');
const wardrobeService = require('../services/wardrobeService');
const OSS = require('ali-oss');

// 初始化 OSS 客户端（从环境变量读取配置）
const ossClient = new OSS({
  region: 'oss-cn-shanghai',   // 根据实际 OSS 区域调整，例如 'oss-cn-shanghai'
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET_NAME,
});

function clampInt(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case r:
                h = ((g - b) / d) % 6;
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
                break;
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
    }
    return { h, s, l };
}

function describeColorZh({ h, s, l }) {
    const sat = s;
    const light = l;

    if (sat < 0.12) {
        if (light > 0.92) return '白色';
        if (light < 0.12) return '黑色';
        if (light < 0.28) return '深灰色';
        if (light > 0.78) return '浅灰色';
        return '灰色';
    }

    if (h >= 35 && h <= 65 && sat < 0.45 && light >= 0.42 && light <= 0.72) return '卡其色';
    if (h >= 35 && h <= 65 && sat < 0.30 && light > 0.75) return '米色';
    if (h >= 15 && h <= 40 && light < 0.45) return '棕色';
    if (h >= 200 && h <= 235 && light < 0.28) return '藏青色';

    let base = '蓝色';
    if (h >= 345 || h < 15) base = '红色';
    else if (h < 35) base = '橙色';
    else if (h < 65) base = '黄色';
    else if (h < 160) base = '绿色';
    else if (h < 200) base = '青色';
    else if (h < 255) base = '蓝色';
    else if (h < 295) base = '紫色';
    else base = '粉色';

    if (base === '蓝色') {
        if (light > 0.70) return '浅蓝色';
        if (light < 0.35) return '深蓝色';
        return '蓝色';
    }
    if (base === '红色') {
        if (light < 0.35) return '暗红色';
        if (light > 0.70) return '粉红色';
        return '红色';
    }
    if (base === '绿色') {
        if (light < 0.35) return '深绿色';
        if (light > 0.70) return '浅绿色';
        return '绿色';
    }
    if (base === '黄色') {
        if (light < 0.35) return '土黄色';
        if (light > 0.75) return '浅黄色';
        return '黄色';
    }
    return base;
}

function colorDistanceSq(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

function estimateBackgroundColor(raw, width, height) {
    const samples = [];
    const pushPixel = (x, y) => {
        const idx = (y * width + x) * 4;
        const a = raw[idx + 3];
        if (a < 16) return;
        samples.push({ r: raw[idx], g: raw[idx + 1], b: raw[idx + 2] });
    };
    for (let x = 0; x < width; x++) {
        pushPixel(x, 0);
        pushPixel(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
        pushPixel(0, y);
        pushPixel(width - 1, y);
    }
    if (samples.length === 0) return { r: 255, g: 255, b: 255 };
    const avg = samples.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
    return { r: Math.round(avg.r / samples.length), g: Math.round(avg.g / samples.length), b: Math.round(avg.b / samples.length) };
}

function kmeans(pixels, k) {
    const centroids = [];
    const step = Math.max(1, Math.floor(pixels.length / k));
    for (let i = 0; i < k; i++) {
        centroids.push({ ...pixels[Math.min(i * step, pixels.length - 1)] });
    }

    const assignments = new Array(pixels.length).fill(0);
    for (let iter = 0; iter < 8; iter++) {
        for (let i = 0; i < pixels.length; i++) {
            let best = 0;
            let bestDist = Infinity;
            for (let c = 0; c < k; c++) {
                const d = colorDistanceSq(pixels[i], centroids[c]);
                if (d < bestDist) {
                    bestDist = d;
                    best = c;
                }
            }
            assignments[i] = best;
        }

        const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
        for (let i = 0; i < pixels.length; i++) {
            const a = assignments[i];
            sums[a].r += pixels[i].r;
            sums[a].g += pixels[i].g;
            sums[a].b += pixels[i].b;
            sums[a].n += 1;
        }
        for (let c = 0; c < k; c++) {
            if (sums[c].n > 0) {
                centroids[c] = {
                    r: Math.round(sums[c].r / sums[c].n),
                    g: Math.round(sums[c].g / sums[c].n),
                    b: Math.round(sums[c].b / sums[c].n)
                };
            }
        }
    }

    const counts = new Array(k).fill(0);
    for (const a of assignments) counts[a] += 1;
    return { centroids, counts };
}

async function cropByExternalDetector(originalBuffer) {
    try {
        const base64 = originalBuffer.toString('base64');
        const pythonRes = await axios.post('https://mens-fashion-python-api.onrender.com/find_clothes', { image: base64 }, { timeout: 5000 });
        const { x, y, width, height } = pythonRes.data || {};
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return originalBuffer;

        const meta = await sharp(originalBuffer).metadata();
        const left = clampInt(Math.floor(x), 0, (meta.width || 0) - 1);
        const top = clampInt(Math.floor(y), 0, (meta.height || 0) - 1);
        const w = clampInt(Math.floor(width), 1, (meta.width || 1) - left);
        const h = clampInt(Math.floor(height), 1, (meta.height || 1) - top);
        return await sharp(originalBuffer).extract({ left, top, width: w, height: h }).toBuffer();
    } catch {
        return originalBuffer;
    }
}

async function extractClothColors(buffer) {
    const { data, info } = await sharp(buffer)
        .resize({ width: 180, height: 180, fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const bg = estimateBackgroundColor(data, width, height);
    const bgThresholdSq = 30 * 30;

    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 32) continue;
        const p = { r: data[i], g: data[i + 1], b: data[i + 2] };
        if (colorDistanceSq(p, bg) <= bgThresholdSq) continue;
        pixels.push(p);
    }

    const usable = pixels.length >= 200 ? pixels : (() => {
        const all = [];
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 32) continue;
            all.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }
        return all;
    })();

    const sampleStep = usable.length > 8000 ? Math.floor(usable.length / 8000) : 1;
    const sampled = sampleStep === 1 ? usable : usable.filter((_, idx) => idx % sampleStep === 0);

    const k = sampled.length < 800 ? 2 : 3;
    const { centroids, counts } = kmeans(sampled, k);

    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const items = centroids
        .map((c, idx) => {
            const pct = Math.round((counts[idx] / total) * 100);
            const hsl = rgbToHsl(c.r, c.g, c.b);
            const name = describeColorZh(hsl);
            return { name, pct, rgb: c };
        })
        .sort((a, b) => b.pct - a.pct);

    const merged = [];
    for (const it of items) {
        const existing = merged.find(m => m.name === it.name);
        if (existing) existing.pct += it.pct;
        else merged.push({ ...it });
    }
    merged.sort((a, b) => b.pct - a.pct);

    const top = merged.slice(0, 3);
    const summary = top.map(c => `${c.name}(${c.pct}%)`).join('，');
    return { summary, colors: top, primary: top[0] || null };
}

// 配置文件存储
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只支持图片文件'), false);
        }
    }
}).single('photo');

// 我的衣橱页面
exports.getWardrobe = async (req, res) => {
    try {
        // 从 Session 获取当前登录用户ID
        const currentUserId = req.session.user?.id;
        console.log('getWardrobe被调用，currentUserId:', currentUserId);
        
        // 如果未登录，跳转到登录页
        if (!currentUserId) {
            console.log('用户未登录，跳转到登录页');
            return res.redirect('/login');
        }
        
        if (!req.session.csrfToken) {
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
            console.log('生成新的CSRF令牌');
        }
        
        // 直接从数据库查询，不使用wardrobeService
        let clothes = [];
        try {
            console.log('直接从数据库查询衣物数据');
            let query = 'SELECT * FROM clothes';
            let params = [];
            if (currentUserId) {
                query += ' WHERE user_id = ?';
                params.push(currentUserId);
            }
            const [rows] = await global.db.query(query, params);
            console.log('查询结果数量:', rows.length);
            console.log('查询结果类型:', typeof rows);
            console.log('是否为数组:', Array.isArray(rows));
            clothes = rows;
        } catch (error) {
            console.error('获取衣服数据失败:', error);
            // 即使获取失败，也继续渲染页面，使用空数组
            clothes = [];
        }
        
        const uploadSuccess = req.session.uploadSuccess;
        const uploadError = req.session.uploadError;
        delete req.session.uploadSuccess;
        delete req.session.uploadError;
        
        console.log('渲染wardrobe页面，clothes.length:', clothes.length);
        
        // 直接传递clothes数组
        res.render('wardrobe', { 
            title: '我的衣橱', 
            user: req.session.user,
            clothes: clothes,
            csrfToken: req.session.csrfToken,
            uploadSuccess: uploadSuccess,
            uploadError: uploadError
        });
    } catch (error) {
        console.error('getWardrobe方法出错:', error);
        // 出错时，渲染页面并使用空数组
        res.render('wardrobe', { 
            title: '我的衣橱', 
            user: req.session.user,
            clothes: [],
            csrfToken: req.session.csrfToken || crypto.randomBytes(32).toString('hex'),
            uploadSuccess: null,
            uploadError: null
        });
    }
};

// 供路由直接获取衣橱数据的快捷方法
exports._getClothesDirect = async (userId) => {
    try {
        const list = await wardrobeService.getClothes(userId);
        return list || [];
    } catch (e) {
        return [];
    }
};
// 处理上传新衣物
exports.uploadCloth = async (req, res) => {
    if (!req.session.user) return res.redirect('/');

    try {
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (!req.file) {
            req.session.uploadError = '请选择图片文件';
            return res.redirect('/wardrobe');
        }

        if (!req.body.csrfToken || req.body.csrfToken !== req.session.csrfToken) {
            req.session.uploadError = '安全验证失败';
            return res.redirect('/wardrobe');
        }

        let detectedColor = req.body.color;
        let colorPalette = null;
        if (req.file && (!detectedColor || detectedColor === '请选择颜色' || detectedColor === '')) {
            const cropped = await cropByExternalDetector(req.file.buffer);
            colorPalette = await extractClothColors(cropped);
            detectedColor = colorPalette.summary || '未知';
        }

        // 压缩图片并上传到 OSS
        const processedBuffer = await sharp(req.file.buffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        
        const filename = `wardrobe/${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
        await ossClient.put(filename, processedBuffer, {
          headers: { 'x-oss-object-acl': 'public-read' }
        });
        
        // 构建公共读 URL（不带签名）
        const endpoint = process.env.OSS_ENDPOINT.replace(/^https?:\/\/+/, '');
        const ossUrl = `https://${process.env.OSS_BUCKET_NAME}.${endpoint}/${filename}`;

        const newCloth = {
            name: req.body.name || (detectedColor ? detectedColor + '衣物' : '新衣物'),
            color: detectedColor || '未知',
            type: req.body.type || '其他',
            style: req.body.style || '休闲',
            pattern: req.body.pattern || '纯色',
            season: req.body.season || '四季',
            size: req.body.size || 'M',
            brand: req.body.brand || '未知',
            material: req.body.material || '未知',
            suitable_temp: req.body.suitable_temp || '',
            price: req.body.price ? parseFloat(req.body.price) : 0.00,
            description: req.body.description || '',
            image: ossUrl,
            thumb: null,
            primary_color_name: colorPalette?.colors?.[0]?.name || null,
            primary_color_pct: colorPalette?.colors?.[0]?.pct ?? null,
            secondary_color_name: colorPalette?.colors?.[1]?.name || null,
            secondary_color_pct: colorPalette?.colors?.[1]?.pct ?? null,
            background_color_name: null,
            color_palette_json: colorPalette ? JSON.stringify(colorPalette.colors) : null,
            _colorComponents: colorPalette?.colors || null
        };

        await wardrobeService.saveCloth(newCloth, req.session.user.id);
        req.session.uploadSuccess = '衣物上传成功！颜色已识别为：' + detectedColor;
        res.redirect('/wardrobe');
    } catch (error) {
        console.error('上传衣物失败:', error);
        req.session.uploadError = error.message;
        res.redirect('/wardrobe');
    }
};

exports.detectColor = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    try {
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (!req.file) {
            return res.status(400).json({ success: false, error: '缺少图片文件' });
        }

        if (!req.body.csrfToken || req.body.csrfToken !== req.session.csrfToken) {
            return res.status(403).json({ success: false, error: 'CSRF验证失败' });
        }

        const cropped = await cropByExternalDetector(req.file.buffer);
        const palette = await extractClothColors(cropped);
        res.json({
            success: true,
            summary: palette.summary,
            primary: palette.primary ? palette.primary.rgb : null,
            colors: palette.colors
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || '识别失败' });
    }
};

// ... 其余方法保持不变 ...
exports.getCloth = async (req, res) => {
    // 从 Session 获取当前登录用户ID
    const currentUserId = req.session.user?.id;
    
    // 如果未登录，返回未授权错误
    if (!currentUserId) {
        return res.status(401).json({ success: false, error: '请先登录' });
    }
    
    try {
        const cloth = await wardrobeService.getClothById(req.params.id, currentUserId);
        res.json({ success: !!cloth, data: cloth });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.editCloth = async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    try {
        await wardrobeService.updateCloth(req.body.id, req.body, req.session.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteCloth = async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    try {
        if (!req.body.csrfToken || req.body.csrfToken !== req.session.csrfToken) {
            return res.status(403).json({ success: false, error: 'CSRF验证失败' });
        }
        await wardrobeService.deleteCloth(req.body.id, req.session.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 获取衣橱统计信息
exports.getStats = async (req, res) => {
    try {
        // 从会话中获取当前登录用户ID
        const userId = req.session.user?.id;
        
        // 未登录验证
        if (!userId) {
            return res.status(401).json({ success: false, error: '未登录' });
        }
        
        // 执行数据库查询获取统计数据
        const [rows] = await global.db.query('SELECT COUNT(*) as total, COUNT(DISTINCT type) as types FROM clothes WHERE user_id = ?', [userId]);
        
        // 返回成功响应与统计数据
        res.json({ success: true, data: { total: rows[0].total, types: rows[0].types } });
    } catch (err) {
        // 错误处理
        res.status(500).json({ success: false, error: err.message });
    }
};

// controllers/outfitAdminController.js
const fs = require('fs').promises; // 使用 promise 版本
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const outfitService = require('../services/outfitService');
const cache = require('../utils/cache');
// 配置文件上传，使用固定文件名（覆盖旧文件）
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/outfits');
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        if (file.fieldname === 'business') {
            cb(null, 'business-suit.jpg');
        } else if (file.fieldname === 'casual') {
            cb(null, 'casual.jpg');
        } else if (file.fieldname === 'formal') {
            cb(null, 'formal.jpg');
        } else {
            // 对于其他搭配，使用搭配ID+时间戳作为文件名
            const ext = path.extname(file.originalname);
            cb(null, `outfit-${Date.now()}${ext}`);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只支持图片文件'), false);
        }
    }
}).fields([
    { name: 'business', maxCount: 1 },
    { name: 'casual', maxCount: 1 },
    { name: 'formal', maxCount: 1 },
    { name: 'outfit_image', maxCount: 1 } // 用于其他搭配的图片上传
]);

// 管理页面：显示所有搭配
exports.getAdminPage = async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    try {
        const outfits = await outfitService.getAllOutfits();
        res.render('outfit-admin', {
            title: '搭配管理',
            user: req.session.user,
            outfits: outfits,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('获取管理页面失败:', error);
        res.status(500).send('服务器错误');
    }
};

// 处理固定三个搭配的图片上传
exports.uploadFixedImages = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }

        try {
            const updates = [];

            if (req.files && req.files.business) {
                updates.push(
                    outfitService.updateOutfitImageByName('商务精英', '/uploads/outfits/business-suit.jpg')
                );
            }
            if (req.files && req.files.casual) {
                updates.push(
                    outfitService.updateOutfitImageByName('休闲聚会', '/uploads/outfits/casual.jpg')
                );
            }
            if (req.files && req.files.formal) {
                updates.push(
                    outfitService.updateOutfitImageByName('正式晚宴', '/uploads/outfits/formal.jpg')
                );
            }

            await Promise.all(updates);
            const cacheKey = `outfits:guest`; // 因为 getAllOutfits 未传 userId，所以使用 guest 
            cache.del(cacheKey);
            res.json({ success: true, message: '图片更新成功' });
        } catch (error) {
            console.error('更新图片失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
};

// 处理任意搭配的图片上传（可指定搭配ID）
exports.uploadOutfitImage = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }

        try {
            // 必须在 upload 回调内部读取 req.body
            const outfitId = req.body.outfitId;
            if (!outfitId) {
                return res.status(400).json({ success: false, error: '缺少搭配ID' });
            }

            if (!req.files || !req.files.outfit_image) {
                return res.status(400).json({ success: false, error: '未选择图片' });
            }

            const file = req.files.outfit_image[0];
            // 生成唯一文件名：搭配ID-时间戳.扩展名
            const ext = path.extname(file.originalname);
            const filename = `outfit-${outfitId}-${Date.now()}${ext}`;
            const oldPath = file.path;
            const newPath = path.join(path.dirname(oldPath), filename);
            await fs.rename(oldPath, newPath);

            const imagePath = '/uploads/outfits/' + filename;

            // 更新数据库
            await outfitService.updateOutfitImage(outfitId, imagePath);
            const cacheKey = `outfits:guest`; // 因为 getAllOutfits 未传 userId，所以使用 guest 
            cache.del(cacheKey);

            res.json({ success: true, message: '图片上传成功', imagePath });
        } catch (error) {
            console.error('上传图片失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
};

// 新增搭配
exports.addOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    const { name, description, occasion, style, season } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, error: '名称不能为空' });
    }

    try {
        const newOutfit = {
            name,
            description: description || '',
            occasion: occasion || '其他',
            style: style || '休闲',
            season: season || '四季',
            image: '/img/placeholder.svg',
            thumb: '/img/placeholder.svg'
        };
        const result = await outfitService.saveOutfitSuggestion(newOutfit);
        const cacheKey = `outfits:guest`; // 因为 getAllOutfits 未传 userId，所以使用 guest 
        cache.del(cacheKey);
        res.json({ success: true, message: '新增成功', id: result.id });
    } catch (error) {
        console.error('新增搭配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// 更新搭配信息（名称、描述、场合等）
exports.updateOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    const { id, name, description, occasion, style, season } = req.body;
    if (!id) {
        return res.status(400).json({ success: false, error: '缺少搭配ID' });
    }

    try {
        await outfitService.updateOutfitSuggestion(id, {
            name, description, occasion, style, season
        });
        const cacheKey = `outfits:guest`; // 因为 getAllOutfits 未传 userId，所以使用 guest 
        cache.del(cacheKey);
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        console.error('更新搭配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// 删除搭配
exports.deleteOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ success: false, error: '缺少搭配ID' });
    }

    try {
        await outfitService.deleteOutfitSuggestion(id);
        const cacheKey = `outfits:guest`; // 因为 getAllOutfits 未传 userId，所以使用 guest 
        cache.del(cacheKey);
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        console.error('删除搭配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
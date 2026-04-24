const fs = require('fs');
const path = require('path');
const tryonService = require('../services/tryonService');

// 上传目录
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 虚拟试穿页面
exports.getVirtualTryon = (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    const uploaded = req.query.uploaded === 'success';
    const filename = req.query.filename;
    
    res.render('virtual-tryon', { 
        title: '虚拟试穿', 
        user: req.session.user,
        uploaded: uploaded,
        filename: filename
    });
};

// 处理文件上传
exports.uploadPhoto = (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    // 由于没有使用express-fileupload，暂时模拟上传成功
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    
    // 模拟上传成功，重定向回虚拟试穿页面
    res.redirect(`/virtual-tryon?uploaded=success&filename=${uniqueFilename}`);
};

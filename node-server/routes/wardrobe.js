const express = require('express');
const router = express.Router();
const multer = require('multer');
const wardrobeController = require('../controllers/wardrobeController');

const noneParser = multer().none();

// 添加日志中间件
router.use((req, res, next) => {
    console.log(`wardrobe 路由收到请求: ${req.method} ${req.url}`);
    next();
});

// 我的衣橱页面
router.get('/', wardrobeController.getWardrobe);

// 试衣选择衣物页面（作为独立界面）
router.get('/picker', async (req, res) => {
    // 从 Session 获取当前登录用户ID
    const currentUserId = req.session.user?.id;
    
    // 如果未登录，跳转到登录页
    if (!currentUserId) {
        return res.redirect('/login');
    }
    
    const clothes = await wardrobeController._getClothesDirect(currentUserId);
    res.render('tryon-wardrobe', { title: '选择衣物', user: req.session.user, clothes });
});

// 获取单件衣物信息
router.get('/cloth/:id', wardrobeController.getCloth);

// 处理上传新衣物
router.post('/upload', wardrobeController.uploadCloth);

// 处理编辑衣物
router.post('/edit', noneParser, wardrobeController.editCloth);

// 处理删除衣物
router.post('/delete', noneParser, wardrobeController.deleteCloth);

// 处理搭配推荐
// router.post('/recommend', noneParser, wardrobeController.recommendOutfit);

// 颜色识别接口
router.post('/detect-color', wardrobeController.detectColor);

// 获取衣橱统计信息
router.get('/stats', wardrobeController.getStats);

module.exports = router;

const express = require('express');
const router = express.Router();
const outfitAdminController = require('../controllers/outfitAdminController');

// 包装函数：捕获异步错误并传递给 next
const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// 管理页面
router.get('/', asyncHandler(outfitAdminController.getAdminPage));

// 上传固定三个搭配的图片
router.post('/upload-fixed', asyncHandler(outfitAdminController.uploadFixedImages));

// 上传任意搭配的图片（需要搭配ID）
router.post('/upload-image', asyncHandler(outfitAdminController.uploadOutfitImage));

// 新增搭配
router.post('/add', asyncHandler(outfitAdminController.addOutfit));

// 更新搭配信息
router.post('/update', asyncHandler(outfitAdminController.updateOutfit));

// 删除搭配
router.post('/delete', asyncHandler(outfitAdminController.deleteOutfit));

module.exports = router;
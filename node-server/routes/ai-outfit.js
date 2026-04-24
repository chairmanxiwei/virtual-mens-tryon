const express = require('express');
const router = express.Router();
const aiOutfitController = require('../controllers/aiOutfitController');

// AI搭配页面
router.get('/', aiOutfitController.getAIOutfit);

// 生成搭配方案
router.post('/generate', aiOutfitController.generateOutfit);

// LLM 推荐（目的/场景 + 天气 + 衣橱）
router.post('/llm-recommend', aiOutfitController.llmRecommend);

// CatVTON 试衣
router.post('/tryon', aiOutfitController.tryonCatvton);
router.post('/tryon-batch', aiOutfitController.tryonBatch);

// 保存搭配建议
router.post('/save', aiOutfitController.saveOutfit);

// 更新搭配建议
router.post('/update', aiOutfitController.updateOutfit);

// 删除搭配建议
router.post('/delete', aiOutfitController.deleteOutfit);

module.exports = router;

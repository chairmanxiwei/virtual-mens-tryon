// services/outfitService.js
/**
 * AI搭配服务层
 * 负责处理搭配推荐、天气集成、场景筛选等
 */
const cache = require('../utils/cache');

/**
 * 获取所有搭配方案（可能从数据库读取）
 * @param {number} userId - 用户ID，用于缓存区分
 * @returns {Promise<Array>}
 */
async function getAllOutfits(userId) {
    // 生成缓存键
    const cacheKey = `outfits:${userId || 'guest'}`;
    
    // 尝试从缓存获取
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log('从缓存获取搭配方案');
        return cachedData;
    }
    
    try {
        const [rows] = await global.db.query('SELECT * FROM outfit_suggestions');
        
        // 存入缓存
        cache.set(cacheKey, rows);
        console.log('搭配方案存入缓存');
        
        return rows;
    } catch (error) {
        console.error('获取搭配方案失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

/**
 * 根据场景筛选搭配方案
 * @param {string} occasion - 场合（如商务会议、休闲等）
 * @returns {Promise<Array>}
 */
async function getOutfitsByOccasion(occasion) {
    try {
        const [rows] = await global.db.query(
            'SELECT * FROM outfit_suggestions WHERE occasion = ?',
            [occasion]
        );
        return rows;
    } catch (error) {
        console.error('按场景获取搭配失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

/**
 * 保存新的搭配建议到数据库
 * @param {object} outfit - 搭配建议数据
 * @returns {Promise<object>} 保存的搭配建议对象
 */
async function saveOutfitSuggestion(outfit) {
    try {
        const [result] = await global.db.query(
            `INSERT INTO outfit_suggestions 
            (name, description, occasion, image, thumb, style, season, difficulty, rating, views, shirt_id, pants_id, shoes_id, jacket_id, accessories) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                outfit.name, outfit.description, outfit.occasion, outfit.image, outfit.thumb,
                outfit.style || '休闲', outfit.season || '四季', outfit.difficulty || '简单',
                outfit.rating || 0, outfit.views || 0, outfit.shirt_id || null,
                outfit.pants_id || null, outfit.shoes_id || null, outfit.jacket_id || null,
                outfit.accessories || ''
            ]
        );
        return {
            id: result.insertId,
            ...outfit
        };
    } catch (error) {
        console.error('保存搭配建议失败:', error.message);
        throw new Error('保存搭配建议失败');
    }
}

/**
 * 更新搭配建议数据
 * @param {number} id - 搭配建议ID
 * @param {object} updates - 更新数据
 * @returns {Promise<boolean>} 更新是否成功
 */
async function updateOutfitSuggestion(id, updates) {
    try {
        await global.db.query(
            `UPDATE outfit_suggestions SET 
            name = ?, description = ?, occasion = ?, style = ?, season = ?, 
            difficulty = ?, rating = ?, views = ?, shirt_id = ?, pants_id = ?, 
            shoes_id = ?, jacket_id = ?, accessories = ? 
            WHERE id = ?`,
            [
                updates.name, updates.description, updates.occasion, updates.style || '休闲',
                updates.season || '四季', updates.difficulty || '简单', updates.rating || 0,
                updates.views || 0, updates.shirt_id || null, updates.pants_id || null,
                updates.shoes_id || null, updates.jacket_id || null, updates.accessories || '',
                id
            ]
        );
        return true;
    } catch (error) {
        console.error('更新搭配建议失败:', error.message);
        throw new Error('更新搭配建议失败');
    }
}

/**
 * 删除搭配建议
 * @param {number} id - 搭配建议ID
 * @returns {Promise<boolean>} 删除是否成功
 */
async function deleteOutfitSuggestion(id) {
    try {
        await global.db.query('DELETE FROM outfit_suggestions WHERE id = ?', [id]);
        return true;
    } catch (error) {
        console.error('删除搭配建议失败:', error.message);
        throw new Error('删除搭配建议失败');
    }
}

/**
 * 获取天气信息（调用外部API，如ip-api）
 * @param {string} lat - 纬度
 * @param {string} lon - 经度
 * @returns {Promise<Object>} 天气数据
 */
async function getWeather(lat, lon) {
    // 生成缓存键
    const cacheKey = `weather:${lat}:${lon}`;
    
    // 尝试从缓存获取
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log('从缓存获取天气信息');
        return cachedData;
    }
    
    // 这里可以调用真实天气API，或使用模拟数据
    // 示例：使用 ip-api 返回的天气（可能需要其他API）
    // 暂时返回模拟数据
    const weatherData = { temp: 22, condition: '晴' };
    
    // 存入缓存，天气数据缓存时间较短（300秒）
    cache.set(cacheKey, weatherData, 300);
    console.log('天气信息存入缓存');
    
    return weatherData;
}

/**
 * 根据天气和风格生成搭配建议
 * @param {Object} params - 包含天气、场合、风格等
 * @returns {Promise<Array>}
 */
async function generateOutfitSuggestion(params) {
    // 这里可以写复杂的推荐逻辑，比如从数据库中筛选符合条件衣物
    // 先返回模拟数据
    return [
        { id: 1, name: '商务衬衫', category: '上装' },
        { id: 2, name: '西装裤', category: '下装' }
    ];
}
/**
 * 根据搭配名称更新图片路径
 * @param {string} name - 搭配名称（如“商务精英”）
 * @param {string} imagePath - 新的图片路径
 * @returns {Promise<boolean>}
 */
async function updateOutfitImageByName(name, imagePath) {
    try {
        await global.db.query(
            'UPDATE outfit_suggestions SET image = ?, thumb = ? WHERE name = ?',
            [imagePath, imagePath, name]
        );
        return true;
    } catch (error) {
        console.error('更新搭配图片失败:', error.message);
        throw new Error('更新图片失败');
    }
}
/**
 * 根据搭配ID更新图片路径
 * @param {number} id - 搭配ID
 * @param {string} imagePath - 新的图片路径
 * @returns {Promise<boolean>}
 */
async function updateOutfitImage(id, imagePath) {
    console.log('updateOutfitImage 被调用，参数:', { id, imagePath });
    try {
        const [result] = await global.db.query(
            'UPDATE outfit_suggestions SET image = ?, thumb = ? WHERE id = ?',
            [imagePath, imagePath, id]
        );
        console.log('updateOutfitImage 执行结果:', result);
        if (result.affectedRows === 0) {
            throw new Error(`未找到 ID 为 ${id} 的搭配记录`);
        }
        return true;
    } catch (error) {
        console.error('更新搭配图片失败:', error.message);
        throw new Error('更新图片失败: ' + error.message);
    }
}
module.exports = {
    getAllOutfits,
    getOutfitsByOccasion,
    saveOutfitSuggestion,
    updateOutfitSuggestion,
    deleteOutfitSuggestion,
    getWeather,
    generateOutfitSuggestion,
    updateOutfitImageByName,
    updateOutfitImage
};
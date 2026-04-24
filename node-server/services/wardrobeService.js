// services/wardrobeService.js
const cache = require('../utils/cache');

// 默认缓存键（当未提供用户ID时使用）
const DEFAULT_CACHE_KEY = 'clothes:guest';

/**
 * 获取衣物数据（可根据用户ID过滤）
 * @param {number} [userId] - 用户ID，用于过滤和缓存
 * @returns {Promise<Array>} 衣物列表
 */
async function getClothes(userId) {
    console.log('getClothes被调用，userId:', userId);
    const cacheKey = userId ? `clothes:${userId}` : DEFAULT_CACHE_KEY;
    console.log('缓存键:', cacheKey);
    
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log('从缓存获取衣物数据，数量:', cachedData.length);
        return cachedData;
    }
    
    try {
        let query = 'SELECT * FROM clothes';
        const params = [];
        if (userId) {
            query += ' WHERE user_id = ?';
            params.push(userId);
        }
        console.log('执行查询:', query, '参数:', params);
        const [rows] = await global.db.query(query, params);
        console.log('查询结果数量:', rows.length);
        
        cache.set(cacheKey, rows);
        console.log('衣物数据存入缓存');
        return rows;
    } catch (error) {
        console.error('获取衣服数据失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

/**
 * 根据ID获取衣物
 * @param {number} id - 衣物ID
 * @param {number} [userId] - 用户ID，用于验证衣物归属
 * @returns {Promise<object|null>} 衣物对象或null
 */
async function getClothById(id, userId) {
    try {
        let query = 'SELECT * FROM clothes WHERE id = ?';
        const params = [id];
        
        if (userId) {
            query += ' AND user_id = ?';
            params.push(userId);
        }
        
        const [rows] = await global.db.query(query, params);
        return rows[0] || null;
    } catch (error) {
        console.error('获取衣物失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

/**
 * 保存新衣服到数据库
 * @param {object} cloth - 衣物数据
 * @param {number} userId - 用户ID
 * @returns {Promise<object>} 保存的衣物对象
 */
async function saveCloth(cloth, userId) {
    try {
        const thumb = cloth.thumb || null;
        const [result] = await global.db.query(
            `INSERT INTO clothes 
            (name, color, type, image, thumb, size, brand, material, style, pattern, season, suitable_temp, price, description, user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                cloth.name, cloth.color, cloth.type, cloth.image, thumb,
                cloth.size || 'M', cloth.brand || '未知', cloth.material || '未知',
                cloth.style || '休闲', cloth.pattern || '纯色', cloth.season || '四季',
                cloth.suitable_temp || '',
                cloth.price || 0.00, cloth.description || '',
                userId
            ]
        );

        const insertedId = result.insertId;
        try {
            await global.db.query(
                `UPDATE clothes SET
                    primary_color_name = ?,
                    primary_color_pct = ?,
                    secondary_color_name = ?,
                    secondary_color_pct = ?,
                    background_color_name = ?,
                    color_palette_json = ?
                 WHERE id = ? AND user_id = ?`,
                [
                    cloth.primary_color_name || null,
                    cloth.primary_color_pct ?? null,
                    cloth.secondary_color_name || null,
                    cloth.secondary_color_pct ?? null,
                    cloth.background_color_name || null,
                    cloth.color_palette_json || null,
                    insertedId,
                    userId
                ]
            );
        } catch (e) {}

        if (Array.isArray(cloth._colorComponents) && cloth._colorComponents.length > 0) {
            try {
                await global.db.query('DELETE FROM clothes_color_components WHERE cloth_id = ?', [insertedId]);
                for (let i = 0; i < Math.min(5, cloth._colorComponents.length); i++) {
                    const c = cloth._colorComponents[i];
                    await global.db.query(
                        `INSERT INTO clothes_color_components (cloth_id, rank, color_name, pct, r, g, b, is_background)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            insertedId,
                            i + 1,
                            c.name,
                            c.pct,
                            c.rgb?.r ?? null,
                            c.rgb?.g ?? null,
                            c.rgb?.b ?? null,
                            0
                        ]
                    );
                }
            } catch (e) {}
        }
        
        const cacheKey = `clothes:${userId}`;
        cache.del(cacheKey);
        console.log('清除衣橱缓存:', cacheKey);
        
        return {
            id: insertedId,
            ...cloth
        };
    } catch (error) {
        console.error('保存衣服数据失败:', error.message);
        throw new Error('保存衣物失败');
    }
}

/**
 * 更新衣服数据
 * @param {number} id - 衣物ID
 * @param {object} updates - 更新数据
 * @param {number} userId - 用户ID（用于验证和清除缓存）
 * @returns {Promise<boolean>} 更新是否成功
 */
async function updateCloth(id, updates, userId) {
    try {
        await global.db.query(
            `UPDATE clothes SET 
            name = ?, color = ?, type = ?, size = ?, brand = ?, material = ?, 
            style = ?, pattern = ?, season = ?, suitable_temp = ?, price = ?, description = ? 
            WHERE id = ? AND user_id = ?`,
            [
                updates.name, updates.color, updates.type, updates.size || 'M',
                updates.brand || '未知', updates.material || '未知', updates.style || '休闲',
                updates.pattern || '纯色', updates.season || '四季', updates.suitable_temp || '',
                updates.price || 0.00, updates.description || '',
                id, userId
            ]
        );
        
        const cacheKey = `clothes:${userId}`;
        cache.del(cacheKey);
        console.log('清除衣橱缓存:', cacheKey);
        
        return true;
    } catch (error) {
        console.error('更新衣服数据失败:', error.message);
        throw new Error('更新衣物失败');
    }
}

/**
 * 删除衣服数据
 * @param {number} id - 衣物ID
 * @param {number} userId - 用户ID（用于验证和清除缓存）
 * @returns {Promise<boolean>} 删除是否成功
 */
async function deleteCloth(id, userId) {
    try {
        console.log(`服务层：尝试删除衣物 ID=${id}, 用户ID=${userId}`);
        
        const [result] = await global.db.query(
            'DELETE FROM clothes WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        
        console.log(`服务层：删除影响行数 ${result.affectedRows}`);
        
        if (result.affectedRows === 0) {
            throw new Error('衣物不存在或无权删除');
        }
        
        const cacheKey = `clothes:${userId}`;
        cache.del(cacheKey);
        console.log('清除衣橱缓存:', cacheKey);
        
        return true;
    } catch (error) {
        console.error('服务层删除衣物失败:', error);
        throw error;
    }
}

module.exports = {
    getClothes,
    getClothById,
    saveCloth,
    updateCloth,
    deleteCloth
};

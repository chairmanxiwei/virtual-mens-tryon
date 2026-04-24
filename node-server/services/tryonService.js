// services/tryonService.js
const fs = require('fs');
const path = require('path');

/**
 * 保存上传的图片到指定目录
 * @param {Object} file - multer 上传的文件对象
 * @returns {Promise<string>} 保存的文件名
 */
async function saveUploadedPhoto(file) {
    // 文件已经由 multer 保存，这里可以返回文件名或执行后续处理
    return file.filename;
}

/**
 * 调用 PIFuHD 或其他服务生成3D模型
 * @param {string} photoFilename - 照片文件名
 * @returns {Promise<string>} 生成的模型文件名cache.js
 */
async function generate3DModel(photoFilename) {
    // 这里可以调用 Python 脚本或其他服务
    // 模拟处理，返回模型文件名
    return `model_${photoFilename}.obj`;
}

/**
 * 根据用户ID获取已生成的模型列表
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function getUserModels(userId) {
    // 从数据库查询该用户的模型记录
    // 示例查询
    try {
        const [rows] = await global.db.query(
            'SELECT * FROM user_models WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    } catch (error) {
        console.error('获取用户模型失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

module.exports = {
    saveUploadedPhoto,
    generate3DModel,
    getUserModels
};
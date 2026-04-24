// services/userService.js
const bcrypt = require('bcryptjs');

/**
 * 根据邮箱查找用户
 * @param {string} email
 * @returns {Promise<object|null>} 用户对象或 null
 */
async function findUserByEmail(email) {
    try {
        const [rows] = await global.db.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
    } catch (error) {
        console.error('查找用户失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

/**
 * 根据用户名查找用户（可选，用于注册时检查用户名唯一性）
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function findUserByUsername(username) {
    try {
        const [rows] = await global.db.query('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0] || null;
    } catch (error) {
        console.error('查找用户失败:', error.message);
        throw new Error('数据库查询失败');
    }
}

/**
 * 验证密码
 * @param {string} plainPassword 明文密码
 * @param {string} hashedPassword 哈希密码
 * @returns {Promise<boolean>}
 */
async function validatePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * 登录验证：根据邮箱查找用户并比对密码
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object|null>} 验证成功返回用户对象（不含密码），否则返回 null
 */
async function authenticateUser(email, password) {
    const user = await findUserByEmail(email);
    if (!user) return null;

    const isValid = await validatePassword(password, user.password);
    if (!isValid) return null;

    // 返回不包含密码的用户信息
    const { password: _, ...safeUser } = user;
    return safeUser;
}

/**
 * 创建新用户
 * @param {object} userData - 包含 username, email, password (已哈希)
 * @returns {Promise<object>} 返回新用户对象（不含密码）
 */
async function createUser(userData) {
    const { username, email, password } = userData;
    try {
        const [result] = await global.db.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, password]
        );
        return { id: result.insertId, username, email };
    } catch (error) {
        console.error('创建用户失败:', error.message);
        throw new Error('创建用户失败');
    }
}

module.exports = {
    findUserByEmail,
    findUserByUsername,   // 如果需要用户名唯一性检查，可以在注册时使用
    validatePassword,
    authenticateUser,
    createUser
};
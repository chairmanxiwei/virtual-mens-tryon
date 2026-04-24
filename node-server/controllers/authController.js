// controllers/authController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const userService = require('../services/userService');
const AUTH_DEBUG = process.env.DEBUG_AUTH === '1';

function createCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getCookieValue(req, name) {
    const raw = (req && req.headers && req.headers.cookie) ? req.headers.cookie : '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

function setCsrfCookie(req, res, token) {
    if (!res || typeof res.cookie !== 'function') {
        return;
    }
    const csrfCookieSameSite = (process.env.CSRF_COOKIE_SAMESITE || process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
    const csrfCookieSecure = csrfCookieSameSite === 'none' ? true : !!(req && req.secure);
    res.cookie('csrfToken', token, {
        httpOnly: false,
        sameSite: csrfCookieSameSite,
        secure: csrfCookieSecure,
        maxAge: 30 * 60 * 1000,
        ...(process.env.CSRF_COOKIE_DOMAIN ? { domain: process.env.CSRF_COOKIE_DOMAIN } : {})
    });
}

function authDebug(...args) {
    if (AUTH_DEBUG) {
        console.log(...args);
    }
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
}

function csrfTokenForRequest(req, res) {
    const token = createCsrfToken();
    req.session.csrfToken = token;
    setCsrfCookie(req, res, token);
    return token;
}

function verifyCsrf(req, token) {
    if (!token) return false;
    const sessionToken = req.session && req.session.csrfToken ? req.session.csrfToken : '';
    const cookieToken = getCookieValue(req, 'csrfToken');
    return safeEqual(token, sessionToken) || safeEqual(token, cookieToken);
}

// 登录页面
exports.getLogin = (req, res) => {
    const token = csrfTokenForRequest(req, res);
    req.session.save((err) => {
        if (err) {
            return res.status(500).send('会话初始化失败');
        }
        res.render('login', {
            title: '商务登录',
            error: null,
            csrfToken: token
        });
    });
};

function setSharedUserCookie(req, res, userId) {
    const sameSite = (process.env.USER_ID_COOKIE_SAMESITE || process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
    const secure = sameSite === 'none' ? true : !!(req && req.secure);
    res.cookie('user_id', String(userId), {
        httpOnly: true,
        sameSite,
        secure,
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
        ...(process.env.USER_ID_COOKIE_DOMAIN ? { domain: process.env.USER_ID_COOKIE_DOMAIN } : {})
    });
}

function clearSharedUserCookie(req, res) {
    const sameSite = (process.env.USER_ID_COOKIE_SAMESITE || process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
    const secure = sameSite === 'none' ? true : !!(req && req.secure);
    res.clearCookie('user_id', {
        sameSite,
        secure,
        path: '/',
        ...(process.env.USER_ID_COOKIE_DOMAIN ? { domain: process.env.USER_ID_COOKIE_DOMAIN } : {})
    });
}

// 登录处理
exports.postLogin = async (req, res) => {
    const { email, password, csrfToken } = req.body;

    // CSRF验证
    if (!verifyCsrf(req, csrfToken)) {
        const token = csrfTokenForRequest(req, res);
        return res.render('login', { 
            title: '商务登录', 
            error: 'CSRF验证失败，请重试',
            csrfToken: token
        });
    }

    try {
        // 调用服务层进行用户认证
        const user = await userService.authenticateUser(email, password);
        if (!user) {
            return res.render('login', { 
                title: '商务登录', 
                error: '邮箱或密码错误，请重试',
                csrfToken: req.session.csrfToken
            });
        }

        // 登录成功，设置会话
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email
        };
        // 刷新CSRF令牌
        const nextToken = csrfTokenForRequest(req, res);

        req.session.save((err) => {
            if (err) {
                console.error('会话保存失败:', err);
                return res.render('login', { 
                    title: '商务登录', 
                    error: '会话保存失败，请重试',
                    csrfToken: nextToken
                });
            }
            // 关键：设置共享 Cookie，让 Python 也能读到
            setSharedUserCookie(req, res, user.id);
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('登录处理错误:', error);
        return res.render('login', { 
            title: '商务登录', 
            error: '服务器内部错误，请稍后重试',
            csrfToken: csrfTokenForRequest(req, res)
        });
    }
};

// 注册页面
exports.getRegister = async (req, res) => {
    try {
        const token = csrfTokenForRequest(req, res);
        authDebug('===== GET /register =====');
        authDebug('生成的csrfToken:', token);
        authDebug('sessionID:', req.sessionID);
        
        // 手动保存 session，确保写入存储
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('session保存错误:', err);
                    reject(err);
                } else {
                    authDebug('session保存成功，token已持久化');
                    resolve();
                }
            });
        });

        // 渲染页面
        res.render('register', {
            title: '用户注册',
            error: null,
            csrfToken: token
        });
    } catch (error) {
        console.error('getRegister 错误:', error);
        res.status(500).send('服务器内部错误');
    }
};

// 注册处理
exports.postRegister = async (req, res) => {
    authDebug('POST /register - sessionID:', req.sessionID);
    const { username, email, password, csrfToken } = req.body;

    // 调试输出
    authDebug('===== 注册调试 =====');
    authDebug('接收到的 csrfToken:', csrfToken);
    authDebug('Session中的 csrfToken:', req.session.csrfToken);
    authDebug('请求体:', req.body);
    authDebug('====================');

    // CSRF验证
    if (!verifyCsrf(req, csrfToken)) {
        const token = csrfTokenForRequest(req, res);
        authDebug('CSRF验证失败:');
        authDebug('  接收到的csrfToken:', csrfToken);
        authDebug('  session中的csrfToken:', req.session.csrfToken);
        authDebug('  完整session对象:', req.session);
        return res.render('register', { 
            title: '用户注册', 
            error: 'CSRF验证失败，请重试',
            csrfToken: token
        });
    }

    try {
        const refreshedToken = csrfTokenForRequest(req, res);
        // 检查邮箱是否已存在（通过服务层）
        const existingUser = await userService.findUserByEmail(email);
        if (existingUser) {
            return res.render('register', { 
                title: '用户注册', 
                error: '该邮箱已被注册',
                csrfToken: refreshedToken
            });
        }

        // 检查用户名是否已存在（可选，这里简单起见只检查邮箱，如果需要可以扩展服务层方法）
        // 可以添加 userService.findUserByUsername(username) 方法

        // 密码加密
        const hashedPassword = await bcrypt.hash(password, 10);

        // 创建新用户（调用服务层）
        const newUser = await userService.createUser({
            username,
            email,
            password: hashedPassword
        });

        // 自动登录
        req.session.user = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email
        };
        csrfTokenForRequest(req, res);

        req.session.save((err) => {
            if (err) {
                return res.render('register', {
                    title: '用户注册',
                    error: '会话保存失败，请重试',
                    csrfToken: csrfTokenForRequest(req, res)
                });
            }
            // 关键：设置共享 Cookie，让 Python 也能读到
            setSharedUserCookie(req, res, newUser.id);
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('注册处理错误:', error);
        return res.render('register', { 
            title: '用户注册', 
            error: '服务器内部错误，请稍后重试',
            csrfToken: csrfTokenForRequest(req, res)
        });
    }
};

// 登出
exports.logout = (req, res) => {
    req.session.destroy();
    // 清除共享 Cookie，确保 Python 后端也无法再读到 user_id
    clearSharedUserCookie(req, res);
    res.redirect('/');
};

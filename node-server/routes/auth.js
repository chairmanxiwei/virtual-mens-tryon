const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 调试日志
router.use((req, res, next) => {
    console.log(`路由请求: ${req.method} ${req.url}`);
    next();
});

// 登录页面
router.get('/', authController.getLogin);

// 注册页面
router.get('/register', authController.getRegister);

// 登录处理
console.log('注册登录处理路由: POST /login');
router.post('/login', (req, res) => {
    console.log('收到登录请求:', req.method, req.url);
    console.log('请求体:', req.body);
    authController.postLogin(req, res);
});

// 注册处理
console.log('注册注册处理路由: POST /register');
router.post('/register', (req, res) => {
    console.log('收到注册请求:', req.method, req.url);
    console.log('请求体:', req.body);
    authController.postRegister(req, res);
});

// 登出
router.get('/logout', authController.logout);

module.exports = router;

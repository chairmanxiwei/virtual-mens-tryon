const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const enhancedClothingRecognition = require('../services/enhanced_clothing_recognition');
const faceDetection = require('../services/face_detection');
const axios = require('axios');
const { spawn } = require('child_process');

const NodeCache = require('node-cache');
// 简单内存缓存，避免频繁请求第三方天气API
const weatherCache = new NodeCache({ stdTTL: 600, checkperiod: process.env.NODE_ENV === 'test' ? 0 : 600, maxKeys: 1000 }); // 10分钟缓存，最多1000条

// Axios Retry
axios.interceptors.response.use(null, async (error) => {
    const config = error.config;
    if (!config || !config.retry) return Promise.reject(error);
    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= config.retry) return Promise.reject(error);
    config.__retryCount += 1;
    const backoff = new Promise((resolve) => setTimeout(resolve, config.retryDelay || 1000));
    await backoff;
    return axios(config);
});

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// 文件过滤函数
const fileFilter = (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图像文件'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024)
    },
    fileFilter: fileFilter
});

// 服装识别接口
router.post('/classify-clothing', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请上传图像文件' });
        }

        // 调用增强服装识别服务
        const result = await enhancedClothingRecognition.recognizeClothing(req.file.path);

        // 清理上传的文件
        fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        // 清理上传的文件
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('清理文件失败:', unlinkError);
            }
        }
        
        console.error('服装识别失败:', error);
        
        // 处理文件上传错误
        if (error.message === '只允许上传图像文件') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: '文件大小超过限制，最大允许5MB'
            });
        }
        
        res.status(500).json({
            success: false,
            error: '服装识别失败'
        });
    }
});

// 人脸检测接口
router.post('/detect-faces', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请上传图像文件' });
        }

        // 调用人脸检测服务
        const result = await faceDetection.detectFaces(req.file.path);

        // 清理上传的文件
        fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        // 清理上传的文件
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('清理文件失败:', unlinkError);
            }
        }
        
        console.error('人脸检测失败:', error);
        
        // 处理文件上传错误
        if (error.message === '只允许上传图像文件') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: '文件大小超过限制，最大允许5MB'
            });
        }
        
        res.status(500).json({
            success: false,
            error: '人脸检测失败'
        });
    }
});

// 3D建模接口
router.post('/create-3d-model', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请上传图像文件' });
        }

        // 首先检测人脸
        const faceResult = await faceDetection.detectFaces(req.file.path);
        
        if (!faceResult.success) {
            // 清理上传的文件
            fs.unlinkSync(req.file.path);
            return res.json(faceResult);
        }

        // 创建3D模型
        const modelResult = await faceDetection.create3DModelFromFace(req.file.path, faceResult.data.landmarks);

        // 清理上传的文件
        fs.unlinkSync(req.file.path);

        res.json(modelResult);
    } catch (error) {
        // 清理上传的文件
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('清理文件失败:', unlinkError);
            }
        }
        
        console.error('3D建模失败:', error);
        
        // 处理文件上传错误
        if (error.message === '只允许上传图像文件') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: '文件大小超过限制，最大允许5MB'
            });
        }
        
        res.status(500).json({
            success: false,
            error: '3D建模失败'
        });
    }
});

// 人脸分析接口
router.post('/analyze-face', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请上传图像文件' });
        }

        // 调用人脸分析服务
        const result = await faceDetection.analyzeFace(req.file.path);

        // 清理上传的文件
        fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        // 清理上传的文件
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('清理文件失败:', unlinkError);
            }
        }
        
        console.error('人脸分析失败:', error);
        
        // 处理文件上传错误
        if (error.message === '只允许上传图像文件') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: '文件大小超过限制，最大允许5MB'
            });
        }
        
        res.status(500).json({
            success: false,
            error: '人脸分析失败'
        });
    }
});

// 服装搭配推荐接口
router.post('/recommend-outfit', async (req, res) => {
    try {
        const { type, color, style } = req.body;

        if (!type || !color) {
            return res.status(400).json({ success: false, error: '请提供服装类型和颜色' });
        }

        // 调用服装搭配推荐服务
        const recommendations = await enhancedClothingRecognition.generateOutfitRecommendations({
            type,
            color,
            style: style || '休闲'
        });

        res.json({
            success: true,
            data: {
                recommendations
            }
        });
    } catch (error) {
        console.error('服装搭配推荐失败:', error);
        res.status(500).json({
            success: false,
            error: '服装搭配推荐失败'
        });
    }
});

// 健康检查接口
router.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                clothingRecognition: 'available',
                faceDetection: 'available',
                threeDModeling: 'available'
            }
        }
    });
});

module.exports = router;
 
// 天气代理接口（Open-Meteo）
router.get('/weather', async (req, res) => {
    try {
        const { lat, lon, unit = 'C' } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ success: false, error: '缺少地理坐标参数' });
        }
        const key = `${lat},${lon}`;
        const cached = weatherCache.get(key);
        if (cached) {
            return res.json({ success: true, data: cached });
        }
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true`;
        const resp = await axios.get(url, { 
            timeout: 3000,
            retry: 3,
            retryDelay: 1000
        });
        const cw = resp.data && resp.data.current_weather ? resp.data.current_weather : null;
        if (!cw) {
            return res.status(502).json({ success: false, error: '天气数据不可用' });
        }
        const tempC = cw.temperature;
        const tempF = Math.round((tempC * 9/5 + 32) * 10) / 10;
        const wind = cw.windspeed;
        const condition = cw.weathercode; // 简化：直接返回代码
        const data = {
            tempC,
            tempF,
            unit: unit === 'F' ? 'F' : 'C',
            wind,
            condition
        };
        weatherCache.set(key, data);
        res.json({ success: true, data });
    } catch (err) {
        console.error('天气获取失败:', err.message);
        res.status(500).json({ success: false, error: '天气接口调用失败' });
    }
});

// 地理编码代理（Nominatim）
router.get('/geocode', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ success: false, error: '缺少查询关键词' });
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
        const resp = await axios.get(url, { timeout: 4000, headers: { 'User-Agent': 'VirtualMenswear/1.0' } });
        res.json({ success: true, data: resp.data || [] });
    } catch (err) {
        console.error('地理编码失败:', err.message);
        res.status(500).json({ success: false, error: '地理编码调用失败' });
    }
});

// 调用Python服装识别系统（外部集成）
router.post('/clothing-recognition-python', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: '请上传图像文件' });
        const py = process.env.PYTHON_PATH || 'python';
        const code = `
import json, sys
from clothing_recognition import ClothingRecognitionSystem
sys.stderr.write("启动Python服装识别\\n")
sys.stdout.flush()
sys.argv
img = sys.argv[1]
sys_inst = ClothingRecognitionSystem()
res = sys_inst.process_image(img)
print(json.dumps({"success": True, "data": res}, ensure_ascii=False))
`;
        const args = ['-c', code, req.file.path];
        const proc = spawn(py, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let errTxt = '';
        const MAX_BUFFER = 5 * 1024 * 1024; // 5MB limit

        proc.stdout.on('data', (buf) => {
            if (out.length < MAX_BUFFER) {
                out += buf.toString();
            } else if (out.length === MAX_BUFFER) {
                out += '...[TRUNCATED]';
            }
        });
        proc.stderr.on('data', (buf) => {
            if (errTxt.length < MAX_BUFFER) {
                errTxt += buf.toString();
            }
        });
        proc.on('error', (err) => {
            console.error('Python process error:', err);
            try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {}
            if (!res.headersSent) {
                 res.status(500).json({ success: false, error: 'Python进程启动失败' });
            }
        });
        proc.on('close', (code) => {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            if (code === 0) {
                try {
                    const parsed = JSON.parse(out);
                    return res.json(parsed);
                } catch (e) {
                    return res.status(500).json({ success: false, error: 'JSON解析失败', raw: out, stderr: errTxt });
                }
            } else {
                return res.status(500).json({ success: false, error: 'Python进程失败', stderr: errTxt });
            }
        });
    } catch (err) {
        try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {}
        res.status(500).json({ success: false, error: '外部系统调用失败' });
    }
});

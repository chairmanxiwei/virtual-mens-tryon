const AIAgentService = require('../services/aiAgentService');
const wardrobeService = require('../services/wardrobeService');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const FormData = require('form-data');

/**
 * AI 搭配推荐控制器
 * 处理 AI 搭配推荐相关的请求
 */
class AIAgentController {
    /**
     * AI 搭配推荐页面
     * @param {Object} req - 请求对象
     * @param {Object} res - 响应对象
     */
    static async getAIAgentPage(req, res) {
        if (!req.session.user) {
            return res.redirect('/');
        }
        
        // 确保 CSRF 令牌存在
        if (!req.session.csrfToken) {
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        }
        
        let clothes = [];
        let healthStatus = false;
        
        try {
            // 获取用户的衣物列表
            clothes = await wardrobeService.getClothes(req.session.user.id);
            
            // 检查 AI 服务健康状态
            try {
                await AIAgentService.healthCheck();
                healthStatus = true;
            } catch (error) {
                console.error('AI 服务健康检查失败:', error.message);
                healthStatus = false;
            }
        } catch (error) {
            console.error('获取数据失败:', error);
            // 错误时保持空数组，不中断渲染
        }
        
        res.render('ai-agent', { 
            title: 'AI 搭配推荐', 
            user: req.session.user,
            clothes: clothes,
            healthStatus: healthStatus,
            csrfToken: req.session.csrfToken,
            amapJsApiKey: process.env.AMAP_JS_API_KEY || ''
        });
    }

    /**
     * 获取 AI 搭配推荐
     * @param {Object} req - 请求对象
     * @param {Object} res - 响应对象
     */
    static async getRecommendations(req, res) {
        if (!req.session.user) {
            return res.status(401).json({ success: false, error: '未授权' });
        }
        
        try {
            const { occasion, style, purpose, scene, temperature, weather } = req.body;
            
            // 获取用户的衣物列表
            const clothes = await wardrobeService.getClothes(req.session.user.id);
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const clothes_list = (clothes || []).map((c) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                color: c.primary_color_name || c.color || '未知',
                style: c.style,
                season: c.season,
                pattern: c.pattern,
                material: c.material,
                image_url: c.image ? (c.image.startsWith('http') ? c.image : `${baseUrl}${c.image}`) : ''
            }));
            
            // 调用 AI 推荐服务
            const recommendations = await AIAgentService.getRecommendations({
                occasion,
                style,
                purpose,
                scene,
                temperature,
                weather,
                clothes_list
            });
            
            res.json({ success: true, data: recommendations });
        } catch (error) {
            console.error('获取 AI 推荐失败:', error);
            res.status(500).json({ success: false, error: error.message || '服务器错误' });
        }
    }

    /**
     * 获取天气信息
     * @param {Object} req - 请求对象
     * @param {Object} res - 响应对象
     */
    static async getWeather(req, res) {
        try {
            const { lat, lon, unit } = req.query;
            
            if (!lat || !lon) {
                return res.status(400).json({ success: false, error: '缺少位置参数' });
            }
            const url = `${req.protocol}://${req.get('host')}/api/ai-service/weather`;
            const resp = await axios.get(url, { params: { lat, lon, unit: unit || 'C' }, timeout: 5000 });
            res.json(resp.data);
        } catch (error) {
            console.error('获取天气信息失败:', error);
            res.status(500).json({ success: false, error: error.message || '服务器错误' });
        }
    }

    static async virtualTryon(req, res) {
        if (!req.session.user) {
            return res.status(401).json({ success: false, error: '未授权' });
        }

        const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('person');
        upload(req, res, async (err) => {
            if (err) return res.status(400).json({ success: false, error: '人物照片上传失败' });
            try {
                const { clothId, garmentType } = req.body || {};
                if (!req.file) return res.status(400).json({ success: false, error: '缺少人物照片' });
                if (!clothId) return res.status(400).json({ success: false, error: '缺少衣物ID' });
                const cloth = await wardrobeService.getClothById(Number(clothId));
                if (!cloth) return res.status(404).json({ success: false, error: '衣物不存在' });

                const agentBase = (process.env.AI_AGENT_API_URL || process.env.AI_BACKEND_BASE_URL || '').replace(/\/+$/, '');

                const uploadToAgent = async (buf, filename, mime) => {
                    const form = new FormData();
                    form.append('file', buf, { filename, contentType: mime || 'application/octet-stream' });
                    const resp = await axios.post(`${agentBase}/api/upload/image`, form, {
                        headers: form.getHeaders(),
                        timeout: 15000,
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        validateStatus: () => true
                    });
                    if (resp.status < 200 || resp.status >= 300 || !resp.data || !resp.data.success) {
                        const msg = resp.data?.detail || resp.data?.message || resp.data?.error || '上传失败';
                        throw new Error(`上传图片到Agent失败：${msg}`);
                    }
                    return resp.data.image_url;
                };

                const personBuf = await sharp(req.file.buffer).jpeg({ quality: 92 }).toBuffer();
                const personUrl = await uploadToAgent(personBuf, 'person.jpg', 'image/jpeg');

                const localPath = path.join(__dirname, '..', 'public', String(cloth.image || '').replace(/^\//, ''));
                if (!fs.existsSync(localPath)) return res.status(400).json({ success: false, error: '衣物图片文件不存在' });
                const clothBuf = fs.readFileSync(localPath);
                const clothUrl = await uploadToAgent(clothBuf, path.basename(localPath), 'image/png');

                const mappedType = garmentType || (String(cloth.type || '').includes('下装') ? 'bottom' : 'top');
                const resp = await AIAgentService.virtualTryon({ person_image_url: personUrl, garment_image_url: clothUrl, garment_type: mappedType });
                res.json({ success: true, data: resp });
            } catch (e) {
                console.error('Agent虚拟试衣失败:', e.message);
                res.status(500).json({ success: false, error: e.message || '试衣失败' });
            }
        });
    }

    /**
     * 健康检查
     * @param {Object} req - 请求对象
     * @param {Object} res - 响应对象
     */
    static async healthCheck(req, res) {
        try {
            const healthStatus = await AIAgentService.healthCheck();
            res.json({ success: true, data: healthStatus });
        } catch (error) {
            console.error('健康检查失败:', error);
            res.status(500).json({ success: false, error: error.message || '服务器错误' });
        }
    }
}

module.exports = AIAgentController;

const outfitService = require('../services/outfitService');
const wardrobeService = require('../services/wardrobeService');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const llmOutfit = require('../services/llmOutfitService');
const path = require('path');
const fs = require('fs');

// AI搭配页面
exports.getAIOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    // 确保CSRF令牌存在
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    
    let clothes = [];
    let outfitSuggestions = [];
    
    try {
        // 获取预设搭配建议
        outfitSuggestions = await outfitService.getAllOutfits();
        // 获取用户的衣物列表
        clothes = await wardrobeService.getClothes(req.session.user.id);
    } catch (error) {
        console.error('获取数据失败:', error);
        // 错误时保持空数组，不中断渲染
    }
    
    const aiApiBase = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const amapJsApiKey = process.env.AMAP_JS_API_KEY || '';

    res.render('ai-outfit', { 
        title: 'AI搭配', 
        user: req.session.user,
        outfitSuggestions: outfitSuggestions,
        clothes: clothes,  // 确保总是有定义（至少是空数组）
        csrfToken: req.session.csrfToken,
        aiApiBase,
        amapJsApiKey
    });
};

// 生成搭配方案（基于场合/风格）
exports.generateOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    const { occasion, style } = req.body;
    let outfitSuggestions = [];
    let clothes = [];
    
    try {
        outfitSuggestions = await outfitService.getOutfitsByOccasion(occasion);
        if (outfitSuggestions.length === 0) {
            outfitSuggestions = await outfitService.getAllOutfits();
        }
        clothes = await wardrobeService.getClothes(req.session.user.id);
    } catch (error) {
        console.error('生成搭配方案失败:', error);
        // 错误时保持空数组
    }
    
    res.render('ai-outfit', { 
        title: 'AI搭配', 
        user: req.session.user,
        outfitSuggestions: outfitSuggestions,
        clothes: clothes,
        selectedOccasion: occasion,
        selectedStyle: style,
        csrfToken: req.session.csrfToken
    });
};

// LLM 生成今日搭配（目的/场景 + 天气 + 衣橱）
exports.llmRecommend = async (req, res) => {
    if (!req.session.user) {
        req.session.user = { id: 1, username: 'admin', email: 'admin@example.com' };
    }
    try {
        const { purpose, scene, lat, lon, unit = 'C' } = req.body || {};
        const userId = req.session.user.id;
        const clothes = await wardrobeService.getClothes(userId);
        let weather = null;
        try {
            const wx = await axios.get(`${req.protocol}://${req.get('host')}/api/ai-service/weather`, { params: { lat, lon, unit }, timeout: 4000 });
            weather = wx.data?.data || null;
        } catch {}
        const rec = await llmOutfit.recommend({ purpose, scene, weather, clothes });
        // 增强“换一批”：简单打乱 sets 顺序
        if (req.body && req.body.refresh) {
            try { rec.sets = (rec.sets || []).sort(() => Math.random() - 0.5); } catch(e){}
        }
        res.json({ success: true, data: rec, clothes });
    } catch (e) {
        console.error('LLM推荐失败:', e.message);
        res.status(500).json({ success: false, error: '生成失败' });
    }
};

// CatVTON 试衣（直接对接 Gradio）
exports.tryonCatvton = async (req, res) => {
    if (!req.session.user) {
        req.session.user = { id: 1, username: 'admin', email: 'admin@example.com' };
    }
    const upload = require('multer')({ storage: require('multer').memoryStorage() }).fields([{ name: 'person', maxCount: 1 }, { name: 'cloth', maxCount: 1 }]);
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, error: '上传失败' });
        try {
            const form = new FormData();
            if (req.files?.person?.[0]) {
                form.append('person', req.files.person[0].buffer, { filename: 'person.jpg', contentType: req.files.person[0].mimetype });
            } else {
                return res.status(400).json({ success: false, error: '缺少人物图' });
            }
            if (req.files?.cloth?.[0]) {
                form.append('cloth', req.files.cloth[0].buffer, { filename: 'cloth.png', contentType: req.files.cloth[0].mimetype });
            } else if (req.body.cloth_id) {
                const clothes = await wardrobeService.getClothById(req.body.cloth_id);
                if (!clothes) return res.status(404).json({ success: false, error: '衣物不存在' });
                const localPath = path.join(__dirname, '..', 'public', clothes.image.replace(/^\//, ''));
                const buf = fs.readFileSync(localPath);
                form.append('cloth', buf, { filename: path.basename(localPath), contentType: 'image/png' });
            } else {
                return res.status(400).json({ success: false, error: '缺少衣物图或ID' });
            }

            const catvtonUrl = (process.env.CATVTON_URL || '').replace(/\/+$/, '');
            if (!catvtonUrl) {
                return res.status(500).json({ success: false, error: '未配置 CATVTON_URL' });
            }
            let resp = null;
            try {
                resp = await axios.post(`${catvtonUrl}/api/predict`, form, {
                    headers: form.getHeaders(),
                    timeout: 15000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    validateStatus: () => true
                });
            } catch {}

            const tryParseResult = (payload) => {
                if (!payload) return null;
                if (typeof payload.url === 'string') return payload.url;
                if (Array.isArray(payload.data)) {
                    const v = payload.data.find(x => typeof x === 'string' || (x && typeof x === 'object'));
                    if (typeof v === 'string') return v;
                    if (v && typeof v === 'object' && typeof v.url === 'string') return v.url;
                }
                if (typeof payload.data === 'string') return payload.data;
                return null;
            };

            let out = resp && resp.status >= 200 && resp.status < 300 ? tryParseResult(resp.data) : null;
            if (!out) {
                const personBuf = req.files.person[0].buffer;
                const clothBuf = req.files?.cloth?.[0]?.buffer;
                const personMime = req.files.person[0].mimetype || 'image/jpeg';
                const clothMime = req.files?.cloth?.[0]?.mimetype || 'image/png';
                const personDataUrl = `data:${personMime};base64,${personBuf.toString('base64')}`;
                const clothDataUrl = clothBuf ? `data:${clothMime};base64,${clothBuf.toString('base64')}` : null;

                const fn = Number(process.env.CATVTON_FN_INDEX || 0);
                const payload = { data: [personDataUrl, clothDataUrl].filter(Boolean), fn_index: fn };
                const j = await axios.post(`${catvtonUrl}/api/predict`, payload, { timeout: 15000, validateStatus: () => true });
                out = j && j.status >= 200 && j.status < 300 ? tryParseResult(j.data) : null;
            }

            if (typeof out === 'string' && out.startsWith('data:')) {
                const outDir = path.join(__dirname, '..', 'public', 'uploads', 'tryon');
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                const outPath = path.join(outDir, `result-${Date.now()}.png`);
                fs.writeFileSync(outPath, Buffer.from(out.split(',')[1] || '', 'base64'));
                return res.json({ success: true, result_url: '/uploads/tryon/' + path.basename(outPath) });
            }

            if (typeof out === 'string' && out.length > 0) {
                if (out.startsWith('http://') || out.startsWith('https://')) {
                    return res.json({ success: true, result_url: out });
                }
                if (out.startsWith('/')) {
                    return res.json({ success: true, result_url: `${catvtonUrl}${out}` });
                }
                if (out.includes('/file=')) {
                    return res.json({ success: true, result_url: `${catvtonUrl}${out.startsWith('/') ? '' : '/'}${out}` });
                }
                return res.json({ success: true, result_url: out });
            }

            return res.status(502).json({ success: false, error: 'CatVTON返回无结果' });
        } catch (e) {
            console.error('CatVTON调用失败:', e.message);
            res.status(500).json({ success: false, error: '试衣生成失败' });
        }
    });
};

// 整套试衣：按顺序依次穿上多件衣物
exports.tryonBatch = async (req, res) => {
    if (!req.session.user) {
        req.session.user = { id: 1, username: 'admin', email: 'admin@example.com' };
    }
    const upload = require('multer')({ storage: require('multer').memoryStorage() }).fields([{ name: 'person', maxCount: 1 }, { name: 'cloth_ids[]', maxCount: 10 }]);
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, error: '上传失败' });
        try {
            const catvtonUrl = (process.env.CATVTON_URL || '').replace(/\/+$/, '');
            if (!catvtonUrl) {
                return res.status(500).json({ success: false, error: '未配置 CATVTON_URL' });
            }
            // 初始人物图
            let currentPerson = req.files?.person?.[0]?.buffer;
            if (!currentPerson) return res.status(400).json({ success: false, error: '缺少人物图' });
            const ids = (req.body['cloth_ids[]'] ? ([]).concat(req.body['cloth_ids[]']) : []).map(x => parseInt(x, 10)).filter(Boolean);
            const userId = req.session.user.id;
            for (const id of ids) {
                const cloth = await wardrobeService.getClothById(id);
                if (!cloth) continue;
                const localPath = path.join(__dirname, '..', 'public', cloth.image.replace(/^\//, ''));
                const buf = fs.readFileSync(localPath);
                // 调用 CatVTON：人物 + 单件衣物
                const form = new FormData();
                form.append('person', currentPerson, { filename: 'person.png', contentType: 'image/png' });
                form.append('cloth', buf, { filename: path.basename(localPath), contentType: 'image/png' });
                let resp = null;
                try {
                    resp = await axios.post(`${catvtonUrl}/api/predict`, form, {
                        headers: form.getHeaders(),
                        timeout: 15000,
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        validateStatus: () => true
                    });
                    const data = resp.data || {};
                    let out = null;
                    if (data && typeof data === 'object') {
                        out = (typeof data.url === 'string' && data.url) || (typeof data.data === 'string' && data.data) || null;
                    }
                    if (out && out.startsWith('data:')) {
                        currentPerson = Buffer.from(out.split(',')[1] || '', 'base64');
                    } else if (out && out.startsWith('/')) {
                        const imgResp = await axios.get(`${catvtonUrl}${out}`, { responseType: 'arraybuffer' });
                        currentPerson = Buffer.from(imgResp.data);
                    } else if (out && (out.startsWith('http://') || out.startsWith('https://'))) {
                        const imgResp = await axios.get(out, { responseType: 'arraybuffer' });
                        currentPerson = Buffer.from(imgResp.data);
                    } else {
                        // fallback：用 JSON base64
                        const personMime = 'image/png';
                        const clothMime = 'image/png';
                        const personDataUrl = `data:${personMime};base64,${currentPerson.toString('base64')}`;
                        const clothDataUrl = `data:${clothMime};base64,${buf.toString('base64')}`;
                        const payload = { data: [personDataUrl, clothDataUrl], fn_index: Number(process.env.CATVTON_FN_INDEX || 0) };
                        const j = await axios.post(`${catvtonUrl}/api/predict`, payload, { timeout: 15000, validateStatus: () => true });
                        const base = j?.data?.data;
                        if (Array.isArray(base)) {
                            const s = base.find(v => typeof v === 'string' && v.startsWith('data:'));
                            if (s) currentPerson = Buffer.from(s.split(',')[1] || '', 'base64');
                        }
                    }
                } catch (e) {
                    // 跳过失败的单件，继续下一件
                    continue;
                }
            }

            const outDir = path.join(__dirname, '..', 'public', 'uploads', 'tryon');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            const outPath = path.join(outDir, `set-${Date.now()}.png`);
            fs.writeFileSync(outPath, currentPerson);
            return res.json({ success: true, result_url: '/uploads/tryon/' + path.basename(outPath) });
        } catch (e) {
            console.error('整套试衣失败:', e.message);
            res.status(500).json({ success: false, error: '整套试衣生成失败' });
        }
    });
};
// 保存搭配建议
exports.saveOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未授权' });
    }
    
    try {
        const outfitData = req.body;
        const savedOutfit = await outfitService.saveOutfitSuggestion(outfitData);
        res.json({ success: true, outfit: savedOutfit });
    } catch (error) {
        console.error('保存搭配建议失败:', error);
        res.status(500).json({ success: false, error: error.message || '服务器错误' });
    }
};

// 更新搭配建议
exports.updateOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未授权' });
    }
    
    try {
        const { id, ...updates } = req.body;
        await outfitService.updateOutfitSuggestion(id, updates);
        res.json({ success: true });
    } catch (error) {
        console.error('更新搭配建议失败:', error);
        res.status(500).json({ success: false, error: error.message || '服务器错误' });
    }
};

// 删除搭配建议
exports.deleteOutfit = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '未授权' });
    }
    
    try {
        const { id } = req.body;
        await outfitService.deleteOutfitSuggestion(id);
        res.json({ success: true });
    } catch (error) {
        console.error('删除搭配建议失败:', error);
        res.status(500).json({ success: false, error: error.message || '服务器错误' });
    }
};

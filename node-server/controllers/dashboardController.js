const fs = require('fs');
const path = require('path');

const HOME_CONTENT_PATH = path.join(__dirname, '../config/home-content.json');

function getDefaultHomeContent() {
    return {
        title: '虚拟男装',
        subtitle: '风格的艺术',
        description: '经典风格与数字艺术的邂逅，为您打造独一无二的虚拟绅士形象。',
        heroImage: '/img/hero-bg.jpg',
        gallery: []
    };
}

exports.getDashboard = (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    let content;
    try {
        content = fs.existsSync(HOME_CONTENT_PATH) ? JSON.parse(fs.readFileSync(HOME_CONTENT_PATH, 'utf8')) : getDefaultHomeContent();
    } catch (error) {
        console.error('读取首页配置失败:', error);
        content = getDefaultHomeContent();
    }
    res.render('dashboard', { title: '商务仪表盘', user: req.session.user, homeContent: content });
};

exports.getHomeEditor = (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    let content;
    try {
        content = fs.existsSync(HOME_CONTENT_PATH) ? JSON.parse(fs.readFileSync(HOME_CONTENT_PATH, 'utf8')) : getDefaultHomeContent();
    } catch (error) {
        console.error('读取首页配置失败:', error);
        content = getDefaultHomeContent();
    }
    res.render('home-edit', { title: '首页配置', user: req.session.user, homeContent: content });
};

exports.saveHomeContent = (req, res) => {
    console.log('========== saveHomeContent ==========');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files.map(f => ({ fieldname: f.fieldname, filename: f.filename })));

    if (!req.session.user) return res.status(401).json({ error: '未登录' });

    try {
        // 读取当前配置
        let currentContent = {};
        if (fs.existsSync(HOME_CONTENT_PATH)) {
            currentContent = JSON.parse(fs.readFileSync(HOME_CONTENT_PATH, 'utf8'));
        }

        // 基础文本字段
        const incomingTitle = typeof req.body.title === 'string' ? req.body.title : undefined;
        const incomingSubtitle = typeof req.body.subtitle === 'string' ? req.body.subtitle : undefined;
        const incomingDescription = typeof req.body.description === 'string' ? req.body.description : undefined;

        const newContent = {
            title: incomingTitle ?? currentContent.title ?? '',
            subtitle: incomingSubtitle ?? currentContent.subtitle ?? '',
            description: incomingDescription ?? currentContent.description ?? ''
        };

        // 处理主图 heroImage
        const heroFile = req.files.find(f => f.fieldname === 'heroImage');
        if (heroFile) {
            // 注意：文件已保存到 public/uploads/home，URL 路径为 /uploads/home/文件名
            newContent.heroImage = '/uploads/home/' + heroFile.filename;
        } else {
            newContent.heroImage = currentContent.heroImage || '/img/hero-bg.jpg';
        }

        // 处理画廊图片：找出所有以 gallery[ 开头的文件
        const galleryFiles = req.files.filter(f => f.fieldname.startsWith('gallery['));
        newContent.gallery = [];

        for (let i = 0; i < 3; i++) {
            const imageKey = `gallery[${i}][image]`;

            const file = galleryFiles.find(f => f.fieldname === imageKey);

            const incomingGalleryTitle =
                typeof req.body?.gallery?.[i]?.title === 'string'
                    ? req.body.gallery[i].title
                    : (typeof req.body[`gallery[${i}][title]`] === 'string' ? req.body[`gallery[${i}][title]`] : undefined);

            const incomingGalleryDescription =
                typeof req.body?.gallery?.[i]?.description === 'string'
                    ? req.body.gallery[i].description
                    : (typeof req.body[`gallery[${i}][description]`] === 'string' ? req.body[`gallery[${i}][description]`] : undefined);

            const galleryItem = {
                id: i + 1,
                title: incomingGalleryTitle ?? (currentContent.gallery?.[i]?.title || ''),
                description: incomingGalleryDescription ?? (currentContent.gallery?.[i]?.description || ''),
                image: file ? '/uploads/home/' + file.filename : (currentContent.gallery?.[i]?.image || '')
            };
            newContent.gallery.push(galleryItem);
        }

        // 写入配置文件
        const configDir = path.dirname(HOME_CONTENT_PATH);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(HOME_CONTENT_PATH, JSON.stringify(newContent, null, 2), { encoding: 'utf8' });
        console.log('配置已保存:', newContent);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: newContent });

    } catch (error) {
        console.error('保存失败:', error);
        res.status(500).json({ error: error.message });
    }
};

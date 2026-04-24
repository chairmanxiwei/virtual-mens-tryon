const fs = require('fs');
const path = require('path');

class ClothingRecognitionService {
    constructor() {
        this.colorDatabase = this.initializeColorDatabase();
        this.clothingTypeDatabase = this.initializeClothingTypeDatabase();
    }

    initializeColorDatabase() {
        return {
            '红色': { rgb: { r: 255, g: 0, b: 0 }, hsl: { h: 0, s: 100, l: 50 }, keywords: ['red', '红色', '红'] },
            '深红色': { rgb: { r: 139, g: 0, b: 0 }, hsl: { h: 0, s: 100, l: 27 }, keywords: ['dark red', '深红', '暗红'] },
            '粉红色': { rgb: { r: 255, g: 192, b: 203 }, hsl: { h: 350, s: 100, l: 88 }, keywords: ['pink', '粉色', '粉'] },
            '橙色': { rgb: { r: 255, g: 165, b: 0 }, hsl: { h: 39, s: 100, l: 50 }, keywords: ['orange', '橙色', '橙'] },
            '黄色': { rgb: { r: 255, g: 255, b: 0 }, hsl: { h: 60, s: 100, l: 50 }, keywords: ['yellow', '黄色', '黄'] },
            '金色': { rgb: { r: 255, g: 215, b: 0 }, hsl: { h: 51, s: 100, l: 50 }, keywords: ['gold', '金色', '金'] },
            '绿色': { rgb: { r: 0, g: 128, b: 0 }, hsl: { h: 120, s: 100, l: 25 }, keywords: ['green', '绿色', '绿'] },
            '浅绿色': { rgb: { r: 144, g: 238, b: 144 }, hsl: { h: 120, s: 73, l: 75 }, keywords: ['light green', '浅绿', '淡绿'] },
            '青色': { rgb: { r: 0, g: 255, b: 255 }, hsl: { h: 180, s: 100, l: 50 }, keywords: ['cyan', '青色', '青'] },
            '蓝色': { rgb: { r: 0, g: 0, b: 255 }, hsl: { h: 240, s: 100, l: 50 }, keywords: ['blue', '蓝色', '蓝'] },
            '深蓝色': { rgb: { r: 0, g: 0, b: 139 }, hsl: { h: 240, s: 100, l: 27 }, keywords: ['dark blue', '深蓝', '藏青', '海军蓝'] },
            '浅蓝色': { rgb: { r: 173, g: 216, b: 230 }, hsl: { h: 195, s: 53, l: 79 }, keywords: ['light blue', '浅蓝', '天蓝'] },
            '紫色': { rgb: { r: 128, g: 0, b: 128 }, hsl: { h: 300, s: 100, l: 25 }, keywords: ['purple', '紫色', '紫'] },
            '紫红色': { rgb: { r: 199, g: 21, b: 133 }, hsl: { h: 330, s: 81, l: 43 }, keywords: ['magenta', '紫红', '洋红'] },
            '棕色': { rgb: { r: 165, g: 42, b: 42 }, hsl: { h: 0, s: 59, l: 41 }, keywords: ['brown', '棕色', '褐', '咖啡色'] },
            '卡其色': { rgb: { r: 195, g: 176, b: 145 }, hsl: { h: 38, s: 28, l: 67 }, keywords: ['khaki', '卡其', '卡其色'] },
            '米色': { rgb: { r: 245, g: 245, b: 220 }, hsl: { h: 60, s: 56, l: 91 }, keywords: ['beige', '米色', '米白'] },
            '白色': { rgb: { r: 255, g: 255, b: 255 }, hsl: { h: 0, s: 0, l: 100 }, keywords: ['white', '白色', '白'] },
            '灰色': { rgb: { r: 128, g: 128, b: 128 }, hsl: { h: 0, s: 0, l: 50 }, keywords: ['gray', 'grey', '灰色', '灰'] },
            '深灰色': { rgb: { r: 64, g: 64, b: 64 }, hsl: { h: 0, s: 0, l: 25 }, keywords: ['dark gray', '深灰', '炭灰'] },
            '浅灰色': { rgb: { r: 211, g: 211, b: 211 }, hsl: { h: 0, s: 0, l: 83 }, keywords: ['light gray', '浅灰', '银灰'] },
            '黑色': { rgb: { r: 0, g: 0, b: 0 }, hsl: { h: 0, s: 0, l: 0 }, keywords: ['black', '黑色', '黑'] },
            '银色': { rgb: { r: 192, g: 192, b: 192 }, hsl: { h: 0, s: 0, l: 75 }, keywords: ['silver', '银色', '银'] }
        };
    }

    initializeClothingTypeDatabase() {
        return {
            '上装': {
                subtypes: ['T恤', '衬衫', '毛衣', '卫衣', '夹克', '西装外套', '大衣', '马甲', '背心'],
                keywords: ['shirt', 't-shirt', 'top', 'tee', 'sweater', 'hoodie', 'jacket', 'coat', 'blazer', 'vest', '上衣', '上装']
            },
            '下装': {
                subtypes: ['牛仔裤', '休闲裤', '西裤', '短裤', '运动裤', '工装裤', '紧身裤'],
                keywords: ['pants', 'trousers', 'jeans', 'shorts', 'bottom', 'pants', '裤', '下装']
            },
            '外套': {
                subtypes: ['风衣', '羽绒服', '棉服', '皮衣', '运动夹克', '西装外套'],
                keywords: ['coat', 'jacket', 'outerwear', 'blazer', '风衣', '外套', '夹克']
            },
            '鞋子': {
                subtypes: ['运动鞋', '皮鞋', '休闲鞋', '靴子', '凉鞋', '拖鞋'],
                keywords: ['shoes', 'sneakers', 'boots', 'footwear', '鞋', '鞋子']
            },
            '配件': {
                subtypes: ['帽子', '围巾', '手套', '腰带', '领带', '袜子', '眼镜'],
                keywords: ['accessory', 'hat', 'scarf', 'belt', 'tie', 'gloves', '配件', '配饰']
            }
        };
    }

    async recognizeClothing(imagePath) {
        try {
            console.log('开始识别服装 (Enhanced)...');
            
            // Call Python Microservice
            const { exec } = require('child_process');
            const pythonScript = path.join(__dirname, '../../services/image_analysis.py');
            
            return new Promise((resolve, reject) => {
                exec(`python "${pythonScript}" "${imagePath}"`, { encoding: 'utf8' }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Python Error:', stderr);
                        // Fallback to old logic if Python fails
                        resolve(this.fallbackRecognition(imagePath));
                        return;
                    }
                    
                    try {
                        const pythonResult = JSON.parse(stdout);
                        if (!pythonResult.success) throw new Error(pythonResult.error);
                        
                        // Map CLIP tags to our format
                        const mappedResult = this.mapPythonResult(pythonResult);
                        resolve({ success: true, data: mappedResult });
                    } catch (e) {
                        console.error('Parse Error:', e);
                        resolve(this.fallbackRecognition(imagePath));
                    }
                });
            });
        } catch (error) {
            console.error('识别流程失败:', error);
            return { success: false, error: error.message };
        }
    }

    mapPythonResult(pythonResult) {
        const tagMap = {
            "formal suit": "外套", "casual t-shirt": "上装", "jeans": "下装",
            "dress shirt": "上装", "sneakers": "鞋子", "leather shoes": "鞋子",
            "jacket": "外套", "coat": "外套", "hoodie": "上装"
        };
        
        const topTag = pythonResult.tags[0].label;
        const type = tagMap[topTag] || "其他";
        
        return {
            type: type,
            color: pythonResult.color,
            style: topTag.includes("formal") || topTag.includes("suit") ? "商务" : "休闲",
            confidence: pythonResult.tags[0].score
        };
    }

    fallbackRecognition(imagePath) {
        // Original logic moved here for fallback
        const imageBuffer = fs.readFileSync(imagePath);
        const dominantColors = this.analyzeImageColors(imageBuffer);
        const type = this.identifyClothingType(imageBuffer, dominantColors);
        return {
            success: true,
            data: {
                type: type,
                color: this.identifyPrimaryColor(dominantColors),
                style: '休闲',
                confidence: 0.5
            }
        };
    }

    analyzeImageColors(imageBuffer) {
        try {
            const colors = [];
            const sampleSize = Math.min(imageBuffer.length, 10000);
            const step = Math.floor(imageBuffer.length / sampleSize);
            
            let rTotal = 0, gTotal = 0, bTotal = 0;
            let pixelCount = 0;
            
            for (let i = 0; i < imageBuffer.length - 2; i += step * 3) {
                if (i + 2 < imageBuffer.length) {
                    const r = imageBuffer[i];
                    const g = imageBuffer[i + 1];
                    const b = imageBuffer[i + 2];
                    
                    rTotal += r;
                    gTotal += g;
                    bTotal += b;
                    pixelCount++;
                }
            }
            
            if (pixelCount > 0) {
                const avgR = Math.round(rTotal / pixelCount);
                const avgG = Math.round(gTotal / pixelCount);
                const avgB = Math.round(bTotal / pixelCount);
                
                colors.push({ r: avgR, g: avgG, b: avgB, percentage: 100 });
            }
            
            const brightness = (colors[0]?.r * 0.299 + colors[0]?.g * 0.587 + colors[0]?.b * 0.114) || 128;
            
            if (brightness > 200) {
                colors.push({ r: 240, g: 240, b: 240, percentage: 30 });
            } else if (brightness < 50) {
                colors.push({ r: 30, g: 30, b: 30, percentage: 30 });
            }
            
            return colors;
        } catch (error) {
            console.error('颜色分析失败:', error);
            return [{ r: 128, g: 128, b: 128, percentage: 100 }];
        }
    }

    identifyPrimaryColor(colors) {
        if (!colors || colors.length === 0) {
            return '灰色';
        }
        
        const primaryColor = colors[0];
        const { r, g, b } = primaryColor;
        
        const hsl = this.rgbToHsl(r, g, b);
        let bestMatch = '灰色';
        let minDistance = Infinity;
        
        for (const [colorName, colorData] of Object.entries(this.colorDatabase)) {
            const distance = this.calculateColorDistance(hsl, colorData.hsl);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = colorName;
            }
        }
        
        return bestMatch;
    }

    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r:
                    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                    break;
                case g:
                    h = ((b - r) / d + 2) / 6;
                    break;
                case b:
                    h = ((r - g) / d + 4) / 6;
                    break;
            }
        }
        
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    calculateColorDistance(hsl1, hsl2) {
        const dh = Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h));
        const ds = Math.abs(hsl1.s - hsl2.s);
        const dl = Math.abs(hsl1.l - hsl2.l);
        
        return Math.sqrt(dh * dh * 0.5 + ds * ds * 0.3 + dl * dl * 0.2);
    }

    identifyClothingType(imageBuffer, colors) {
        const brightness = colors[0] ? (colors[0].r * 0.299 + colors[0].g * 0.587 + colors[0].b * 0.114) : 128;
        const saturation = this.calculateSaturation(colors[0]);
        
        const typeScores = {
            '上装': 0.4,
            '下装': 0.2,
            '外套': 0.15,
            '鞋子': 0.15,
            '配件': 0.1
        };
        
        if (saturation > 60) {
            typeScores['上装'] += 0.2;
        }
        
        if (brightness < 80) {
            typeScores['外套'] += 0.15;
            typeScores['鞋子'] += 0.1;
        }
        
        if (brightness > 180) {
            typeScores['上装'] += 0.15;
            typeScores['下装'] += 0.1;
        }
        
        let bestType = '上装';
        let maxScore = 0;
        
        for (const [type, score] of Object.entries(typeScores)) {
            if (score > maxScore) {
                maxScore = score;
                bestType = type;
            }
        }
        
        return bestType;
    }

    calculateSaturation(color) {
        if (!color) return 50;
        const { r, g, b } = color;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        return max === 0 ? 0 : ((max - min) / max) * 100;
    }

    identifyStyle(colors, type) {
        const brightness = colors[0] ? (colors[0].r * 0.299 + colors[0].g * 0.587 + colors[0].b * 0.114) : 128;
        const saturation = this.calculateSaturation(colors[0]);
        
        if (brightness > 200 && saturation < 30) {
            return '正式';
        } else if (brightness < 100 && saturation < 40) {
            return '正式';
        } else if (saturation > 60) {
            return '时尚';
        } else if (type === '鞋子' && saturation < 40) {
            return '运动';
        } else {
            return '休闲';
        }
    }

    identifyPattern(imageBuffer) {
        const colors = this.analyzeImageColors(imageBuffer);
        
        if (colors.length > 1) {
            const colorVariation = this.calculateColorVariation(colors);
            if (colorVariation > 50) {
                return '印花';
            } else if (colorVariation > 30) {
                return '条纹';
            } else if (colorVariation > 15) {
                return '格子';
            }
        }
        
        return '纯色';
    }

    calculateColorVariation(colors) {
        if (colors.length < 2) return 0;
        
        let totalVariation = 0;
        for (let i = 1; i < colors.length; i++) {
            const variation = Math.abs(colors[i].r - colors[0].r) +
                            Math.abs(colors[i].g - colors[0].g) +
                            Math.abs(colors[i].b - colors[0].b);
            totalVariation += variation;
        }
        
        return totalVariation / (colors.length - 1);
    }

    calculateConfidence(colors, type) {
        const saturation = this.calculateSaturation(colors[0]);
        const brightness = colors[0] ? (colors[0].r * 0.299 + colors[0].g * 0.587 + colors[0].b * 0.114) : 128;
        
        let confidence = 0.7;
        
        if (saturation > 40 && saturation < 80) {
            confidence += 0.1;
        }
        
        if (brightness > 80 && brightness < 220) {
            confidence += 0.1;
        }
        
        if (type === '上装') {
            confidence += 0.05;
        }
        
        return Math.min(confidence, 0.95);
    }

    async generateOutfitRecommendations(clothingInfo) {
        try {
            console.log('生成服装搭配推荐...');
            
            const recommendations = this.generateSmartRecommendations(clothingInfo);
            
            return recommendations;
        } catch (error) {
            console.error('生成搭配推荐失败:', error);
            return [];
        }
    }

    generateSmartRecommendations(clothingInfo) {
        const { type, color, style } = clothingInfo;
        const recommendations = [];
        
        const colorCombinations = this.getColorCombinations(color);
        const typeCombinations = this.getTypeCombinations(type);
        
        colorCombinations.forEach((combo, index) => {
            const recommendation = {
                name: `${combo.name}搭配`,
                items: typeCombinations[index] || typeCombinations[0],
                occasion: this.getOccasion(style, combo.name),
                reason: this.getReason(style, color, combo.name)
            };
            recommendations.push(recommendation);
        });
        
        return recommendations.slice(0, 3);
    }

    getColorCombinations(primaryColor) {
        const combinations = {
            '红色': [
                { name: '经典黑白', colors: ['黑色', '白色'] },
                { name: '温暖大地', colors: ['卡其色', '棕色'] },
                { name: '时尚撞色', colors: ['蓝色', '灰色'] }
            ],
            '蓝色': [
                { name: '商务经典', colors: ['白色', '灰色'] },
                { name: '休闲牛仔', colors: ['深蓝色', '白色'] },
                { name: '优雅米色', colors: ['米色', '白色'] }
            ],
            '绿色': [
                { name: '自然清新', colors: ['白色', '米色'] },
                { name: '大地色调', colors: ['棕色', '卡其色'] },
                { name: '时尚撞色', colors: ['红色', '黑色'] }
            ],
            '黄色': [
                { name: '活力阳光', colors: ['白色', '灰色'] },
                { name: '温暖大地', colors: ['棕色', '卡其色'] },
                { name: '时尚黑白', colors: ['黑色', '白色'] }
            ],
            '黑色': [
                { name: '经典黑白', colors: ['白色', '灰色'] },
                { name: '时尚撞色', colors: ['红色', '蓝色'] },
                { name: '低调优雅', colors: ['深灰色', '深蓝色'] }
            ],
            '白色': [
                { name: '清新简约', colors: ['浅蓝色', '灰色'] },
                { name: '时尚撞色', colors: ['黑色', '红色'] },
                { name: '温暖大地', colors: ['卡其色', '棕色'] }
            ],
            '灰色': [
                { name: '商务经典', colors: ['白色', '黑色'] },
                { name: '低调优雅', colors: ['深蓝色', '黑色'] },
                { name: '时尚撞色', colors: ['红色', '黄色'] }
            ],
            '棕色': [
                { name: '温暖大地', colors: ['米色', '白色'] },
                { name: '经典搭配', colors: ['黑色', '白色'] },
                { name: '自然色调', colors: ['绿色', '卡其色'] }
            ]
        };
        
        return combinations[primaryColor] || [
            { name: '经典搭配', colors: ['黑色', '白色'] },
            { name: '时尚搭配', colors: ['灰色', '白色'] },
            { name: '休闲搭配', colors: ['蓝色', '白色'] }
        ];
    }

    getTypeCombinations(primaryType) {
        const combinations = {
            '上装': [
                ['牛仔裤', '休闲鞋'],
                ['西裤', '皮鞋'],
                ['休闲裤', '运动鞋']
            ],
            '下装': [
                ['衬衫', '皮鞋'],
                ['T恤', '运动鞋'],
                ['卫衣', '休闲鞋']
            ],
            '外套': [
                ['衬衫', '西裤', '皮鞋'],
                ['T恤', '牛仔裤', '运动鞋'],
                ['毛衣', '休闲裤', '休闲鞋']
            ],
            '鞋子': [
                ['休闲裤', 'T恤'],
                ['西裤', '衬衫'],
                ['牛仔裤', '卫衣']
            ],
            '配件': [
                ['T恤', '牛仔裤'],
                ['衬衫', '西裤'],
                ['卫衣', '休闲裤']
            ]
        };
        
        return combinations[primaryType] || [
            ['T恤', '牛仔裤'],
            ['衬衫', '西裤'],
            ['卫衣', '休闲裤']
        ];
    }

    getOccasion(style, comboName) {
        const occasions = {
            '经典黑白': '商务场合、正式活动',
            '温暖大地': '日常休闲、周末聚会',
            '时尚撞色': '派对、时尚活动',
            '商务经典': '工作场合、商务会议',
            '休闲牛仔': '日常出行、休闲时光',
            '优雅米色': '约会、社交场合',
            '自然清新': '户外活动、休闲时光',
            '活力阳光': '运动、户外活动',
            '清新简约': '日常办公、休闲',
            '低调优雅': '正式场合、商务活动'
        };
        
        return occasions[comboName] || '日常休闲';
    }

    getReason(style, color, comboName) {
        const reasons = {
            '经典黑白': `${color}与黑白搭配是永恒的经典，展现专业与品味`,
            '温暖大地': `大地色系与${color}相得益彰，营造温暖舒适的氛围`,
            '时尚撞色': `大胆的撞色搭配让${color}更加出众，彰显个性`,
            '商务经典': `简约的配色适合商务场合，体现专业素养`,
            '休闲牛仔': `牛仔元素增添休闲感，适合日常穿着`,
            '优雅米色': `米色的柔和质感提升整体优雅度`,
            '自然清新': `清新的配色让人感觉轻松自在`,
            '活力阳光': `明亮的搭配充满活力，适合积极向上的场合`,
            '清新简约': `简约而不简单，展现低调的时尚品味`,
            '低调优雅': `内敛的配色体现成熟稳重的气质`
        };
        
        return reasons[comboName] || `精心挑选的搭配，突出${color}的特色`;
    }
}

module.exports = new ClothingRecognitionService();

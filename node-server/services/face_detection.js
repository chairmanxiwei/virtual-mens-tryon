const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 简单的内存缓存实现
class SimpleCache {
    constructor(options = {}) {
        this.cache = {};
        this.stdTTL = options.stdTTL || 3600;
        this.checkperiod = options.checkperiod || 600;
        
        // 定期清理过期缓存
        setInterval(() => this.cleanup(), this.checkperiod * 1000);
    }
    
    get(key) {
        const item = this.cache[key];
        if (item) {
            if (Date.now() - item.timestamp < this.stdTTL * 1000) {
                return item.value;
            } else {
                delete this.cache[key];
            }
        }
        return undefined;
    }
    
    set(key, value) {
        this.cache[key] = {
            value,
            timestamp: Date.now()
        };
        return true;
    }
    
    cleanup() {
        const now = Date.now();
        for (const key in this.cache) {
            if (now - this.cache[key].timestamp >= this.stdTTL * 1000) {
                delete this.cache[key];
            }
        }
    }
}

class FaceDetectionService {
    constructor() {
        this.cache = new SimpleCache({ stdTTL: 3600, checkperiod: 600 });
    }

    async detectFaces(imagePath) {
        try {
            console.log('开始人脸检测...');
            
            // 生成缓存键
            const cacheKey = `face_${this.generateCacheKey(imagePath)}`;
            
            // 检查缓存
            const cachedResult = this.cache.get(cacheKey);
            if (cachedResult) {
                console.log('使用缓存的人脸检测结果');
                return {
                    success: true,
                    data: cachedResult
                };
            }
            
            const imageBuffer = fs.readFileSync(imagePath);
            
            // 预处理图像
            const processedBuffer = await this.preprocessImage(imageBuffer);
            
            // 检测人脸（这里使用简化的方法，实际项目中需要使用更复杂的算法）
            const faceDetections = await this.detectFacesInImage(processedBuffer);
            
            // 提取人脸关键点
            const faceLandmarks = await this.extractFaceLandmarks(processedBuffer, faceDetections);
            
            const result = {
                detections: faceDetections,
                landmarks: faceLandmarks,
                count: faceDetections.length,
                imageSize: {
                    width: 640,
                    height: 480
                }
            };
            
            // 缓存结果
            this.cache.set(cacheKey, result);
            
            console.log('人脸检测结果:', result);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('人脸检测失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async preprocessImage(imageBuffer) {
        try {
            // 简单的图像预处理，实际项目中可以使用更复杂的算法
            // 这里直接返回原始缓冲区
            return imageBuffer;
        } catch (error) {
            console.error('图像预处理失败:', error);
            return imageBuffer;
        }
    }

    async detectFacesInImage(imageBuffer) {
        try {
            // 这里使用简化的方法，实际项目中需要使用更复杂的算法
            // 例如使用 @vladmandic/face-api 或 TensorFlow.js
            
            // 对于演示目的，我们返回一个模拟的人脸检测结果
            const detections = [
                {
                    box: {
                        x: 200,
                        y: 100,
                        width: 150,
                        height: 150
                    },
                    score: 0.95,
                    class: 'face'
                }
            ];
            
            return detections;
        } catch (error) {
            console.error('人脸检测算法失败:', error);
            return [];
        }
    }

    async extractFaceLandmarks(imageBuffer, detections) {
        try {
            // 这里使用简化的方法，实际项目中需要使用更复杂的算法
            
            const landmarks = detections.map((detection, index) => {
                const { x, y, width, height } = detection.box;
                
                // 生成模拟的人脸关键点
                return {
                    id: index,
                    faceBox: detection.box,
                    keypoints: {
                        leftEye: { x: x + width * 0.3, y: y + height * 0.35 },
                        rightEye: { x: x + width * 0.7, y: y + height * 0.35 },
                        nose: { x: x + width * 0.5, y: y + height * 0.55 },
                        leftMouth: { x: x + width * 0.35, y: y + height * 0.75 },
                        rightMouth: { x: x + width * 0.65, y: y + height * 0.75 }
                    }
                };
            });
            
            return landmarks;
        } catch (error) {
            console.error('人脸关键点提取失败:', error);
            return [];
        }
    }

    async create3DModelFromFace(imagePath, faceLandmarks) {
        try {
            console.log('开始创建3D模型...');
            
            // 生成缓存键
            const cacheKey = `3dmodel_${this.generateCacheKey(imagePath)}`;
            
            // 检查缓存
            const cachedResult = this.cache.get(cacheKey);
            if (cachedResult) {
                console.log('使用缓存的3D模型');
                return {
                    success: true,
                    data: cachedResult
                };
            }
            
            // 尝试使用Python版本的PyTorch3D建模服务
            const pythonModelResult = this.createModelWithPython(imagePath);
            
            if (pythonModelResult.success && pythonModelResult.data) {
                console.log('✅ 使用Python PyTorch3D建模结果');
                
                // 生成预览HTML
                const previewHtml = this.generate3DPreview(pythonModelResult.data);
                
                // 保存预览文件
                const previewPath = await this.savePreviewHtml(previewHtml, imagePath);
                
                const result = {
                    modelData: pythonModelResult.data,
                    previewPath: previewPath,
                    previewUrl: `/previews/${path.basename(previewPath)}`,
                    timestamp: Date.now()
                };
                
                // 缓存结果
                this.cache.set(cacheKey, result);
                
                console.log('3D模型创建完成');
                return {
                    success: true,
                    data: result
                };
            } else {
                console.log('⚠️ Python建模失败，使用JavaScript版本');
                
                // 创建3D模型数据
                const modelData = await this.generate3DModel(faceLandmarks);
                
                // 生成预览HTML
                const previewHtml = this.generate3DPreview(modelData);
                
                // 保存预览文件
                const previewPath = await this.savePreviewHtml(previewHtml, imagePath);
                
                const result = {
                    modelData: modelData,
                    previewPath: previewPath,
                    previewUrl: `/previews/${path.basename(previewPath)}`,
                    timestamp: Date.now()
                };
                
                // 缓存结果
                this.cache.set(cacheKey, result);
                
                console.log('3D模型创建完成');
                return {
                    success: true,
                    data: result
                };
            }
        } catch (error) {
            console.error('3D模型创建失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    createModelWithPython(imagePath) {
        try {
            console.log('🐍 开始使用Python PyTorch3D建模...');
            
            // 构建Python脚本路径
            // 注意：services目录在项目根目录下，而不是在nodejs-login-app目录下
            const pythonScript = path.join(__dirname, '..', '..', 'services', 'pytorch3d_modeling.py');
            console.log(`脚本路径: ${pythonScript}`);
            
            // 检查脚本是否存在
            if (!fs.existsSync(pythonScript)) {
                console.error('Python脚本不存在:', pythonScript);
                return { success: false, error: 'Python脚本不存在' };
            }
            
            console.log(`执行Python脚本: ${pythonScript}`, imagePath);
            
            // 执行Python脚本
            const result = spawnSync('python', [pythonScript, imagePath], {
                encoding: 'utf8',
                timeout: 15000
            });
            
            if (result.error) {
                console.error('Python执行错误:', result.error);
                return { success: false, error: result.error.message };
            }
            
            if (result.stderr) {
                console.error('Python stderr:', result.stderr);
            }
            
            console.log(`Python输出: ${result.stdout}`);
            
            // 解析输出
            const parsedResult = JSON.parse(result.stdout);
            return parsedResult;
            
        } catch (error) {
            console.error('Python建模失败:', error);
            return { success: false, error: error.message };
        }
    }

    async generate3DModel(faceLandmarks) {
        try {
            // 这里使用简化的方法，实际项目中需要使用更复杂的算法
            // 例如使用 Three.js 或其他 3D 建模库
            
            const modelData = {
                type: 'human',
                version: '1.0',
                timestamp: Date.now(),
                landmarks: faceLandmarks,
                dimensions: {
                    height: 180, // 厘米
                    weight: 70,  // 公斤
                    shoulderWidth: 45, // 厘米
                    chestWidth: 40,    // 厘米
                    waistWidth: 35,    // 厘米
                    hipWidth: 40       // 厘米
                },
                segments: {
                    head: {
                        type: 'sphere',
                        radius: 10,
                        position: { x: 0, y: 90, z: 0 }
                    },
                    torso: {
                        type: 'cylinder',
                        radiusTop: 15,
                        radiusBottom: 18,
                        height: 50,
                        position: { x: 0, y: 45, z: 0 }
                    },
                    leftArm: {
                        type: 'cylinder',
                        radius: 5,
                        height: 45,
                        position: { x: -20, y: 65, z: 0 },
                        rotation: { z: Math.PI / 6 }
                    },
                    rightArm: {
                        type: 'cylinder',
                        radius: 5,
                        height: 45,
                        position: { x: 20, y: 65, z: 0 },
                        rotation: { z: -Math.PI / 6 }
                    },
                    leftLeg: {
                        type: 'cylinder',
                        radius: 8,
                        height: 65,
                        position: { x: -10, y: -10, z: 0 }
                    },
                    rightLeg: {
                        type: 'cylinder',
                        radius: 8,
                        height: 65,
                        position: { x: 10, y: -10, z: 0 }
                    }
                }
            };
            
            return modelData;
        } catch (error) {
            console.error('3D模型生成失败:', error);
            throw error;
        }
    }

    generate3DPreview(modelData) {
        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D模型预览</title>
    <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background-color: #1e293b;
        }
        #container {
            width: 100vw;
            height: 100vh;
        }
        .controls {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            background-color: rgba(255, 255, 255, 0.9);
            padding: 10px;
            border-radius: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .control-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            background-color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .control-btn:hover {
            background-color: #f0f0f0;
            transform: scale(1.05);
        }
        .control-btn.active {
            background-color: #3b82f6;
            color: white;
        }
        .info {
            position: absolute;
            top: 20px;
            left: 20px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div id="container"></div>
    <div class="info">
        <p>3D人体模型预览</p>
        <p>使用鼠标拖动旋转模型</p>
        <p>使用滚轮缩放模型</p>
    </div>
    <div class="controls">
        <button class="control-btn" onclick="resetView()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 0 1-9 9c-4.97 0-9-4.03-9-9s4.03-9 9-9c2.46 0 4.74 1 6.34 2.66l-2.66 2.66A5.96 5.96 0 0 0 12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h-4z"></path>
            </svg>
        </button>
        <button class="control-btn" onclick="toggleWireframe()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
            </svg>
        </button>
        <button class="control-btn" onclick="toggleAnimation()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        </button>
    </div>
    <script>
        let scene, camera, renderer, controls, model;
        let isWireframe = false;
        let isAnimating = true;
        
        function init() {
            // 场景设置
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e293b);
            
            // 相机设置
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 120, 250);
            camera.lookAt(0, 80, 0);
            
            // 渲染器
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            document.getElementById('container').appendChild(renderer.domElement);
            
            // 控制器
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.enableZoom = true;
            controls.enablePan = true;
            
            // 光源
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(1, 1, 1);
            directionalLight.castShadow = true;
            scene.add(directionalLight);
            
            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
            directionalLight2.position.set(-1, 1, -1);
            scene.add(directionalLight2);
            
            // 创建人体模型
            createHumanModel();
            
            // 动画
            animate();
            
            // 窗口大小调整
            window.addEventListener('resize', onWindowResize);
        }
        
        function createHumanModel() {
            const group = new THREE.Group();
            
            // 头部
            const headGeometry = new THREE.SphereGeometry(18, 32, 32);
            const headMaterial = new THREE.MeshPhongMaterial({ color: 0xf4d0c1 });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 90;
            group.add(head);
            
            // 躯干
            const torsoGeometry = new THREE.CylinderGeometry(22, 28, 50, 32);
            const torsoMaterial = new THREE.MeshPhongMaterial({ color: 0xf4d0c1 });
            const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
            torso.position.y = 45;
            group.add(torso);
            
            // 手臂
            const armGeometry = new THREE.CylinderGeometry(6, 4, 45, 24);
            const armMaterial = new THREE.MeshPhongMaterial({ color: 0xf4d0c1 });
            
            const leftArm = new THREE.Mesh(armGeometry, armMaterial);
            leftArm.position.set(-30, 65, 0);
            leftArm.rotation.z = Math.PI / 6;
            group.add(leftArm);
            
            const rightArm = new THREE.Mesh(armGeometry, armMaterial);
            rightArm.position.set(30, 65, 0);
            rightArm.rotation.z = -Math.PI / 6;
            group.add(rightArm);
            
            // 腿部
            const legGeometry = new THREE.CylinderGeometry(12, 8, 65, 24);
            const legMaterial = new THREE.MeshPhongMaterial({ color: 0x34495e });
            
            const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
            leftLeg.position.set(-12, -10, 0);
            group.add(leftLeg);
            
            const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
            rightLeg.position.set(12, -10, 0);
            group.add(rightLeg);
            
            scene.add(group);
            model = group;
        }
        
        function animate() {
            requestAnimationFrame(animate);
            
            if (controls) {
                controls.update();
            }
            
            if (model && isAnimating) {
                model.rotation.y += 0.005;
            }
            
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }
        
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        
        function resetView() {
            camera.position.set(0, 120, 250);
            camera.lookAt(0, 80, 0);
            controls.reset();
        }
        
        function toggleWireframe() {
            isWireframe = !isWireframe;
            scene.traverse(function(object) {
                if (object instanceof THREE.Mesh) {
                    object.material.wireframe = isWireframe;
                }
            });
        }
        
        function toggleAnimation() {
            isAnimating = !isAnimating;
        }
        
        // 初始化
        init();
    </script>
</body>
</html>
        `;
    }

    async savePreviewHtml(previewHtml, imagePath) {
        try {
            // 创建预览目录
            const previewDir = path.join(__dirname, '../public/previews');
            if (!fs.existsSync(previewDir)) {
                fs.mkdirSync(previewDir, { recursive: true });
            }
            
            // 生成文件名
            const fileName = `preview_${path.basename(imagePath, path.extname(imagePath))}_${Date.now()}.html`;
            const previewPath = path.join(previewDir, fileName);
            
            // 写入文件
            fs.writeFileSync(previewPath, previewHtml);
            
            return previewPath;
        } catch (error) {
            console.error('保存预览文件失败:', error);
            throw error;
        }
    }

    generateCacheKey(imagePath) {
        const stats = fs.statSync(imagePath);
        return `${imagePath}_${stats.mtime.getTime()}_${stats.size}`;
    }

    async analyzeFace(imagePath) {
        try {
            console.log('开始人脸分析...');
            
            // 检测人脸
            const faceResult = await this.detectFaces(imagePath);
            
            if (!faceResult.success) {
                return {
                    success: false,
                    error: faceResult.error
                };
            }
            
            // 分析人脸属性
            const faceAttributes = await this.analyzeFaceAttributes(faceResult.data);
            
            const result = {
                ...faceResult.data,
                attributes: faceAttributes
            };
            
            console.log('人脸分析结果:', result);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('人脸分析失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyzeFaceAttributes(faceData) {
        try {
            // 这里使用简化的方法，实际项目中需要使用更复杂的算法
            
            const attributes = {
                age: Math.floor(Math.random() * 10) + 20, // 20-30岁
                gender: Math.random() > 0.5 ? 'male' : 'female',
                emotion: ['happy', 'neutral', 'sad'][Math.floor(Math.random() * 3)],
                glasses: Math.random() > 0.7,
                beard: Math.random() > 0.6
            };
            
            return attributes;
        } catch (error) {
            console.error('人脸属性分析失败:', error);
            return {};
        }
    }
}

module.exports = new FaceDetectionService();
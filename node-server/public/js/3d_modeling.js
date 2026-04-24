// 3D建模系统 - 使用Three.js实现

class ThreeDModelingSystem {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.animationId = null;
        this.loadingManager = null;
        this.modelLoader = null;
        this.currentModel = null;
        this.loading = false;
        this.modelCache = new Map(); // 模型缓存
        this.textureCache = new Map(); // 纹理缓存
        this.animationCache = new Map(); // 动画缓存
        this.performanceMode = 'balanced'; // 性能模式: low, balanced, high
        this.lastTime = null; // 用于动画时间计算
    }

    // 初始化3D场景
    init() {
        try {
            // 创建加载管理器
            this.setupLoadingManager();

            // 创建场景
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0xf0f0f0);

            // 创建相机
            this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
            this.camera.position.z = 5;

            // 创建渲染器
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // 添加到DOM
            this.container.innerHTML = '';
            this.container.appendChild(this.renderer.domElement);

            // 添加加载指示器
            this.addLoadingIndicator();

            // 添加灯光
            this.addLights();

            // 添加地面
            this.addGround();

            // 创建默认人体模型
            this.createHumanModel();

            // 添加轨道控制器
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;

            // 处理窗口 resize
            window.addEventListener('resize', () => this.onWindowResize());

            // 开始动画
            this.animate();

            console.log('3D建模系统初始化完成');
        } catch (error) {
            console.error('3D系统初始化失败:', error);
            this.showError('3D渲染初始化失败，请刷新页面重试');
        }
    }

    // 设置加载管理器
    setupLoadingManager() {
        this.loadingManager = new THREE.LoadingManager(
            () => {
                // 加载完成
                this.loading = false;
                this.hideLoadingIndicator();
                console.log('模型加载完成');
            },
            (url, itemsLoaded, itemsTotal) => {
                // 加载进度
                const progress = Math.round((itemsLoaded / itemsTotal) * 100);
                this.updateLoadingIndicator(progress);
                console.log(`模型加载进度: ${progress}%`);
            },
            (url, error) => {
                // 加载错误
                this.loading = false;
                this.hideLoadingIndicator();
                console.error('模型加载错误:', error);
                this.showError('模型加载失败，使用默认模型');
                // 使用默认模型作为降级方案
                this.createHumanModel();
            }
        );

        // 初始化模型加载器
        if (THREE.GLTFLoader) {
            this.modelLoader = new THREE.GLTFLoader(this.loadingManager);
        } else if (THREE.OBJLoader) {
            this.modelLoader = new THREE.OBJLoader(this.loadingManager);
        }
    }

    // 添加加载指示器
    addLoadingIndicator() {
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'loading-indicator';
        this.loadingIndicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 1000;
            text-align: center;
        `;
        this.loadingIndicator.innerHTML = '<div>加载3D模型...</div><div class="progress-bar"></div>';
        
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.cssText = `
            width: 100%;
            height: 20px;
            background: rgba(255, 255, 255, 0.2);
            margin-top: 10px;
            border-radius: 10px;
            overflow: hidden;
        `;
        
        this.progressFill = document.createElement('div');
        this.progressFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: #3498db;
            transition: width 0.3s ease;
        `;
        
        progressBar.appendChild(this.progressFill);
        this.loadingIndicator.appendChild(progressBar);
        this.container.style.position = 'relative';
        this.container.appendChild(this.loadingIndicator);
        this.hideLoadingIndicator();
    }

    // 更新加载指示器
    updateLoadingIndicator(progress) {
        if (this.progressFill) {
            this.progressFill.style.width = `${progress}%`;
        }
    }

    // 显示加载指示器
    showLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'block';
        }
    }

    // 隐藏加载指示器
    hideLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'none';
        }
    }

    // 显示错误信息
    showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 0, 0, 0.7);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1000;
            text-align: center;
        `;
        errorElement.textContent = message;
        this.container.appendChild(errorElement);
        
        // 3秒后自动隐藏
        setTimeout(() => {
            errorElement.style.opacity = '0';
            errorElement.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                if (errorElement.parentNode) {
                    errorElement.parentNode.removeChild(errorElement);
                }
            }, 500);
        }, 3000);
    }

    // 添加灯光
    addLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // 方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        this.scene.add(directionalLight);

        // 点光源
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-5, 5, -5);
        this.scene.add(pointLight);
    }

    // 添加地面
    addGround() {
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    // 创建人体模型
    createHumanModel() {
        // 创建组
        this.model = new THREE.Group();

        // 头部
        const headGeometry = new THREE.SphereGeometry(0.5, 32, 32);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        this.model.add(head);

        // 躯干
        const torsoGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
        const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
        const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
        torso.position.y = 0.5;
        torso.castShadow = true;
        this.model.add(torso);

        // 左臂
        const armGeometry = new THREE.BoxGeometry(0.2, 1.0, 0.2);
        const armMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.6, 0.5, 0);
        leftArm.rotation.z = Math.PI / 6;
        leftArm.castShadow = true;
        this.model.add(leftArm);

        // 右臂
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.6, 0.5, 0);
        rightArm.rotation.z = -Math.PI / 6;
        rightArm.castShadow = true;
        this.model.add(rightArm);

        // 左腿
        const legGeometry = new THREE.BoxGeometry(0.25, 1.0, 0.25);
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.2, -1, 0);
        leftLeg.rotation.z = -Math.PI / 12;
        leftLeg.castShadow = true;
        this.model.add(leftLeg);

        // 右腿
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.2, -1, 0);
        rightLeg.rotation.z = Math.PI / 12;
        rightLeg.castShadow = true;
        this.model.add(rightLeg);

        // 添加到场景
        this.scene.add(this.model);
    }

    // 加载真实3D模型
    load3DModel(modelUrl, modelType = 'human') {
        if (!this.modelLoader) {
            console.error('模型加载器未初始化');
            this.showError('模型加载器未就绪');
            return;
        }

        // 检查缓存
        if (this.modelCache.has(modelUrl)) {
            console.log('从缓存加载模型:', modelUrl);
            this.loading = true;
            this.showLoadingIndicator();
            
            // 移除现有的模型
            if (this.currentModel) {
                this.scene.remove(this.currentModel);
                this.currentModel = null;
            }
            
            // 使用缓存的模型
            const cachedModel = this.modelCache.get(modelUrl);
            this.currentModel = cachedModel.clone();
            this.setupLoadedModel(this.currentModel, modelType);
            return;
        }

        this.loading = true;
        this.showLoadingIndicator();

        try {
            // 移除现有的模型
            if (this.currentModel) {
                this.scene.remove(this.currentModel);
                this.currentModel = null;
            }

            // 根据文件类型选择加载方式
            if (modelUrl.endsWith('.gltf') || modelUrl.endsWith('.glb')) {
                this.modelLoader.load(
                    modelUrl,
                    (gltf) => {
                        this.currentModel = gltf.scene;
                        // 缓存模型
                        this.modelCache.set(modelUrl, gltf.scene.clone());
                        // 缓存动画
                        if (gltf.animations && gltf.animations.length > 0) {
                            this.animationCache.set(modelUrl, gltf.animations);
                        }
                        this.setupLoadedModel(this.currentModel, modelType);
                    },
                    (xhr) => {
                        // 加载进度
                        if (xhr.lengthComputable) {
                            const progress = Math.round((xhr.loaded / xhr.total) * 100);
                            this.updateLoadingIndicator(progress);
                            console.log(`模型加载进度: ${progress}%`);
                        }
                    },
                    (error) => {
                        console.error('GLTF模型加载错误:', error);
                        this.loading = false;
                        this.hideLoadingIndicator();
                        this.showError('3D模型加载失败，使用默认模型');
                        this.createHumanModel();
                    }
                );
            } else if (modelUrl.endsWith('.obj')) {
                this.modelLoader.load(
                    modelUrl,
                    (object) => {
                        this.currentModel = object;
                        // 缓存模型
                        this.modelCache.set(modelUrl, object.clone());
                        this.setupLoadedModel(this.currentModel, modelType);
                    },
                    (xhr) => {
                        // 加载进度
                        if (xhr.lengthComputable) {
                            const progress = Math.round((xhr.loaded / xhr.total) * 100);
                            this.updateLoadingIndicator(progress);
                            console.log(`模型加载进度: ${progress}%`);
                        }
                    },
                    (error) => {
                        console.error('OBJ模型加载错误:', error);
                        this.loading = false;
                        this.hideLoadingIndicator();
                        this.showError('3D模型加载失败，使用默认模型');
                        this.createHumanModel();
                    }
                );
            } else {
                console.error('不支持的模型格式');
                this.loading = false;
                this.hideLoadingIndicator();
                this.showError('不支持的模型格式，使用默认模型');
                this.createHumanModel();
            }
        } catch (error) {
            console.error('模型加载异常:', error);
            this.loading = false;
            this.hideLoadingIndicator();
            this.showError('模型加载异常，使用默认模型');
            this.createHumanModel();
        }
    }

    // 设置加载的模型
    setupLoadedModel(model, modelType) {
        try {
            // 缩放和定位模型
            model.scale.set(1, 1, 1);
            model.position.set(0, -1, 0);
            model.rotation.y = Math.PI;

            // 添加阴影
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // 添加到场景
            this.scene.add(model);

            // 调整相机位置以适应模型
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            // 调整相机距离
            const maxSize = Math.max(size.x, size.y, size.z);
            const cameraDistance = maxSize * 2;
            this.camera.position.z = cameraDistance;
            this.camera.lookAt(center);

            this.loading = false;
            this.hideLoadingIndicator();
            console.log('3D模型加载成功:', modelType);
        } catch (error) {
            console.error('模型设置失败:', error);
            this.loading = false;
            this.hideLoadingIndicator();
            this.showError('模型设置失败，使用默认模型');
            this.createHumanModel();
        }
    }

    // 加载服装模型
    loadClothingModel(type, color) {
        try {
            // 移除现有的服装
            const existingClothing = this.model.getObjectByName('clothing');
            if (existingClothing) {
                this.model.remove(existingClothing);
            }

            // 根据类型创建不同的服装模型
            let clothing;
            switch (type) {
                case 'shirt':
                    const shirtGeometry = new THREE.BoxGeometry(0.9, 1.3, 0.45);
                    const shirtMaterial = new THREE.MeshStandardMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.8 
                    });
                    clothing = new THREE.Mesh(shirtGeometry, shirtMaterial);
                    clothing.position.y = 0.5;
                    break;
                
                case 'pants':
                    const pantsGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.4);
                    const pantsMaterial = new THREE.MeshStandardMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.8 
                    });
                    clothing = new THREE.Mesh(pantsGeometry, pantsMaterial);
                    clothing.position.y = -0.6;
                    break;
                
                case 'jacket':
                    const jacketGeometry = new THREE.BoxGeometry(1.0, 1.4, 0.5);
                    const jacketMaterial = new THREE.MeshStandardMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.8 
                    });
                    clothing = new THREE.Mesh(jacketGeometry, jacketMaterial);
                    clothing.position.y = 0.4;
                    break;
                
                default:
                    // 默认创建T恤
                    const defaultGeometry = new THREE.BoxGeometry(0.9, 1.3, 0.45);
                    const defaultMaterial = new THREE.MeshStandardMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.8 
                    });
                    clothing = new THREE.Mesh(defaultGeometry, defaultMaterial);
                    clothing.position.y = 0.5;
            }

            if (clothing) {
                clothing.name = 'clothing';
                clothing.castShadow = true;
                this.model.add(clothing);
                console.log('服装模型加载成功:', type);
            }
        } catch (error) {
            console.error('服装模型加载失败:', error);
            this.showError('服装模型加载失败');
        }
    }

    // 窗口 resize 处理
    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }



    // 停止动画
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    // 重置场景
    reset() {
        this.stop();
        this.init();
    }

    // 设置性能模式
    setPerformanceMode(mode) {
        this.performanceMode = mode;
        this.applyPerformanceSettings();
        console.log(`性能模式设置为: ${mode}`);
    }

    // 应用性能设置
    applyPerformanceSettings() {
        if (!this.renderer) return;
        
        switch (this.performanceMode) {
            case 'low':
                // 低性能模式
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
                this.renderer.shadowMap.enabled = false;
                break;
            case 'balanced':
                // 平衡模式
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                break;
            case 'high':
                // 高性能模式
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                break;
        }
    }

    // 清理缓存
    clearCache() {
        this.modelCache.clear();
        this.textureCache.clear();
        this.animationCache.clear();
        console.log('缓存已清理');
        this.showError('缓存已清理');
    }

    // 优化动画循环
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        const currentTime = performance.now();
        const deltaTime = currentTime - (this.lastTime || currentTime);
        this.lastTime = currentTime;
        
        if (this.controls) {
            this.controls.update();
        }
        
        // 根据性能模式和时间参数调整动画速度
        let rotationSpeed = 0.005;
        switch (this.performanceMode) {
            case 'low':
                rotationSpeed = 0.002;
                break;
            case 'balanced':
                rotationSpeed = 0.005;
                break;
            case 'high':
                rotationSpeed = 0.008;
                break;
        }
        
        // 使用时间参数调整动画速度，确保不同设备上的一致性
        const normalizedRotationSpeed = rotationSpeed * (deltaTime / 16); // 基于60fps的基准时间
        
        // 轻微旋转模型
        if (this.model) {
            this.model.rotation.y += normalizedRotationSpeed;
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    // 从后端数据创建自定义模型
    createCustomModel(modelData) {
        try {
            console.log('开始创建自定义3D模型...');
            
            // 移除现有的模型
            if (this.currentModel) {
                this.scene.remove(this.currentModel);
                this.currentModel = null;
            }
            
            // 检查是否有vertices和faces数据
            if (!modelData.vertices || !modelData.faces) {
                console.error('模型数据缺少vertices或faces');
                this.showError('模型数据不完整');
                return;
            }
            
            console.log(`模型数据: 顶点数=${modelData.vertices.length}, 面数=${modelData.faces.length}`);
            
            // 创建几何体
            const geometry = new THREE.BufferGeometry();
            
            // 设置顶点
            const vertices = new Float32Array(modelData.vertices.flat());
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            
            // 设置面
            const faces = new Uint32Array(modelData.faces.flat());
            geometry.setIndex(new THREE.BufferAttribute(faces, 1));
            
            // 计算法向量
            geometry.computeVertexNormals();
            
            // 创建材质
            const material = new THREE.MeshStandardMaterial({ 
                color: 0x3498db, 
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            });
            
            // 创建网格
            this.currentModel = new THREE.Mesh(geometry, material);
            
            // 添加到场景
            this.scene.add(this.currentModel);
            
            // 调整相机位置
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            const maxSize = Math.max(size.x, size.y, size.z);
            const cameraDistance = maxSize * 2;
            this.camera.position.z = cameraDistance;
            this.camera.lookAt(center);
            
            console.log('自定义3D模型创建成功');
        } catch (error) {
            console.error('创建自定义模型失败:', error);
            this.showError('创建3D模型失败，请重试');
        }
    }

    // 从后端数据创建人体模型
    createHumanModelFromData(modelData) {
        try {
            console.log('开始创建人体模型...');
            
            // 移除现有的模型
            if (this.currentModel) {
                this.scene.remove(this.currentModel);
                this.currentModel = null;
            }
            
            // 检查是否有人体模型数据
            if (!modelData.segments) {
                console.error('模型数据缺少segments');
                this.showError('人体模型数据不完整');
                return;
            }
            
            console.log('人体模型数据:', modelData.segments);
            
            // 创建组
            this.currentModel = new THREE.Group();
            
            // 添加各个部位
            const segments = modelData.segments;
            
            // 头部
            if (segments.head) {
                const headGeometry = new THREE.SphereGeometry(segments.head.radius || 10);
                const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
                const head = new THREE.Mesh(headGeometry, headMaterial);
                head.position.set(
                    segments.head.position?.x || 0,
                    segments.head.position?.y || 90,
                    segments.head.position?.z || 0
                );
                this.currentModel.add(head);
            }
            
            // 躯干
            if (segments.torso) {
                const torsoGeometry = new THREE.CylinderGeometry(
                    segments.torso.radiusTop || 15,
                    segments.torso.radiusBottom || 18,
                    segments.torso.height || 50
                );
                const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
                const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
                torso.position.set(
                    segments.torso.position?.x || 0,
                    segments.torso.position?.y || 45,
                    segments.torso.position?.z || 0
                );
                this.currentModel.add(torso);
            }
            
            // 左臂
            if (segments.leftArm) {
                const armGeometry = new THREE.CylinderGeometry(
                    segments.leftArm.radius || 5,
                    segments.leftArm.radius || 5,
                    segments.leftArm.height || 45
                );
                const armMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
                const leftArm = new THREE.Mesh(armGeometry, armMaterial);
                leftArm.position.set(
                    segments.leftArm.position?.x || -20,
                    segments.leftArm.position?.y || 65,
                    segments.leftArm.position?.z || 0
                );
                if (segments.leftArm.rotation) {
                    leftArm.rotation.z = segments.leftArm.rotation.z || 0;
                }
                this.currentModel.add(leftArm);
            }
            
            // 右臂
            if (segments.rightArm) {
                const armGeometry = new THREE.CylinderGeometry(
                    segments.rightArm.radius || 5,
                    segments.rightArm.radius || 5,
                    segments.rightArm.height || 45
                );
                const armMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
                const rightArm = new THREE.Mesh(armGeometry, armMaterial);
                rightArm.position.set(
                    segments.rightArm.position?.x || 20,
                    segments.rightArm.position?.y || 65,
                    segments.rightArm.position?.z || 0
                );
                if (segments.rightArm.rotation) {
                    rightArm.rotation.z = segments.rightArm.rotation.z || 0;
                }
                this.currentModel.add(rightArm);
            }
            
            // 左腿
            if (segments.leftLeg) {
                const legGeometry = new THREE.CylinderGeometry(
                    segments.leftLeg.radius || 8,
                    segments.leftLeg.radius || 8,
                    segments.leftLeg.height || 65
                );
                const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
                const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
                leftLeg.position.set(
                    segments.leftLeg.position?.x || -10,
                    segments.leftLeg.position?.y || -10,
                    segments.leftLeg.position?.z || 0
                );
                this.currentModel.add(leftLeg);
            }
            
            // 右腿
            if (segments.rightLeg) {
                const legGeometry = new THREE.CylinderGeometry(
                    segments.rightLeg.radius || 8,
                    segments.rightLeg.radius || 8,
                    segments.rightLeg.height || 65
                );
                const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
                const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
                rightLeg.position.set(
                    segments.rightLeg.position?.x || 10,
                    segments.rightLeg.position?.y || -10,
                    segments.rightLeg.position?.z || 0
                );
                this.currentModel.add(rightLeg);
            }
            
            // 添加到场景
            this.scene.add(this.currentModel);
            
            // 调整相机位置
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            const maxSize = Math.max(size.x, size.y, size.z);
            const cameraDistance = maxSize * 1.5;
            this.camera.position.z = cameraDistance;
            this.camera.lookAt(center);
            
            console.log('人体模型创建成功');
        } catch (error) {
            console.error('创建人体模型失败:', error);
            this.showError('创建人体模型失败，请重试');
        }
    }
}

// 初始化3D系统
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('3d-container');
    if (container) {
        window.threeDSystem = new ThreeDModelingSystem('3d-container');
        window.threeDSystem.init();
        
        // 绑定控制按钮
        const shirtButton = document.getElementById('add-shirt');
        if (shirtButton) {
            shirtButton.addEventListener('click', () => {
                window.threeDSystem.loadClothingModel('shirt', 0x3498db);
            });
        }
        
        const pantsButton = document.getElementById('add-pants');
        if (pantsButton) {
            pantsButton.addEventListener('click', () => {
                window.threeDSystem.loadClothingModel('pants', 0x2c3e50);
            });
        }
        
        const jacketButton = document.getElementById('add-jacket');
        if (jacketButton) {
            jacketButton.addEventListener('click', () => {
                window.threeDSystem.loadClothingModel('jacket', 0xe74c3c);
            });
        }
        
        const resetButton = document.getElementById('reset-model');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                window.threeDSystem.reset();
            });
        }
        
        // 绑定3D模型加载按钮
        const loadModelButton = document.getElementById('load-3d-model');
        if (loadModelButton) {
            loadModelButton.addEventListener('click', () => {
                // 示例模型URL，实际应该从后端获取
                const sampleModelUrl = '/models/sample_model.glb';
                window.threeDSystem.load3DModel(sampleModelUrl, 'human');
            });
        }
        
        // 绑定性能模式控制按钮
        const performanceLowButton = document.getElementById('performance-low');
        if (performanceLowButton) {
            performanceLowButton.addEventListener('click', () => {
                window.threeDSystem.setPerformanceMode('low');
            });
        }
        
        const performanceBalancedButton = document.getElementById('performance-balanced');
        if (performanceBalancedButton) {
            performanceBalancedButton.addEventListener('click', () => {
                window.threeDSystem.setPerformanceMode('balanced');
            });
        }
        
        const performanceHighButton = document.getElementById('performance-high');
        if (performanceHighButton) {
            performanceHighButton.addEventListener('click', () => {
                window.threeDSystem.setPerformanceMode('high');
            });
        }
        
        // 绑定缓存清理按钮
        const clearCacheButton = document.getElementById('clear-cache');
        if (clearCacheButton) {
            clearCacheButton.addEventListener('click', () => {
                window.threeDSystem.clearCache();
            });
        }
    }
});

// 从后端加载3D模型
async function loadModelFromBackend(imageFile) {
    try {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        const response = await fetch('/api/ai-service/create-3d-model', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('模型创建失败');
        }
        
        const result = await response.json();
        
        if (result.success) {
            const modelData = result.data;
            
            // 显示模型信息
            console.log('3D模型创建成功:', modelData);
            
            // 如果有预览URL，加载预览
            if (modelData.previewUrl) {
                console.log('预览URL:', modelData.previewUrl);
                // 可以在这里打开预览页面
                // window.open(modelData.previewUrl, '_blank');
            }
            
            // 如果有模型数据，使用Three.js加载
            if (modelData.modelData) {
                console.log('模型数据:', modelData.modelData);
                
                // 尝试创建3D对象
                if (window.threeDSystem) {
                    // 检查是否有vertices和faces数据（来自PyTorch3D）
                    if (modelData.modelData.vertices && modelData.modelData.faces) {
                        console.log('创建自定义3D模型...');
                        window.threeDSystem.createCustomModel(modelData.modelData);
                    } 
                    // 检查是否有人体模型数据
                    else if (modelData.modelData.segments) {
                        console.log('创建人体模型...');
                        window.threeDSystem.createHumanModelFromData(modelData.modelData);
                    }
                }
            }
            
            return result;
        } else {
            throw new Error(result.error || '模型创建失败');
        }
    } catch (error) {
        console.error('从后端加载模型失败:', error);
        if (window.threeDSystem) {
            window.threeDSystem.showError('3D模型创建失败，请重试');
        }
        return { success: false, error: error.message };
    }
}
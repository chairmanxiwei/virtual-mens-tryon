// Three.js 性能管理器
import * as THREE from './lib/three.module.js';
import { THREE_OPTIMIZATION_CONFIG, MEMORY_MANAGEMENT_CONFIG, TEXTURE_COMPRESSION_CONFIG, LOD_CONFIG } from './three-optimization-config.js';

class ThreePerformanceManager {
    constructor() {
        this.stats = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            drawCalls: 0,
            triangles: 0
        };
        
        this.config = THREE_OPTIMIZATION_CONFIG;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.isMonitoring = false;
        
        // 资源管理
        this.resources = {
            textures: new Map(),
            geometries: new Map(),
            materials: new Map()
        };
        
        // 自动清理定时器
        this.cleanupTimer = null;
        this.initAutoCleanup();
    }
    
    // 初始化自动清理
    initAutoCleanup() {
        if (this.config.performance.autoCleanup && this.config.memory.autoCleanup) {
            this.cleanupTimer = setInterval(() => {
                this.cleanupUnusedResources();
            }, MEMORY_MANAGEMENT_CONFIG.cleanupInterval);
        }
    }
    
    // 创建优化后的渲染器
    createOptimizedRenderer(container) {
        const renderer = new THREE.WebGLRenderer({
            ...this.config.renderer,
            canvas: container
        });
        
        // 设置像素比例
        const pixelRatio = Math.min(window.devicePixelRatio, 2); // 限制最大像素比例为2
        renderer.setPixelRatio(pixelRatio);
        
        // 启用阴影
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = this.config.lights.shadowType;
        
        // 设置输出编码
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        
        return renderer;
    }
    
    // 创建优化后的场景
    createOptimizedScene() {
        const scene = new THREE.Scene();
        
        // 应用场景配置
        scene.autoUpdate = this.config.scene.autoUpdate;
        scene.matrixAutoUpdate = this.config.scene.matrixAutoUpdate;
        
        return scene;
    }
    
    // 创建优化后的相机
    createOptimizedCamera(aspect) {
        const camera = new THREE.PerspectiveCamera(
            this.config.camera.fov,
            aspect,
            this.config.camera.near,
            this.config.camera.far
        );
        
        return camera;
    }
    
    // 加载优化纹理
    async loadOptimizedTexture(url, options = {}) {
        const config = { ...TEXTURE_COMPRESSION_CONFIG, ...options };
        
        try {
            // 检查缓存
            if (this.resources.textures.has(url)) {
                return this.resources.textures.get(url);
            }
            
            // 加载纹理
            const texture = await new Promise((resolve, reject) => {
                const loader = new THREE.TextureLoader();
                loader.load(
                    url,
                    (texture) => resolve(texture),
                    undefined,
                    (error) => reject(error)
                );
            });
            
            // 应用优化设置
            this.optimizeTexture(texture, config);
            
            // 缓存纹理
            this.resources.textures.set(url, texture);
            
            return texture;
        } catch (error) {
            console.error('纹理加载失败:', error);
            return this.createFallbackTexture();
        }
    }
    
    // 优化纹理
    optimizeTexture(texture, config) {
        // 限制纹理大小
        if (config.maxTextureSize) {
            texture.image = this.resizeImage(texture.image, config.maxTextureSize);
        }
        
        // 生成mipmap
        if (config.generateMipmaps) {
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
        }
        
        // 设置各向异性过滤
        const maxAnisotropy = texture.anisotropy || 1;
        texture.anisotropy = Math.min(maxAnisotropy, this.config.model.anisotropy);
        
        // 设置包装模式
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
    }
    
    // 创建LOD系统
    createLODSystem(objects) {
        if (!LOD_CONFIG.autoLOD) return objects;
        
        return objects.map(obj => {
            const lod = new THREE.LOD();
            
            LOD_CONFIG.levels.forEach(level => {
                const simplifiedObj = this.simplifyObject(obj, level.complexity);
                lod.addLevel(simplifiedObj, level.distance);
            });
            
            return lod;
        });
    }
    
    // 简化对象
    simplifyObject(object, complexity) {
        const simplified = object.clone();
        
        // 根据复杂度简化几何体
        if (simplified.geometry) {
            const originalVertices = simplified.geometry.attributes.position.count;
            const targetVertices = Math.floor(originalVertices * complexity);
            
            // 这里可以实现更复杂的简化算法
            // 目前使用简单的顶点采样
            if (targetVertices < originalVertices) {
                this.simplifyGeometry(simplified.geometry, targetVertices);
            }
        }
        
        return simplified;
    }
    
    // 简化几何体
    simplifyGeometry(geometry, targetVertexCount) {
        const positions = geometry.attributes.position.array;
        const currentVertexCount = positions.length / 3;
        
        if (currentVertexCount <= targetVertexCount) return;
        
        const step = Math.ceil(currentVertexCount / targetVertexCount);
        const newPositions = [];
        
        for (let i = 0; i < positions.length; i += step * 3) {
            newPositions.push(positions[i], positions[i + 1], positions[i + 2]);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
        geometry.computeVertexNormals();
    }
    
    // 性能监控
    startMonitoring() {
        this.isMonitoring = true;
        this.monitorFrame();
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
    }
    
    monitorFrame() {
        if (!this.isMonitoring) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        
        this.frameCount++;
        
        // 每秒更新一次统计
        if (this.frameCount % 60 === 0) {
            this.stats.fps = Math.round(1000 / deltaTime);
            this.stats.frameTime = deltaTime;
            
            // 获取内存使用（如果可用）
            if (performance.memory) {
                this.stats.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            }
            
            this.updateStatsDisplay();
        }
        
        this.lastTime = currentTime;
        
        requestAnimationFrame(() => this.monitorFrame());
    }
    
    // 更新统计显示
    updateStatsDisplay() {
        if (!this.config.performance.statsDisplay) return;
        
        let statsElement = document.getElementById('three-stats');
        if (!statsElement) {
            statsElement = document.createElement('div');
            statsElement.id = 'three-stats';
            statsElement.style.cssText = `
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0,0,0,0.8);
                color: #00ff00;
                font-family: monospace;
                font-size: 12px;
                padding: 10px;
                border-radius: 5px;
                z-index: 10000;
            `;
            document.body.appendChild(statsElement);
        }
        
        statsElement.innerHTML = `
            FPS: ${this.stats.fps}<br>
            Frame Time: ${this.stats.frameTime.toFixed(2)}ms<br>
            Memory: ${this.stats.memoryUsage}MB<br>
            Draw Calls: ${this.stats.drawCalls}<br>
            Triangles: ${this.stats.triangles}
        `;
    }
    
    // 清理未使用资源
    cleanupUnusedResources() {
        const now = Date.now();
        
        // 清理纹理
        this.resources.textures.forEach((texture, key) => {
            if (texture.userData.lastUsed && (now - texture.userData.lastUsed) > 60000) {
                texture.dispose();
                this.resources.textures.delete(key);
            }
        });
        
        // 清理几何体
        this.resources.geometries.forEach((geometry, key) => {
            if (geometry.userData.lastUsed && (now - geometry.userData.lastUsed) > 60000) {
                geometry.dispose();
                this.resources.geometries.delete(key);
            }
        });
        
        // 清理材质
        this.resources.materials.forEach((material, key) => {
            if (material.userData.lastUsed && (now - material.userData.lastUsed) > 60000) {
                material.dispose();
                this.resources.materials.delete(key);
            }
        });
    }
    
    // 销毁
    dispose() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.stopMonitoring();
        
        // 清理所有资源
        this.resources.textures.forEach(texture => texture.dispose());
        this.resources.geometries.forEach(geometry => geometry.dispose());
        this.resources.materials.forEach(material => material.dispose());
        
        this.resources.textures.clear();
        this.resources.geometries.clear();
        this.resources.materials.clear();
    }
}

// 创建全局性能管理器实例
let performanceManager = null;

function getPerformanceManager() {
    if (!performanceManager) {
        performanceManager = new ThreePerformanceManager();
    }
    return performanceManager;
}

// 导出
export {
    ThreePerformanceManager,
    getPerformanceManager
};
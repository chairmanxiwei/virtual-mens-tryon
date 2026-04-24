// 性能测试和监控脚本
class PerformanceTester {
    constructor() {
        this.results = {
            loadTime: 0,
            renderTime: 0,
            memoryUsage: 0,
            fps: 0,
            resourceCount: 0
        };
        this.startTime = 0;
        this.frameCount = 0;
        this.lastFrameTime = 0;
    }
    
    // 测试页面加载性能
    testPageLoad() {
        this.startTime = performance.now();
        
        window.addEventListener('load', () => {
            this.results.loadTime = performance.now() - this.startTime;
            console.log(`页面加载时间: ${this.results.loadTime.toFixed(2)}ms`);
            this.displayResults();
        });
    }
    
    // 测试Three.js场景渲染性能
    testThreeJSPerformance() {
        if (typeof THREE === 'undefined') {
            console.warn('Three.js 未加载，跳过3D性能测试');
            return;
        }
        
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // 创建测试场景
        this.createTestScene(scene);
        
        // 测试渲染性能
        this.startTime = performance.now();
        this.frameCount = 0;
        
        const animate = () => {
            this.frameCount++;
            renderer.render(scene, camera);
            
            if (this.frameCount >= 100) { // 测试100帧
                this.results.renderTime = (performance.now() - this.startTime) / 100;
                this.results.fps = 1000 / this.results.renderTime;
                console.log(`平均渲染时间: ${this.results.renderTime.toFixed(2)}ms`);
                console.log(`平均FPS: ${this.results.fps.toFixed(2)}`);
                
                // 清理资源
                renderer.dispose();
                this.displayResults();
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    // 创建测试场景
    createTestScene(scene) {
        // 添加多个几何体进行性能测试
        for (let i = 0; i < 50; i++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshPhongMaterial({ color: Math.random() * 0xffffff });
            const cube = new THREE.Mesh(geometry, material);
            
            cube.position.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );
            
            scene.add(cube);
        }
        
        // 添加光源
        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
    }
    
    // 测试内存使用
    testMemoryUsage() {
        if (performance.memory) {
            this.results.memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024;
            console.log(`内存使用: ${this.results.memoryUsage.toFixed(2)}MB`);
        } else {
            console.warn('浏览器不支持内存监控');
        }
    }
    
    // 测试资源加载性能
    testResourceLoading() {
        const resources = [
            '/css/renaissance-style.css',
            '/js/artistic-animations.js',
            '/js/three-optimization-config.js',
            '/js/three-performance-manager.js',
            '/js/lib/three.module.js'
        ];
        
        let loadedCount = 0;
        const startTime = performance.now();
        
        resources.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = url;
            link.as = url.endsWith('.css') ? 'style' : 'script';
            
            link.onload = () => {
                loadedCount++;
                if (loadedCount === resources.length) {
                    const loadTime = performance.now() - startTime;
                    console.log(`资源加载时间: ${loadTime.toFixed(2)}ms`);
                    this.results.resourceCount = resources.length;
                }
            };
            
            link.onerror = () => {
                console.warn(`资源加载失败: ${url}`);
            };
            
            document.head.appendChild(link);
        });
    }
    
    // 运行所有测试
    runAllTests() {
        console.log('=== 开始性能测试 ===');
        
        this.testPageLoad();
        this.testMemoryUsage();
        this.testResourceLoading();
        
        // 延迟执行Three.js测试，确保Three.js已加载
        setTimeout(() => {
            this.testThreeJSPerformance();
        }, 2000);
        
        console.log('=== 性能测试完成 ===');
    }
    
    // 显示测试结果
    displayResults() {
        const resultsDiv = document.createElement('div');
        resultsDiv.id = 'performance-results';
        resultsDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #00ff00;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
        `;
        
        resultsDiv.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #00ff00; font-size: 14px;">性能测试结果</h3>
            <div style="margin-bottom: 8px;">页面加载: ${this.results.loadTime.toFixed(2)}ms</div>
            <div style="margin-bottom: 8px;">渲染时间: ${this.results.renderTime.toFixed(2)}ms</div>
            <div style="margin-bottom: 8px;">内存使用: ${this.results.memoryUsage.toFixed(2)}MB</div>
            <div style="margin-bottom: 8px;">平均FPS: ${this.results.fps.toFixed(2)}</div>
            <div style="margin-bottom: 8px;">资源数量: ${this.results.resourceCount}</div>
            <button onclick="document.getElementById('performance-results').remove()" 
                    style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 10px;">
                关闭
            </button>
        `;
        
        document.body.appendChild(resultsDiv);
    }
    
    // 性能优化建议
    getOptimizationSuggestions() {
        const suggestions = [];
        
        if (this.results.loadTime > 3000) {
            suggestions.push('页面加载时间较长，建议优化资源大小和数量');
        }
        
        if (this.results.renderTime > 16) {
            suggestions.push('渲染性能较低，建议减少场景复杂度或启用LOD');
        }
        
        if (this.results.memoryUsage > 100) {
            suggestions.push('内存使用较高，建议清理未使用资源');
        }
        
        if (this.results.fps < 30) {
            suggestions.push('帧率较低，建议优化渲染设置或减少模型复杂度');
        }
        
        return suggestions;
    }
}

// 创建全局性能测试器
let performanceTester = null;

function initPerformanceTesting() {
    if (!performanceTester) {
        performanceTester = new PerformanceTester();
    }
    return performanceTester;
}

// 页面加载完成后自动开始测试
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            const tester = initPerformanceTesting();
            tester.runAllTests();
        }, 1000);
    });
} else {
    setTimeout(() => {
        const tester = initPerformanceTesting();
        tester.runAllTests();
    }, 1000);
}

// 导出供外部使用
export {
    PerformanceTester,
    initPerformanceTesting
};
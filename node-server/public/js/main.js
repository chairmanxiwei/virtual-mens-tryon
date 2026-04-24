// 通用功能模块

// 404页面返回首页按钮
function setup404Handlers() {
    const backHomeBtn = document.getElementById('back-home-btn');
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
}

// 初始化所有通用功能
function initMain() {
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setup404Handlers();
        });
    } else {
        setup404Handlers();
    }
}

// 性能管理器（用于3D渲染等性能密集型操作）
function getPerformanceManager() {
    return {
        isMonitoring: false,
        
        // 创建优化的场景
        createOptimizedScene() {
            const scene = new THREE.Scene();
            // 可以在这里添加场景优化配置
            return scene;
        },
        
        // 创建优化的相机
        createOptimizedCamera(aspect) {
            const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
            // 可以在这里添加相机优化配置
            return camera;
        },
        
        // 创建优化的渲染器
        createOptimizedRenderer() {
            const renderer = new THREE.WebGLRenderer({ 
                antialias: true,
                alpha: true
            });
            // 可以在这里添加渲染器优化配置
            renderer.setPixelRatio(window.devicePixelRatio);
            return renderer;
        },
        
        // 开始性能监控
        startMonitoring() {
            this.isMonitoring = true;
            // 可以在这里添加性能监控逻辑
        },
        
        // 停止性能监控
        stopMonitoring() {
            this.isMonitoring = false;
            // 可以在这里添加性能监控停止逻辑
        }
    };
}

// 启动初始化
initMain();
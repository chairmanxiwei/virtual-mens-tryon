// 3D建模技术配置文件

module.exports = {
    // Blender配置
    blender: {
        enabled: true,
        path: "blender", // 可执行文件路径
        version: "4.0", // 推荐版本
        scripts_dir: "scripts/blender",
        render_engine: "CYCLES" // CYCLES或EEVEE
    },
    
    // Three.js配置
    threejs: {
        enabled: true,
        version: "0.160.0", // 最新版本
        use_cdn: true,
        cdn_url: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js",
        performance: {
            enabled: true,
            antialias: true,
            alpha: true,
            logarithmicDepthBuffer: true
        }
    },
    
    // MediaPipe配置
    mediapipe: {
        enabled: true,
        models: {
            pose: true,
            hands: true,
            face: true
        },
        performance: {
            selfieMode: false,
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: true,
            smoothSegmentation: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        }
    },
    
    // 3D模型配置
    models: {
        human: {
            enabled: true,
            quality: "high", // low, medium, high
            texture: "pbr",
            lod: 3 // 细节级别
        },
        clothing: {
            enabled: true,
            quality: "high",
            physics: true,
            collision: true
        }
    },
    
    // 渲染配置
    rendering: {
        resolution: {
            width: 1920,
            height: 1080
        },
        quality: "high",
        shadows: true,
        lighting: "pbr",
        post_processing: true
    },
    
    // 性能优化
    optimization: {
        enabled: true,
        lod: true,
        caching: true,
        compression: true,
        web_worker: true
    },
    
    // 存储配置
    storage: {
        models_dir: "models/3d",
        textures_dir: "models/textures",
        cache_dir: "cache/3d",
        max_cache_size: 512 // MB
    },
    
    // API配置
    api: {
        enabled: true,
        port: 3000,
        cors: true,
        rate_limit: {
            enabled: true,
            windowMs: 15 * 60 * 1000, // 15分钟
            max: 100 // 限制
        }
    }
};
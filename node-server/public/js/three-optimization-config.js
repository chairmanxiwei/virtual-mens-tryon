// Three.js 性能优化配置
const THREE_OPTIMIZATION_CONFIG = {
    // 渲染器配置
    renderer: {
        antialias: true, // 开启抗锯齿
        alpha: true, // 透明背景
        powerPreference: 'high-performance', // 优先使用高性能GPU
        stencil: false, // 禁用模板缓冲（如果不使用）
        depth: true, // 启用深度缓冲
        logarithmicDepthBuffer: false // 禁用对数深度缓冲（除非需要）
    },
    
    // 场景配置
    scene: {
        autoUpdate: false, // 手动控制更新
        matrixAutoUpdate: false, // 手动控制矩阵更新
        frustumCulled: true // 启用视锥体剔除
    },
    
    // 相机配置
    camera: {
        near: 0.1,
        far: 1000, // 根据场景大小调整，不要过大
        fov: 45 // 合理设置视野角度
    },
    
    // 光照配置
    lights: {
        maxLights: 4, // 限制光源数量
        shadowMapSize: 1024, // 阴影贴图大小
        shadowType: 1 // PCFSoftShadowMap
    },
    
    // 模型配置
    model: {
        maxTextureSize: 1024, // 限制纹理大小
        textureFormat: 'image/jpeg', // 优先使用压缩纹理格式
        generateMipmaps: true, // 生成mipmap
        anisotropy: 4 // 各向异性过滤级别
    },
    
    // 性能监控
    performance: {
        maxFPS: 60, // 限制最大帧率
        adaptiveQuality: true, // 自适应质量
        statsDisplay: true // 显示性能统计
    }
};

// Draco 压缩配置
const DRACO_CONFIG = {
    decoderPath: '/js/lib/draco/', // Draco解码器路径
    decoderConfig: {
        type: 'js', // 使用JavaScript解码器
        path: '/js/lib/draco/draco_decoder.js'
    }
};

// LOD (Level of Detail) 配置
const LOD_CONFIG = {
    levels: [
        { distance: 0, complexity: 1.0 },    // 近距离：完整细节
        { distance: 10, complexity: 0.8 },   // 中距离：80%细节
        { distance: 20, complexity: 0.5 },   // 远距离：50%细节
        { distance: 50, complexity: 0.2 }    // 远距离：20%细节
    ],
    autoLOD: true // 自动LOD切换
};

// 纹理压缩配置
const TEXTURE_COMPRESSION_CONFIG = {
    enabled: true,
    formats: {
        'image/jpeg': { quality: 0.8 },
        'image/webp': { quality: 0.7 },
        'image/png': { compressionLevel: 6 }
    },
    maxTextureSize: 1024,
    generateMipmaps: true
};

// 内存管理配置
const MEMORY_MANAGEMENT_CONFIG = {
    maxCacheSize: 50, // 最大缓存数量（MB）
    textureCacheSize: 20, // 纹理缓存大小（MB）
    geometryCacheSize: 15, // 几何体缓存大小（MB）
    materialCacheSize: 10, // 材质缓存大小（MB）
    autoCleanup: true, // 自动清理未使用资源
    cleanupInterval: 30000 // 清理间隔（毫秒）
};

// 导出配置
export {
    THREE_OPTIMIZATION_CONFIG,
    DRACO_CONFIG,
    LOD_CONFIG,
    TEXTURE_COMPRESSION_CONFIG,
    MEMORY_MANAGEMENT_CONFIG
};
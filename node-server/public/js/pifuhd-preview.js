// 全局变量
let scene, camera, renderer;

// 初始化函数
function init() {
    const container = document.getElementById('viewer');
    if (!container) return;
    
    // 创建场景
    scene = new THREE.Scene();
    
    // 创建相机
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1, 3);
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    
    // 添加光源
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(light);
    
    // 加载模型
    const objUrl = document.getElementById('model-url').dataset.url;
    if (objUrl) {
        const loader = new THREE.OBJLoader();
        loader.load(objUrl, (obj) => {
            obj.scale.set(0.01, 0.01, 0.01);
            scene.add(obj);
        });
    }
    
    // 添加窗口大小调整事件监听器
    window.addEventListener('resize', onResize);
    
    // 开始动画循环
    animate();
}

// 窗口大小调整处理函数
function onResize() {
    const container = document.getElementById('viewer');
    if (container && camera && renderer) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
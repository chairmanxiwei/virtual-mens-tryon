// 全局变量
let stream = null;
let cameraActive = false;
let capturedImage = null;

// DOM元素
let cameraFeed;
let canvas;
let canvasCtx;
let uploadZone;
let imageUpload;
let startCameraBtn;
let capturePhotoBtn;
let uploadImageBtn;
let resetCameraBtn;
let analyzeImageBtn;
let tryOnBtn;
let saveResultBtn;
let faceDetectionResult;
let clothingRecognitionResult;
let cameraContainer;

// 初始化
function init() {
    // 获取DOM元素
    cameraFeed = document.getElementById('camera-feed');
    canvas = document.getElementById('canvas');
    canvasCtx = canvas.getContext('2d');
    uploadZone = document.getElementById('upload-zone');
    imageUpload = document.getElementById('image-upload');
    startCameraBtn = document.getElementById('start-camera');
    capturePhotoBtn = document.getElementById('capture-photo');
    uploadImageBtn = document.getElementById('upload-image');
    resetCameraBtn = document.getElementById('reset-camera');
    analyzeImageBtn = document.getElementById('analyze-image');
    tryOnBtn = document.getElementById('try-on');
    saveResultBtn = document.getElementById('save-result');
    faceDetectionResult = document.getElementById('face-detection-result');
    clothingRecognitionResult = document.getElementById('clothing-recognition-result');
    cameraContainer = document.getElementById('camera-container');
    
    // 设置事件监听器
    setupEventListeners();
}

// 设置事件监听器
function setupEventListeners() {
    if (!startCameraBtn || !capturePhotoBtn || !resetCameraBtn || !uploadImageBtn || !imageUpload || !uploadZone || !analyzeImageBtn || !tryOnBtn || !saveResultBtn) {
        return;
    }
    
    // 摄像头控制
    startCameraBtn.addEventListener('click', startCamera);
    capturePhotoBtn.addEventListener('click', capturePhoto);
    resetCameraBtn.addEventListener('click', resetCamera);
    
    // 图片上传
    uploadImageBtn.addEventListener('click', () => imageUpload.click());
    imageUpload.addEventListener('change', handleImageUpload);
    
    // 拖放上传
    uploadZone.addEventListener('click', () => imageUpload.click());
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            imageUpload.files = e.dataTransfer.files;
            handleImageUpload({ target: { files: e.dataTransfer.files } });
        }
    });
    
    // 分析和操作
    analyzeImageBtn.addEventListener('click', analyzeImage);
    tryOnBtn.addEventListener('click', goToVirtualTryOn);
    saveResultBtn.addEventListener('click', saveResult);
}

// 启动摄像头
async function startCamera() {
    try {
        showLoading('启动摄像头...');
        
        // 获取摄像头权限
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        
        // 显示摄像头 feed
        cameraFeed.srcObject = stream;
        cameraFeed.style.display = 'block';
        canvas.style.display = 'block';
        uploadZone.style.display = 'none';
        
        // 启用拍摄按钮
        capturePhotoBtn.disabled = false;
        startCameraBtn.disabled = true;
        uploadImageBtn.disabled = true;
        
        hideLoading();
        
        // 开始人脸检测
        startFaceDetection();
        
    } catch (error) {
        console.error('启动摄像头失败:', error);
        hideLoading();
        showError('无法访问摄像头，请检查权限设置');
    }
}

// 开始人脸检测
function startFaceDetection() {
    const video = cameraFeed;
    const canvasElement = canvas;
    const ctx = canvasElement.getContext('2d');
    
    function processFrame() {
        if (!cameraActive) return;
        
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // 这里应该集成实际的人脸检测算法
        // 模拟人脸检测效果
        drawFaceMarkers(ctx, canvasElement.width, canvasElement.height);
        
        requestAnimationFrame(processFrame);
    }
    
    cameraActive = true;
    processFrame();
}

// 绘制人脸标记（模拟）
function drawFaceMarkers(ctx, width, height) {
    // 模拟人脸位置
    const faceX = width / 2 - 80;
    const faceY = height / 2 - 100;
    const faceWidth = 160;
    const faceHeight = 200;
    
    // 绘制人脸框
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(faceX, faceY, faceWidth, faceHeight);
    ctx.setLineDash([]);
    
    // 绘制关键点
    const keyPoints = [
        { x: faceX + faceWidth / 2, y: faceY + faceHeight / 3 }, // 额头
        { x: faceX + faceWidth / 4, y: faceY + faceHeight / 2 }, // 左眼
        { x: faceX + 3 * faceWidth / 4, y: faceY + faceHeight / 2 }, // 右眼
        { x: faceX + faceWidth / 2, y: faceY + 2 * faceHeight / 3 }, // 鼻子
        { x: faceX + faceWidth / 2, y: faceY + 3 * faceHeight / 4 } // 嘴巴
    ];
    
    keyPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

// 拍摄照片
function capturePhoto() {
    if (!stream) return;
    
    const video = cameraFeed;
    const canvasElement = canvas;
    const ctx = canvasElement.getContext('2d');
    
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    
    // 绘制视频帧到画布
    ctx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    
    // 保存捕获的图像
    capturedImage = canvasElement.toDataURL('image/jpeg');
    
    // 显示捕获的图像
    cameraFeed.style.display = 'none';
    canvas.style.display = 'block';
    
    // 启用分析按钮
    analyzeImageBtn.disabled = false;
    tryOnBtn.disabled = false;
    
    // 显示成功消息
    showSuccess('照片拍摄成功！');
}

// 处理图片上传
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showLoading('处理图片...');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageUrl = e.target.result;
        capturedImage = imageUrl;
        
        // 显示上传的图像
        const img = document.createElement('img');
        img.src = imageUrl;
        img.onerror = function() { this.src = '/img/placeholder.svg'; };
        img.style.width = '100%';
        img.style.height = '400px';
        img.style.objectFit = 'cover';
        img.id = 'uploaded-image';
        
        cameraContainer.innerHTML = '';
        cameraContainer.appendChild(img);
        
        // 启用分析按钮
        analyzeImageBtn.disabled = false;
        tryOnBtn.disabled = false;
        
        hideLoading();
        showSuccess('图片上传成功！');
    };
    reader.onerror = function() {
        hideLoading();
        showError('读取图片失败');
    };
    reader.readAsDataURL(file);
}

// 重置摄像头
function resetCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    cameraActive = false;
    capturedImage = null;
    
    // 重置界面
    cameraFeed.style.display = 'none';
    canvas.style.display = 'none';
    uploadZone.style.display = 'flex';
    uploadZone.style.flexDirection = 'column';
    uploadZone.style.alignItems = 'center';
    uploadZone.style.justifyContent = 'center';
    
    // 重置按钮状态
    capturePhotoBtn.disabled = true;
    startCameraBtn.disabled = false;
    uploadImageBtn.disabled = false;
    analyzeImageBtn.disabled = true;
    tryOnBtn.disabled = true;
    
    // 清空结果
    faceDetectionResult.innerHTML = '<div class="result-item"><p>请拍摄或上传照片以开始识别</p></div>';
    clothingRecognitionResult.innerHTML = '<div class="result-item"><p>请拍摄或上传照片以开始识别</p></div>';
}

// 分析图像
async function analyzeImage() {
    if (!capturedImage) return;
    
    showLoading('分析图像...');
    
    try {
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 模拟人脸检测结果
        const faceResult = {
            success: true,
            faceCount: 1,
            facePosition: {
                x: 100,
                y: 80,
                width: 160,
                height: 200
            },
            confidence: 0.95
        };
        
        // 模拟服装识别结果
        const clothingResult = {
            success: true,
            items: [
                {
                    type: '衬衫',
                    color: '白色',
                    style: '商务',
                    confidence: 0.92,
                    position: {
                        x: 80,
                        y: 200,
                        width: 200,
                        height: 180
                    }
                },
                {
                    type: '西装外套',
                    color: '深蓝色',
                    style: '正式',
                    confidence: 0.88,
                    position: {
                        x: 70,
                        y: 190,
                        width: 220,
                        height: 220
                    }
                }
            ]
        };
        
        // 显示结果
        displayFaceDetectionResult(faceResult);
        displayClothingRecognitionResult(clothingResult);
        
        hideLoading();
        showSuccess('图像分析完成！');
        
    } catch (error) {
        console.error('分析图像失败:', error);
        hideLoading();
        showError('分析图像失败，请重试');
    }
}

// 显示人脸检测结果
function displayFaceDetectionResult(result) {
    if (!result.success) {
        faceDetectionResult.innerHTML = '<div class="result-item"><p>未检测到人脸</p></div>';
        return;
    }
    
    faceDetectionResult.innerHTML = `
        <div class="result-item">
            <h4>人脸检测结果</h4>
            <p>检测到 ${result.faceCount} 个人脸</p>
            <p>置信度: ${(result.confidence * 100).toFixed(1)}%</p>
            <p>位置: X: ${result.facePosition.x}, Y: ${result.facePosition.y}</p>
            <p>大小: ${result.facePosition.width} x ${result.facePosition.height}</p>
        </div>
    `;
}

// 显示服装识别结果
function displayClothingRecognitionResult(result) {
    if (!result.success || !result.items || result.items.length === 0) {
        clothingRecognitionResult.innerHTML = '<div class="result-item"><p>未识别到服装</p></div>';
        return;
    }
    
    let html = '';
    result.items.forEach((item, index) => {
        html += `
            <div class="result-item">
                <h4>服装 ${index + 1}</h4>
                <p>类型: ${item.type}</p>
                <p>颜色: ${item.color}</p>
                <p>风格: ${item.style}</p>
                <p class="confidence">置信度: ${(item.confidence * 100).toFixed(1)}%</p>
            </div>
        `;
    });
    
    clothingRecognitionResult.innerHTML = html;
}

// 跳转到虚拟试穿
function goToVirtualTryOn() {
    if (!capturedImage) {
        showError('请先拍摄或上传照片');
        return;
    }
    
    // 这里可以将图像数据传递给虚拟试穿页面
    window.location.href = '/virtual-tryon?from=recognition';
}

// 保存结果
function saveResult() {
    if (!capturedImage) {
        showError('请先拍摄或上传照片');
        return;
    }
    
    showLoading('保存结果...');
    
    // 模拟保存过程
    setTimeout(() => {
        hideLoading();
        showSuccess('结果保存成功！');
    }, 1000);
}

// 显示加载状态
function showLoading(message = '处理中...') {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <p>${message}</p>
    `;
    cameraContainer.appendChild(loadingOverlay);
}

// 隐藏加载状态
function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
}

// 显示错误消息
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const container = document.querySelector('.recognition-panel:first-child');
    const controls = container.querySelector('.controls');
    if (container && controls) {
        container.insertBefore(errorDiv, controls);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }
}

// 显示成功消息
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <h4><i class="fas fa-check-circle"></i> 成功</h4>
        <p>${message}</p>
    `;
    
    const container = document.querySelector('.recognition-panel:last-child');
    const resultContainer = container.querySelector('.result-container');
    if (container && resultContainer) {
        container.insertBefore(successDiv, resultContainer);
        
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
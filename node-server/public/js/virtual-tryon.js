(function() {
    'use strict';

    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('photo-upload');
    const uploadForm = document.getElementById('upload-form');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-bar');
    const progressPercent = document.getElementById('upload-percent');
    const filePreview = document.getElementById('file-preview');
    const previewImage = document.getElementById('preview-image');
    const container = document.getElementById('3d-container');
    const rotateBtn = document.getElementById('rotate-model');
    const resetBtn = document.getElementById('reset-model');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');

    let scene;
    let camera;
    let renderer;
    let controls;
    let gifPlane;
    let gifTexture;
    let gifMaterial;
    let gifAspect = 1;
    let frameCount = 0;
    let lastSample = performance.now();
    let progressTimer = null;
    const initialCameraPosition = new THREE.Vector3(0, 0, 3);
    const initialTarget = new THREE.Vector3(0, 0, 0);

    if (uploadZone) {
        uploadZone.addEventListener('click', () => fileInput.click());
    }

    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            if (!isImageFile(file)) {
                alert('请上传 JPG/PNG/WebP 图片');
                fileInput.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = function(event) {
                previewImage.src = event.target.result;
                filePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    uploadForm.addEventListener('submit', function(e) {
        if (!fileInput.files.length) {
            alert('请先选择一张照片');
            e.preventDefault();
            return;
        }
        if (!isImageFile(fileInput.files[0])) {
            alert('请上传 JPG/PNG/WebP 图片');
            e.preventDefault();
            return;
        }

        if (progressContainer) {
            progressContainer.style.display = 'block';
            if (progressBar) progressBar.style.width = '0%';
            if (progressPercent) progressPercent.textContent = '0%';
            let width = 0;
            if (progressTimer) clearInterval(progressTimer);
            progressTimer = setInterval(() => {
                if (width >= 90) {
                    clearInterval(progressTimer);
                    progressTimer = null;
                } else {
                    width += 10;
                    if (progressBar) progressBar.style.width = width + '%';
                    if (progressPercent) progressPercent.textContent = width + '%';
                }
            }, 200);
        }
    });

    function showLoading(message, subtext) {
        if (!loadingOverlay) return;
        if (loadingText) loadingText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message}`;
        if (loadingSubtext) loadingSubtext.textContent = subtext || '';
        loadingOverlay.style.display = 'flex';
    }

    function showError(message) {
        if (!loadingOverlay) return;
        if (loadingText) loadingText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        if (loadingSubtext) loadingSubtext.textContent = '请更换 GIF 后重试';
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        if (!loadingOverlay) return;
        loadingOverlay.style.display = 'none';
    }

    function isImageFile(file) {
        if (!file) return false;
        const name = (file.name || '').toLowerCase();
        return ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type) ||
            name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
    }

    function isGifUrl(url) {
        return /\.gif($|\?)/i.test(url);
    }

    function initThree() {
        if (!container || renderer) return;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111122);
        camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.copy(initialCameraPosition);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.copy(initialTarget);
        controls.update();
        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        if (controls) controls.update();
        if (gifTexture) {
            gifTexture.needsUpdate = true;
            frameCount += 1;
            const now = performance.now();
            if (now - lastSample > 3000) {
                const fps = Math.round((frameCount * 1000) / (now - lastSample));
                const memory = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
                console.info('GIF播放性能', { fps, memoryMB: memory });
                frameCount = 0;
                lastSample = now;
            }
        }
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    function updatePlaneScale() {
        if (!gifPlane || !container) return;
        const containerAspect = container.clientWidth / container.clientHeight || 1;
        const imageAspect = gifAspect || 1;
        let scaleX = 1;
        let scaleY = 1;
        if (imageAspect > containerAspect) {
            scaleY = containerAspect / imageAspect;
        } else {
            scaleX = imageAspect / containerAspect;
        }
        gifPlane.scale.set(scaleX * 2, scaleY * 2, 1);
    }

    function clearGifPlane() {
        if (!scene) return;
        if (gifPlane) {
            scene.remove(gifPlane);
            gifPlane.geometry.dispose();
            gifPlane = null;
        }
        if (gifMaterial) {
            gifMaterial.dispose();
            gifMaterial = null;
        }
        if (gifTexture) {
            gifTexture.dispose();
            gifTexture = null;
        }
    }

    async function validateGifUrl(url) {
        if (!isGifUrl(url)) return false;
        try {
            const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
            if (!res.ok) return false;
            const type = res.headers.get('content-type') || '';
            return type.includes('image/gif');
        } catch (e) {
            return false;
        }
    }

    function buildGifPlane(texture) {
        const geometry = new THREE.PlaneGeometry(1, 1);
        gifMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1
        });
        gifPlane = new THREE.Mesh(geometry, gifMaterial);
        gifPlane.position.set(0, 0, 0);
        scene.add(gifPlane);
        updatePlaneScale();
    }

    function loadGifFromUrl(url) {
        if (!url) return;
        showLoading('正在加载 GIF...', '请稍候');
        const img = new Image();
        img.onload = () => {
            initThree();
            clearGifPlane();
            gifAspect = img.width / img.height || 1;
            gifTexture = new THREE.Texture(img);
            gifTexture.minFilter = THREE.LinearFilter;
            gifTexture.magFilter = THREE.LinearFilter;
            gifTexture.needsUpdate = true;
            buildGifPlane(gifTexture);
            hideLoading();
        };
        img.onerror = () => {
            validateGifUrl(url).then((ok) => {
                loadFallback(ok ? 'GIF 加载失败' : 'GIF 路径或格式无效');
            });
        };
        img.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    }

    function getGifUrlFromPage() {
        if (!container) return '';
        const dataGif = container.dataset.gif || '';
        return dataGif || '';
    }

    function getPlaceholderUrl() {
        if (!container) return '/img/placeholder.svg';
        return container.dataset.placeholder || '/img/placeholder.svg';
    }

    function loadFallback(reason) {
        const placeholder = getPlaceholderUrl();
        showError(reason);
        const img = new Image();
        img.onload = () => {
            initThree();
            clearGifPlane();
            gifAspect = img.width / img.height || 1;
            gifTexture = new THREE.Texture(img);
            gifTexture.minFilter = THREE.LinearFilter;
            gifTexture.magFilter = THREE.LinearFilter;
            gifTexture.needsUpdate = true;
            buildGifPlane(gifTexture);
        };
        img.src = `${placeholder}${placeholder.includes('?') ? '&' : '?'}t=${Date.now()}`;
    }

    window.addEventListener('load', () => {
        initThree();
        const gifUrl = getGifUrlFromPage();
        const params = new URLSearchParams(window.location.search);
        const ts = params.get('ts') || Date.now();
        if (gifUrl) {
            const cacheBusted = `${gifUrl}${gifUrl.includes('?') ? '&' : '?'}t=${ts}`;
            loadGifFromUrl(cacheBusted);
        } else {
            loadFallback('未找到 GIF 资源');
        }
    });

    window.addEventListener('resize', () => {
        if (!container || !camera || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        updatePlaneScale();
    });

    if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
            if (controls) controls.autoRotate = !controls.autoRotate;
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!controls || !camera) return;
            camera.position.copy(initialCameraPosition);
            controls.target.copy(initialTarget);
            controls.update();
        });
    }
})();

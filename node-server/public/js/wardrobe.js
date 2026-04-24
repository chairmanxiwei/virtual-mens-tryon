/**
 * 衣橱页面 JavaScript
 * 处理衣物卡片的悬停、编辑、删除、筛选、上传等操作
 * 新增 AI 颜色识别功能，包含 CSRF 令牌支持
 */

// 全局变量：存储衣橱数据
let wardrobeClothes = [];

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('衣橱页面JS初始化');
    initClothingCards();
    initUploadZone();
    initWardrobeData();
    // 页面加载时从API获取统计数据
    fetchStats();
});

// 从API获取统计数据
async function fetchStats() {
    try {
        const response = await fetch('/api/wardrobe/stats', {
            credentials: 'include'
        });
        const data = await response.json();
        if (data.success) {
            updateStatsFromAPI(data.data);
        }
    } catch (error) {
        console.error('获取统计数据失败:', error);
    }
}

// 根据API返回的数据更新统计数字
function updateStatsFromAPI(stats) {
    const totalCountEl = document.querySelector('.stat-item:first-child .stat-number');
    const typeCountEl = document.querySelector('.stat-item:nth-child(2) .stat-number');
    if (totalCountEl) {
        totalCountEl.textContent = stats.total;
        totalCountEl.setAttribute('data-value', stats.total);
    }
    if (typeCountEl) {
        typeCountEl.textContent = stats.types;
        typeCountEl.setAttribute('data-value', stats.types);
    }
}

// 卡片交互：悬停显示操作按钮
function initClothingCards() {
    const cards = document.querySelectorAll('.clothing-card');
    cards.forEach(card => {
        const actions = card.querySelector('.card-actions');
        if (!actions) return;
        card.addEventListener('mouseenter', () => actions.style.transform = 'translateY(0)');
        card.addEventListener('mouseleave', () => actions.style.transform = 'translateY(100%)');
    });
}

// 上传区域初始化（拖拽/点击）
function initUploadZone() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('cloth-photo');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.style.borderColor = 'var(--accent-gold)';
    });

    zone.addEventListener('dragleave', () => {
        zone.style.borderColor = 'rgba(240,240,240,0.3)';
    });

    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = 'rgba(240,240,240,0.3)';
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            handleFileSelect(input.files[0]);
        }
    });

    input.addEventListener('change', () => {
        if (input.files.length) handleFileSelect(input.files[0]);
    });
}

// 预览图片
function previewFile(file) {
    const preview = document.getElementById('file-preview');
    const img = document.getElementById('preview-image');
    if (!preview || !img) return;
    const reader = new FileReader();
    reader.onload = e => {
        img.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// 处理文件选择（预览 + 触发 AI 识别）
function handleFileSelect(file) {
    previewFile(file);
    detectColor(file);
}

// AI 颜色识别（包含 CSRF 令牌）
async function detectColor(file) {
    const csrfToken = document.querySelector('input[name="csrfToken"]')?.value;
    if (!csrfToken) {
        console.error('CSRF 令牌未找到');
        return;
    }

    aiShowLoading('识别中...');
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('csrfToken', csrfToken);

    try {
        const res = await fetch('/wardrobe/detect-color', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await res.json();
        aiHideLoading();
        if (data.success) {
            showSuggestion(data.summary || '未知', data.primary || { r: 0, g: 0, b: 0 });
        } else {
            console.error('识别失败', data.error);
        }
    } catch (err) {
        aiHideLoading();
        console.error('识别出错', err);
    }
}

// 显示颜色建议浮层
function showSuggestion(colorName, rgb) {
    const input = document.getElementById('color');
    if (!input) return;

    // 移除已存在的浮层
    const old = document.getElementById('ai-suggestion');
    if (old) old.remove();

    const div = document.createElement('div');
    div.id = 'ai-suggestion';
    div.style.cssText = `
        position: absolute;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 8px 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
    `;
    div.innerHTML = `
        <span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:rgb(${rgb.r},${rgb.g},${rgb.b});border:1px solid #ddd;"></span>
        <span style="color: black;">AI识别：${colorName}</span>
        <button style="padding:4px 10px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;" id="useColor">使用</button>
        <button style="padding:4px 10px;background:#f44336;color:#fff;border:none;border-radius:4px;cursor:pointer;" id="ignoreColor">忽略</button>
    `;

    const rect = input.getBoundingClientRect();
    div.style.left = rect.left + window.scrollX + 'px';
    div.style.top = rect.bottom + window.scrollY + 5 + 'px';
    document.body.appendChild(div);

    document.getElementById('useColor').addEventListener('click', () => {
        input.value = colorName;
        div.remove();
    });
    document.getElementById('ignoreColor').addEventListener('click', () => div.remove());
}

// 加载提示（已改名避免冲突）
function aiShowLoading(msg) {
    const div = document.createElement('div');
    div.id = 'ai-loading';
    div.textContent = msg;
    div.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: #fff;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 2000;
    `;
    document.body.appendChild(div);
}

function aiHideLoading() {
    const el = document.getElementById('ai-loading');
    if (el) el.remove();
}

// ----- 全局函数（供 onclick 调用）-----
function openUploadModal() {
    document.getElementById('upload-modal').style.display = 'block';
    document.getElementById('cloth-upload-form').reset();
    document.getElementById('file-preview').style.display = 'none';
    const old = document.getElementById('ai-suggestion');
    if (old) old.remove();
    document.body.classList.add('modal-open');
    const content = document.querySelector('#upload-modal .upload-modal-content');
    if (content) {
        content.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        content.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    }
}

function closeUploadModal() {
    document.getElementById('upload-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

function filterByType(type) {
    document.querySelectorAll('.clothing-card').forEach(c => {
        c.style.display = (type === 'all' || c.dataset.type === type) ? 'block' : 'none';
    });
}

function generateAllOutfits() {
    alert('搭配生成功能开发中');
}

function generateRecommendations(id) {
    alert('搭配推荐功能开发中');
}

function editCloth(id) {
    fetch(`/wardrobe/cloth/${id}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                alert('获取衣物信息失败：' + (data.error || '未知错误'));
                return;
            }
            const c = data.data;
            document.getElementById('edit-id').value = c.id;
            document.getElementById('edit-name').value = c.name || '';
            document.getElementById('edit-color').value = c.color || '';
            document.getElementById('edit-type').value = c.type || '上装';
            document.getElementById('edit-style').value = c.style || '';
            document.getElementById('edit-size').value = c.size || '';
            document.getElementById('edit-season').value = c.season || '';
            document.getElementById('edit-brand').value = c.brand || '';
            document.getElementById('edit-material').value = c.material || '';
            document.getElementById('edit-price').value = c.price || '';
            document.getElementById('edit-suitable_temp').value = c.suitable_temp || '';
            document.getElementById('edit-description').value = c.description || '';
            document.getElementById('edit-modal').style.display = 'block';
            document.body.classList.add('modal-open');
            const content = document.querySelector('#edit-modal .upload-modal-content');
            if (content) {
                content.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
                content.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
            }
        })
        .catch(() => alert('网络错误'));
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

// 初始化衣橱数据
function initWardrobeData() {
    // 从页面中提取衣物数据
    const clothingCards = document.querySelectorAll('.clothing-card');
    wardrobeClothes = Array.from(clothingCards).map(card => {
        return {
            id: card.dataset.id,
            name: card.querySelector('h3').textContent,
            type: card.dataset.type
        };
    });
    console.log('初始化衣橱数据:', wardrobeClothes);
}

function deleteCloth(id) {
    console.log('删除衣物，ID:', id, '类型:', typeof id);
    if (!confirm('确定删除这件衣物吗？')) return;

    const csrfInput = document.querySelector('input[name="csrfToken"]');
    const csrfToken = csrfInput ? csrfInput.value : '';

    const fd = new FormData();
    fd.append('id', String(id));
    if (csrfToken) fd.append('csrfToken', csrfToken);

    fetch('/wardrobe/delete', {
        method: 'POST',
        body: fd,
        credentials: 'include'
    })
        .then(r => r.json())
        .then(j => {
            if (!j || !j.success) {
                const msg = (j && (j.error || j.message)) || '删除失败';
                throw new Error(msg);
            }

            let card = document.querySelector(`.clothing-card[data-id="${id}"]`);
            if (!card) {
                const numId = parseInt(id);
                card = document.querySelector(`.clothing-card[data-id="${numId}"]`);
            }
            if (card) card.remove();

            // 删除后重新从API获取统计数据
            fetchStats();

            const remainingCards = document.querySelectorAll('.clothing-card');
            if (remainingCards.length === 0) {
                const gridContainer = document.querySelector('.clothing-grid');
                if (gridContainer) {
                    gridContainer.innerHTML = "<div style='text-align: center; padding: 4rem; border: 1px dashed rgba(240,240,240,0.2);'><i class='fas fa-wardrobe' style='font-size: 3rem; color: rgba(240,240,240,0.3); margin-bottom: 1rem;'></i><h3 style='color: rgba(240,240,240,0.5);'>衣橱还是空的</h3><button class='btn btn-primary' style='margin-top: 1rem;' onclick='openUploadModal()'>上传第一件衣物</button></div>";
                }
            }

            alert('删除成功！已从数据库删除。');
        })
        .catch(err => {
            console.error('删除失败:', err);
            alert('删除失败：' + err.message);
        });
}

// 更新统计数字
function updateStats() {
    const cards = document.querySelectorAll('.clothing-card');
    const totalCountEl = document.querySelector('.stat-item:first-child .stat-number');
    if (totalCountEl && cards.length > 0) {
        totalCountEl.textContent = cards.length;
    }
    
    // 更新类型数
    const types = new Set(Array.from(cards).map(card => card.dataset.type));
    const typeCountEl = document.querySelector('.stat-item:nth-child(2) .stat-number');
    if (typeCountEl && cards.length > 0) {
        typeCountEl.textContent = types.size;
    }
}

// ----- 将函数挂载到全局，使 HTML onclick 可调用 -----
window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.filterByType = filterByType;
window.generateAllOutfits = generateAllOutfits;
window.generateRecommendations = generateRecommendations;
window.editCloth = editCloth;
window.closeEditModal = closeEditModal;
window.deleteCloth = deleteCloth;

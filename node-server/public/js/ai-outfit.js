// AI搭配页面专用脚本

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('AI搭配页面JavaScript初始化...');
    
    try {
        var unitSel = document.getElementById('temp-unit');
        var weatherLine = document.getElementById('weather-line');
        var luckyEl = document.getElementById('lucky-element');
        var luckyAdvice = document.getElementById('lucky-advice');
        var tempCField = document.getElementById('tempCField');
        var unitField = document.getElementById('unitField');
        
        function setLucky(t) {
            var elements = ['金','木','水','火','土'];
            var e = elements[new Date().getDay() % elements.length];
            luckyEl.textContent = e;
            luckyAdvice.textContent = '今日宜穿' + (t >= 25 ? '清爽' : '保暖') + '色系，参考元素：' + e;
        }
        
        function updateWeatherUI(d) {
            var useF = unitSel.value === 'F';
            var t = useF ? d.tempF : d.tempC;
            weatherLine.innerHTML = '<span style="color: #ffffff;">' + t + '°' + unitSel.value + ' </span>' + '<span style="font-size:1rem; color: #ffffff;">风速 ' + d.wind + '</span>';
            tempCField.value = d.tempC;
            unitField.value = unitSel.value;
            setLucky(d.tempC);
            try { localStorage.setItem('lastWeather', JSON.stringify(d)); } catch(e){}
        }
        
        unitSel.addEventListener('change', function() {
            var saved = null; try { saved = JSON.parse(localStorage.getItem('lastWeather')); } catch(e){}
            if (saved) updateWeatherUI(saved);
            try { fetch('/api/preferences', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ unit: unitSel.value }), credentials: 'include' }); } catch(e){}
        });
        
        var kw = document.getElementById('keywords');
        try {
            var savedKw = localStorage.getItem('styleKeywords');
            if (savedKw) kw.value = savedKw;
            kw.addEventListener('blur', function() {
                localStorage.setItem('styleKeywords', kw.value);
                try { fetch('/api/preferences', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ keywords: kw.value }), credentials: 'include' }); } catch(e){}
            });
        } catch(e){}
        
        if (typeof initImageRetries === 'function') {
            initImageRetries();
        }
        
        if (typeof initMapSelect === 'function') {
            initMapSelect({
                unitSel: unitSel,
                onWeather: updateWeatherUI
            });
        }
        
        if (!localStorage.getItem('lastWeather')) {
            setLucky(22);
        }
        
        console.log('AI搭配页面JavaScript初始化完成');
    } catch (error) {
        console.error('AI搭配页面JavaScript错误:', error);
    }

  // ===== 新增：LLM 基于目的/场景 + 天气 + 衣橱 推荐 =====
  const llmBtn = document.getElementById('llm-generate-btn');
  if (llmBtn) {
    llmBtn.addEventListener('click', async () => {
      const purpose = document.getElementById('llm-purpose').value.trim();
      const scene = document.getElementById('llm-scene').value.trim();
      const coords = window.aiGeo || {};
      const lat = coords.lat || null;
      const lon = coords.lon || null;
      const unit = document.getElementById('temp-unit') ? document.getElementById('temp-unit').value : 'C';
      const area = document.getElementById('llm-result');
      area.style.display = 'block';
      area.innerHTML = '<p style="text-align:center;">正在生成今日搭配...</p>';
      try {
        const resp = await fetch('/ai-outfit/llm-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ purpose, scene, lat, lon, unit })
        });
        const j = await resp.json();
        if (!j.success) throw new Error(j.error || '生成失败');
        renderLLMResult(j.data, j.clothes || []);
      } catch (e) {
        area.innerHTML = `<p class="error">生成失败：${e.message}</p>`;
      }
    });
  }

  function renderLLMResult(data, clothes) {
    const area = document.getElementById('llm-result');
    let html = '';
    if (!Array.isArray(clothes) || clothes.length === 0) {
      html += '<div style="margin-bottom:1rem;color:rgba(240,240,240,0.75);">你的衣橱目前为空，请先去「衣橱」上传至少 1 件衣物后再生成更精准的搭配。</div>';
    }
    if (data && Array.isArray(data.sets)) {
      html += '<div style="display:grid; grid-template-columns: 1fr; gap: 1rem;">';
      data.sets.forEach(set => {
        html += `<div style="border:1px solid rgba(240,240,240,0.2); padding:1rem; border-radius:8px;">
          <h4 style="color:#fff;">${set.category}</h4>
          <div style="color:#fff;">`;
        (set.items || []).forEach(it => {
          // 寻找衣橱中是否存在同名或包含关系的单品
          const match = clothes.find(c => (c.name || '').includes(it));
          const useBtn = match ? `<button class="btn btn-secondary btn-sm tryon-btn" data-id="${match.id}" style="margin-left:0.5rem;">试衣</button>` : `<span style="color:#f44336; font-size:0.8rem; margin-left:0.5rem;">库存缺失，建议补充</span>`;
          html += `<div style="margin:4px 0;">
            <span style="background:#333; color:#fff; padding:2px 8px; border-radius:12px;">${it}</span>${useBtn}
          </div>`;
        });
        html += `</div></div>`;
      });
      html += '</div>';
    }
    if (data && data.missing && data.missing.length) {
      html += `<div style="margin-top:1rem; color:#f44336;">缺失清单：${data.missing.join('；')}</div>`;
    }
    if (data && data.reason) {
      html += `<div style="margin-top:1rem;"><h4 style="color:#fff;">搭配理由</h4><p style="color:#fff;">${data.reason}</p></div>`;
    }
    area.innerHTML = html || '<p>暂无内容</p>';

    // 绑定试衣按钮
    area.querySelectorAll('.tryon-btn').forEach(btn => {
      btn.addEventListener('click', () => openTryonDialog(btn.dataset.id));
    });
  }

  function openTryonDialog(clothId) {
    const dlg = document.createElement('div');
    dlg.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;';
    dlg.innerHTML = `<div style="background:#111;border:1px solid rgba(212,175,55,0.3);padding:1rem;border-radius:8px;width:720px;max-width:92vw;">
      <h4 style="color: var(--accent-gold);">AI试衣</h4>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items:start;">
        <div>
          <div style="margin-bottom:0.75rem;color:rgba(240,240,240,0.8);font-size:0.9rem;">Step 1：选择人物</div>
          <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
            <label style="display:flex; gap:0.5rem; align-items:center; font-size:0.85rem;"><input type="radio" name="personMode" value="upload" checked> 上传照片</label>
            <label style="display:flex; gap:0.5rem; align-items:center; font-size:0.85rem;"><input type="radio" name="personMode" value="model"> 选择模特</label>
          </div>
          <div id="person-upload-box" style="border:1px dashed rgba(240,240,240,0.3);padding:0.75rem;text-align:center;margin-bottom:0.75rem;">
            <input type="file" id="tryon-person" accept="image/*" style="display:none">
            <button class="btn btn-secondary" id="pick-person">选择你的正面全身照</button>
            <div style="font-size:0.75rem;color:rgba(240,240,240,0.5);margin-top:0.5rem;">建议：正面全身照、光线均匀</div>
          </div>
          <div id="person-model-box" style="display:none; border:1px dashed rgba(240,240,240,0.3);padding:0.75rem;margin-bottom:0.75rem;">
            <select id="model-select" class="login-input" style="width:100%;">
              <option value="/img/placeholder.svg">模特A（占位）</option>
            </select>
          </div>

          <div style="margin-bottom:0.75rem;color:rgba(240,240,240,0.8);font-size:0.9rem;">Step 2：实时预览（贴合/颜色/尺寸）</div>
          <div style="border:1px solid rgba(240,240,240,0.12);border-radius:8px;overflow:hidden;background:#0a0a0a;">
            <div id="preview-stage" style="position:relative;height:360px;display:flex;align-items:center;justify-content:center;">
              <img id="preview-person-img" style="max-width:100%;max-height:100%;object-fit:contain;opacity:0.95;">
              <img id="preview-cloth-img" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-40%) scale(1);max-width:65%;max-height:65%;object-fit:contain;opacity:0.85;mix-blend-mode:normal;pointer-events:none;">
            </div>
            <div style="padding:0.75rem;border-top:1px solid rgba(240,240,240,0.08);display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
              <div>
                <div style="font-size:0.8rem;color:rgba(240,240,240,0.7);">尺寸适配</div>
                <select id="size-select" class="login-input" style="width:100%;">
                  <option value="0.9">S</option>
                  <option value="1" selected>M</option>
                  <option value="1.1">L</option>
                  <option value="1.2">XL</option>
                </select>
              </div>
              <div>
                <div style="font-size:0.8rem;color:rgba(240,240,240,0.7);">贴合度</div>
                <div style="height:10px;background:rgba(255,255,255,0.1);border-radius:6px;overflow:hidden;">
                  <div id="fit-bar" style="height:10px;width:50%;background:var(--accent-gold);"></div>
                </div>
              </div>
              <div>
                <div style="font-size:0.8rem;color:rgba(240,240,240,0.7);">缩放</div>
                <input id="scale-range" type="range" min="0.6" max="1.6" step="0.01" value="1" style="width:100%;">
              </div>
              <div>
                <div style="font-size:0.8rem;color:rgba(240,240,240,0.7);">上移/下移</div>
                <input id="y-range" type="range" min="-60" max="60" step="1" value="-40" style="width:100%;">
              </div>
              <div>
                <div style="font-size:0.8rem;color:rgba(240,240,240,0.7);">透明度</div>
                <input id="opacity-range" type="range" min="0.2" max="1" step="0.01" value="0.85" style="width:100%;">
              </div>
              <div>
                <div style="font-size:0.8rem;color:rgba(240,240,240,0.7);">颜色搭配</div>
                <div id="color-hint" style="font-size:0.85rem;color:rgba(240,240,240,0.8);">—</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div style="margin-bottom:0.75rem;color:rgba(240,240,240,0.8);font-size:0.9rem;">Step 3：生成真实试穿（CatVTON）</div>
          <div id="tryon-status" style="margin:0.5rem 0; color:#aaa;"></div>
          <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
            <button class="btn btn-secondary" id="cancel-tryon">取消</button>
            <button class="btn btn-primary" id="start-tryon" disabled>开始生成</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(dlg);
    const personInput = dlg.querySelector('#tryon-person');
    const previewPersonImg = dlg.querySelector('#preview-person-img');
    const previewClothImg = dlg.querySelector('#preview-cloth-img');
    const fitBar = dlg.querySelector('#fit-bar');
    const sizeSel = dlg.querySelector('#size-select');
    const scaleRange = dlg.querySelector('#scale-range');
    const yRange = dlg.querySelector('#y-range');
    const opacityRange = dlg.querySelector('#opacity-range');
    const colorHint = dlg.querySelector('#color-hint');

    const modeRadios = dlg.querySelectorAll('input[name="personMode"]');
    const uploadBox = dlg.querySelector('#person-upload-box');
    const modelBox = dlg.querySelector('#person-model-box');
    const modelSel = dlg.querySelector('#model-select');

    function computeFit() {
      const base = Number(sizeSel.value || 1);
      const scale = Number(scaleRange.value || 1) * base;
      const y = Number(yRange.value || 0);
      const score = Math.max(0, Math.min(100, Math.round(100 - Math.abs(scale - 1) * 80 - Math.abs(y + 40) * 0.6)));
      fitBar.style.width = score + '%';
    }

    function applyPreviewTransform() {
      const base = Number(sizeSel.value || 1);
      const scale = Number(scaleRange.value || 1) * base;
      const y = Number(yRange.value || 0);
      const op = Number(opacityRange.value || 0.85);
      previewClothImg.style.opacity = String(op);
      previewClothImg.style.transform = `translate(-50%, ${y}%) scale(${scale})`;
      computeFit();
    }

    sizeSel.addEventListener('change', applyPreviewTransform);
    scaleRange.addEventListener('input', applyPreviewTransform);
    yRange.addEventListener('input', applyPreviewTransform);
    opacityRange.addEventListener('input', applyPreviewTransform);

  function setPersonPreviewFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => { previewPersonImg.src = e.target.result; };
    reader.readAsDataURL(file);
  }

    async function setPersonPreviewFromModel(url) {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const fr = new FileReader();
        fr.onload = (e) => { previewPersonImg.src = e.target.result; };
        fr.readAsDataURL(blob);
      } catch { previewPersonImg.src = url; }
    }

    dlg.querySelector('#pick-person').addEventListener('click', () => personInput.click());
    personInput.addEventListener('change', () => {
      if (personInput.files.length) setPersonPreviewFromFile(personInput.files[0]);
      dlg.querySelector('#start-tryon').disabled = personInput.files.length === 0;
    });

    function updateModeUI() {
      const mode = dlg.querySelector('input[name="personMode"]:checked').value;
      uploadBox.style.display = mode === 'upload' ? 'block' : 'none';
      modelBox.style.display = mode === 'model' ? 'block' : 'none';
      if (mode === 'model') {
        dlg.querySelector('#start-tryon').disabled = false;
        setPersonPreviewFromModel(modelSel.value);
      } else {
        dlg.querySelector('#start-tryon').disabled = personInput.files.length === 0;
      }
    }
    modeRadios.forEach(r => r.addEventListener('change', updateModeUI));
    modelSel.addEventListener('change', updateModeUI);

    previewClothImg.src = '';
    // 接收从衣橱选择界面返回的 clothId
    window.addEventListener('message', (ev) => {
      try {
        if (ev.origin !== window.location.origin) return;
        if (ev.data && ev.data.type === 'choose-cloth') {
          // 更新预览衣物图
          previewClothImg.src = ev.data.image || previewClothImg.src;
          // 更新生成时使用的 clothId
          clothId = ev.data.id;
          applyPreviewTransform();
        }
      } catch(e){}
    });
    (async () => {
      try {
        const resp = await fetch(`/wardrobe/cloth/${clothId}`, { credentials: 'include' });
        const j = await resp.json();
        if (j && j.success && j.data) {
          previewClothImg.src = j.data.image || '';
          const p = j.data.primary_color_name ? `${j.data.primary_color_name}${j.data.primary_color_pct != null ? '(' + j.data.primary_color_pct + '%)' : ''}` : '';
          const s = j.data.secondary_color_name ? `${j.data.secondary_color_name}${j.data.secondary_color_pct != null ? '(' + j.data.secondary_color_pct + '%)' : ''}` : '';
          colorHint.textContent = p && s ? `${p} / ${s}` : (p || j.data.color || '—');
        } else {
          previewClothImg.src = '';
          colorHint.textContent = '—';
        }
      } catch {
        previewClothImg.src = '';
        colorHint.textContent = '—';
      } finally {
        applyPreviewTransform();
      }
    })();

    updateModeUI();
    dlg.querySelector('#cancel-tryon').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#start-tryon').addEventListener('click', async () => {
      const status = dlg.querySelector('#tryon-status');
      status.textContent = '生成中...';
      try {
        const fd = new FormData();
        const mode = dlg.querySelector('input[name="personMode"]:checked').value;
        if (mode === 'upload') {
          if (!personInput.files.length) throw new Error('请先上传人物照片');
          fd.append('person', personInput.files[0]);
        } else {
          const personUrl = modelSel.value;
          const blob = await (await fetch(personUrl)).blob();
          fd.append('person', blob, 'model.png');
        }
        fd.append('cloth_id', clothId);
        const resp = await fetch('/ai-outfit/tryon', { method: 'POST', body: fd, credentials: 'include' });
        const j = await resp.json();
        if (!j.success) throw new Error(j.error || '试衣失败');
        status.innerHTML = `<img src="${j.result_url}" style="max-width:100%;border-radius:8px;border:1px solid rgba(212,175,55,0.3);">`;
      } catch (e) {
        status.textContent = '失败：' + e.message;
      }
    });
  }

  // ===== 一键试衣（整套）与换一批 =====
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t && t.id === 'refresh-llm') {
      const purpose = document.getElementById('llm-purpose').value.trim();
      const scene = document.getElementById('llm-scene').value.trim();
      const coords = window.aiGeo || {};
      const lat = coords.lat || null;
      const lon = coords.lon || null;
      const unit = document.getElementById('temp-unit') ? document.getElementById('temp-unit').value : 'C';
      const area = document.getElementById('llm-result');
      area.style.display = 'block';
      area.innerHTML = '<p style="text-align:center;">正在换一批...</p>';
      try {
        const resp = await fetch('/ai-outfit/llm-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ purpose, scene, lat, lon, unit, refresh: 1 })
        });
        const j = await resp.json();
        if (!j.success) throw new Error(j.error || '生成失败');
        renderLLMResult(j.data, j.clothes || []);
      } catch (err) {
        area.innerHTML = `<p class="error">换一批失败：${err.message}</p>`;
      }
    }

    if (t && t.id === 'tryon-all-btn') {
      const area = document.getElementById('llm-result');
      // 收集当前列表里带有 tryon-btn 的衣物 id（上衣/下装/外套/鞋最多各一件）
      const ids = [];
      area.querySelectorAll('.tryon-btn').forEach(btn => {
        if (ids.length < 4) ids.push(btn.dataset.id);
      });
      if (ids.length === 0) {
        alert('当前搭配中未找到可试穿的衣物');
        return;
      }
      const dlg = document.createElement('div');
      dlg.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;';
      dlg.innerHTML = `<div style="background:#111;border:1px solid rgba(212,175,55,0.3);padding:1rem;border-radius:8px;width:640px;max-width:92vw;">
        <h4 style="color:#fff;">整套试衣</h4>
        <div style="border:1px dashed rgba(240,240,240,0.3);padding:0.75rem;text-align:center;margin-bottom:0.75rem;">
          <input type="file" id="batch-person" accept="image/*" style="display:none">
          <button class="btn btn-secondary" id="pick-batch-person">选择你的正面全身照</button>
        </div>
        <div id="batch-status" style="margin:0.5rem 0; color:#aaa;"></div>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <button class="btn btn-secondary" id="cancel-batch">取消</button>
          <button class="btn btn-primary" id="start-batch" disabled>开始整套生成</button>
        </div>
      </div>`;
      document.body.appendChild(dlg);
      const personInput = dlg.querySelector('#batch-person');
      dlg.querySelector('#pick-batch-person').addEventListener('click', () => personInput.click());
      personInput.addEventListener('change', () => { dlg.querySelector('#start-batch').disabled = personInput.files.length === 0; });
      dlg.querySelector('#cancel-batch').addEventListener('click', () => dlg.remove());
      dlg.querySelector('#start-batch').addEventListener('click', async () => {
        const status = dlg.querySelector('#batch-status');
        status.textContent = '整套生成中...';
        try {
          const fd = new FormData();
          fd.append('person', personInput.files[0]);
          ids.forEach(id => fd.append('cloth_ids[]', id));
          const resp = await fetch('/ai-outfit/tryon-batch', { method: 'POST', body: fd, credentials: 'include' });
          const j = await resp.json();
          if (!j.success) throw new Error(j.error || '整套试衣失败');
          status.innerHTML = `<img src="${j.result_url}" style="max-width:100%;border-radius:8px;border:1px solid rgba(212,175,55,0.3);">`;
        } catch (e) {
          status.textContent = '失败：' + e.message;
        }
      });
    }
  });

  // 在试衣弹窗中，给“更换衣物”入口（如果存在）绑定打开选择界面
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('open-wardrobe-picker')) {
      window.open('/wardrobe/picker', 'wardrobe-picker', 'width=920,height=640');
    }
  });
});

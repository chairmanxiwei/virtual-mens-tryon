// 全局变量
const API_BASE_URL = 'http://127.0.0.1:8000';

// DOM 元素
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');
const loading = document.getElementById('loading');
const message = document.getElementById('message');

// 导航切换功能
navButtons.forEach(button => {
    button.addEventListener('click', () => {
        const sectionId = button.getAttribute('data-section');
        
        // 更新导航按钮状态
        navButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // 更新显示的 section
        sections.forEach(section => section.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');
    });
});

// 显示加载动画
function showLoading() {
    loading.style.display = 'flex';
}

// 隐藏加载动画
function hideLoading() {
    loading.style.display = 'none';
}

// 显示提示消息
function showMessage(text, type = 'info') {
    message.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';
    
    // 3秒后自动隐藏
    setTimeout(() => {
        message.style.display = 'none';
    }, 3000);
}

// 天气查询 - 正确的请求格式（适配后端校验）
async function queryWeather(city) {
  // 按城市名映射经纬度（北京示例）
  const cityMap = {
    "北京": { lat: 39.9, lon: 116.4 },
    "上海": { lat: 31.2, lon: 121.4 },
    "广州": { lat: 23.1, lon: 113.3 }
  };
  const { lat, lon } = cityMap[city] || cityMap["北京"];

  try {
    const response = await fetch('http://127.0.0.1:8000/api/weather/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lat: lat,        // 纬度（必填）
        lon: lon,        // 经度（必填）
        unit: "C"        // 单位（必填，C=摄氏度）
      })
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('天气查询失败:', error);
  }
}

// 温度查询功能
const queryWeatherBtn = document.getElementById('query-weather');
const cityInput = document.getElementById('city');
const weatherResult = document.getElementById('weather-result');

queryWeatherBtn.addEventListener('click', async () => {
    const city = cityInput.value.trim();
    if (!city) {
        showMessage('请输入城市名', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const data = await queryWeather(city);
        
        if (data && data.success) {
            const weatherData = data.data;
            weatherResult.innerHTML = `
                <div class="weather-info">
                    <div class="weather-item">
                        <h3>实时温度</h3>
                        <p>${weatherData.temperature}°C</p>
                    </div>
                    <div class="weather-item">
                        <h3>体感温度</h3>
                        <p>${weatherData.feels_like}°C</p>
                    </div>
                    <div class="weather-item">
                        <h3>天气类型</h3>
                        <p>${weatherData.weather}</p>
                    </div>
                    <div class="weather-item">
                        <h3>湿度</h3>
                        <p>${weatherData.humidity}%</p>
                    </div>
                    <div class="weather-item">
                        <h3>风速</h3>
                        <p>${weatherData.wind_speed} m/s</p>
                    </div>
                </div>
            `;
            showMessage('温度查询成功', 'success');
        } else {
            showMessage('查询失败：' + (data.error || '未知错误'), 'error');
            weatherResult.innerHTML = '<p>查询失败，请稍后重试</p>';
        }
    } catch (error) {
        showMessage('查询失败：' + error.message, 'error');
        weatherResult.innerHTML = '<p>查询失败，请稍后重试</p>';
    } finally {
        hideLoading();
    }
});

// 穿搭推荐请求（修正后，必须包含 temperature/tempC）
async function getOutfitRecommend(scene, userId) {
  // 先获取当前温度（从天气查询结果里取，或固定一个值）
  const temp = 22; // 临时固定为22℃，也可以从天气查询模块里动态获取

  try {
    const response = await fetch('http://127.0.0.1:8000/api/outfit/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occasion: scene,        // 场景（必填）
        tempC: temp,            // 温度（必填，解决500核心）
        user_id: userId,        // 用户ID
        clothes_list: []       // 衣橱列表（可空）
      })
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('穿搭推荐失败:', error);
  }
}

// 穿搭推荐功能
const generateRecommendationBtn = document.getElementById('generate-recommendation');
const sceneSelect = document.getElementById('scene');
const userIdInput = document.getElementById('user-id');
const recommendationResult = document.getElementById('recommendation-result');

generateRecommendationBtn.addEventListener('click', async () => {
    const scene = sceneSelect.value;
    const userId = parseInt(userIdInput.value);
    
    showLoading();
    
    try {
        const data = await getOutfitRecommend(scene, userId);
        
        if (data && data.success) {
            const outfitData = data.outfit_recommendation;
            const clothesList = outfitData.match_clothes;
            const tips = outfitData.tips;
            
            let clothesHtml = '';
            clothesList.forEach(cloth => {
                clothesHtml += `
                    <div class="clothes-item">
                        <img src="${cloth.image_url || 'https://via.placeholder.com/200'}" alt="${cloth.name}">
                        <h4>${cloth.name}</h4>
                        <p>类型：${cloth.type}</p>
                        <p>风格：${cloth.style}</p>
                        <p>颜色：${cloth.color}</p>
                    </div>
                `;
            });
            
            let tipsHtml = '';
            tips.forEach(tip => {
                tipsHtml += `<li>${tip}</li>`;
            });
            
            recommendationResult.innerHTML = `
                <div class="outfit-info">
                    <h3>推荐搭配</h3>
                    <p>场景：${scene}</p>
                    <p>温度：22°C</p>
                </div>
                <div class="clothes-list">
                    ${clothesHtml}
                </div>
                <div class="tips-list">
                    <h3>搭配理由</h3>
                    <ul>
                        ${tipsHtml}
                    </ul>
                </div>
            `;
            showMessage('穿搭推荐生成成功', 'success');
        } else {
            showMessage('生成推荐失败：' + (data.error || '未知错误'), 'error');
            recommendationResult.innerHTML = '<p>生成推荐失败，请稍后重试</p>';
        }
    } catch (error) {
        showMessage('生成推荐失败：' + error.message, 'error');
        recommendationResult.innerHTML = '<p>生成推荐失败，请稍后重试</p>';
    } finally {
        hideLoading();
    }
});

// 图片上传转 Base64 函数
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// 虚拟试衣功能
const generateTryonBtn = document.getElementById('generate-tryon');
const personImageUrl = document.getElementById('person-image-url');
const personImageFile = document.getElementById('person-image-file');
const garmentImageUrl = document.getElementById('garment-image-url');
const garmentImageFile = document.getElementById('garment-image-file');
const garmentType = document.getElementById('garment-type');
const tryonResult = document.getElementById('tryon-result');

generateTryonBtn.addEventListener('click', async () => {
    let personUrl = personImageUrl.value.trim();
    let garmentUrl = garmentImageUrl.value.trim();
    const type = garmentType.value;
    
    // 处理文件上传
    if (personImageFile.files.length > 0) {
        try {
            const base64 = await fileToBase64(personImageFile.files[0]);
            personUrl = base64;
        } catch (error) {
            showMessage('人物图片上传失败', 'error');
            return;
        }
    }
    
    if (garmentImageFile.files.length > 0) {
        try {
            const base64 = await fileToBase64(garmentImageFile.files[0]);
            garmentUrl = base64;
        } catch (error) {
            showMessage('衣物图片上传失败', 'error');
            return;
        }
    }
    
    if (!personUrl || !garmentUrl) {
        showMessage('请提供人物图片和衣物图片', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/virtual-tryon`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                person_image_url: personUrl,
                garment_image_url: garmentUrl,
                garment_type: type,
                mock: true
            })
        });
        
        if (!response.ok) {
            throw new Error('生成试衣效果失败');
        }
        
        const data = await response.json();
        
        if (data.success) {
            tryonResult.innerHTML = `
                <div class="tryon-image">
                    <img src="${data.data.image_url}" alt="虚拟试衣效果">
                    <p>${data.data.message}</p>
                </div>
            `;
            showMessage('虚拟试衣生成成功', 'success');
        } else {
            showMessage('生成试衣效果失败：' + (data.error || '未知错误'), 'error');
            tryonResult.innerHTML = '<p>生成试衣效果失败，请稍后重试</p>';
        }
    } catch (error) {
        showMessage('生成试衣效果失败：' + error.message, 'error');
        tryonResult.innerHTML = '<p>生成试衣效果失败，请稍后重试</p>';
    } finally {
        hideLoading();
    }
});

// 初始化页面
window.onload = function() {
    // 自动查询默认城市温度
    queryWeatherBtn.click();
};

const axios = require('axios');

async function callLLM({ provider, url, model, prompt }) {
  try {
    if (provider === 'ollama') {
      const resp = await axios.post(`${url}/api/generate`, {
        model: model || 'llama3',
        prompt,
        stream: false,
        options: { temperature: 0.7 }
      }, { timeout: 8000 });
      const txt = resp.data && (resp.data.response || resp.data.message || resp.data.output || '');
      return String(txt || '').trim();
    }
    if (provider === 'openai-compatible') {
      const resp = await axios.post(`${url}/v1/chat/completions`, {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      }, { timeout: 8000 });
      const txt = resp.data?.choices?.[0]?.message?.content || '';
      return String(txt || '').trim();
    }
    return '';
  } catch (e) {
    return '';
  }
}

function buildPrompt({ purpose, scene, weather, clothes }) {
  const temp = weather ? (weather.unit === 'F' ? `${weather.tempF}°F` : `${weather.tempC}°C`) : '未知';
  const wind = weather ? `${weather.wind} m/s` : '未知';
  const inv = clothes.map(c => `- ${c.name}（${c.type}，${c.color || '未知'}，季节:${c.season || '四季'}）`).join('\n');
  return [
    '你是一位资深男装穿搭顾问。根据用户的穿搭目的与场景、当地天气，以及他的衣橱库存，给出完整的今日搭配建议。',
    `目的/场景：${purpose || '未填写'} / ${scene || '未填写'}`,
    `天气：温度 ${temp}，风速 ${wind}`,
    '衣橱库存：',
    inv || '- 空',
    '要求：',
    '- 先给出「搭配清单」，按上装/下装/外套/鞋/配件列出具体单品名称；',
    '- 对每一类给出 1-2 个可替代选项（来自衣橱库存）；',
    '- 如果库存缺少某类单品，明确写出「缺少：颜色/类型/季节」，并给出购买建议；',
    '- 最后给出「搭配理由」，结合温度/风速/场合/材质/版型/层次说明选择逻辑，180-300 字，避免空话；',
    '输出格式用 JSON：{"sets":[{ "category":"上装","items":[...]}...], "missing":[...], "reason":"..."}'
  ].join('\n');
}

function fallbackRecommend({ purpose, scene, weather, clothes }) {
  const byType = (t) => clothes.filter(c => (c.type || '').includes(t));
  const pick = (arr) => arr.length ? arr[0] : null;
  const top = pick(byType('上装')) || pick(clothes);
  const bottom = pick(byType('下装'));
  const jacket = pick(byType('外套'));
  const shoes = pick(byType('鞋'));
  const sets = [];
  if (top) sets.push({ category: '上装', items: [top.name] });
  if (bottom) sets.push({ category: '下装', items: [bottom.name] });
  if (jacket) sets.push({ category: '外套', items: [jacket.name] });
  if (shoes) sets.push({ category: '鞋子', items: [shoes.name] });
  const missing = [];
  if (!bottom) missing.push('缺少：适合当季的下装');
  if (!shoes) missing.push('缺少：舒适的鞋');
  const reason = `根据 ${purpose || '今日行程'} / ${scene || '场景'} 与温度 ${
    weather ? (weather.unit === 'F' ? `${weather.tempF}°F` : `${weather.tempC}°C`) : '未知'
  }，选择简洁实用的组合，确保舒适与得体。`;
  return { sets, missing, reason };
}

async function recommend({ purpose, scene, weather, clothes }) {
  const prompt = buildPrompt({ purpose, scene, weather, clothes });
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const url = process.env.OLLAMA_URL || process.env.LLM_URL || '';
  const model = process.env.LLM_MODEL || 'llama3';
  if (!url) {
    return fallbackRecommend({ purpose, scene, weather, clothes });
  }
  const txt = await callLLM({ provider, url, model, prompt });
  try {
    const parsed = JSON.parse(txt);
    if (parsed && parsed.sets) return parsed;
  } catch {}
  return fallbackRecommend({ purpose, scene, weather, clothes });
}

module.exports = { recommend };

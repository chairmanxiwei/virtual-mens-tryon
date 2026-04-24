const express = require('express');
const axios = require('axios');
const router = express.Router();

function cfg() {
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const defaultCallback = publicBaseUrl ? `${publicBaseUrl}/auth/github/callback` : '';
  return {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callback: process.env.GITHUB_CALLBACK_URL || defaultCallback
  };
}

function authUrl(state) {
  const c = cfg();
  const scope = encodeURIComponent('read:user');
  return `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(c.clientId)}&redirect_uri=${encodeURIComponent(c.callback)}&scope=${scope}&state=${encodeURIComponent(state)}`;
}

async function exchange(code) {
  const c = cfg();
  const r = await axios.post('https://github.com/login/oauth/access_token', {
    client_id: c.clientId,
    client_secret: c.clientSecret,
    code,
    redirect_uri: c.callback
  }, { headers: { Accept: 'application/json' }, timeout: 5000 });
  return r.data;
}

router.get('/login', (req, res) => {
  const state = String(Date.now());
  req.session.github_oauth_state = state;
  const url = authUrl(state);
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state || state !== req.session.github_oauth_state) {
      return res.status(400).send('授权失败');
    }
    let attempt = 0;
    let data = null;
    let err = null;
    while (attempt < 3) {
      try {
        data = await exchange(code);
        break;
      } catch (e) {
        err = e;
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        attempt++;
      }
    }
    if (!data || !data.access_token) {
      return res.status(502).send('令牌获取失败');
    }
    req.session.github_token = { token: data.access_token, ts: Date.now() };
    res.redirect('/dashboard');
  } catch (e) {
    res.status(500).send('授权处理异常');
  }
});

router.get('/status', async (req, res) => {
  try {
    const t = req.session.github_token;
    const ok = !!(t && t.token);
    res.json({ success: true, data: { authed: ok } });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const GIF_URL = '/assets/gifs/sample.gif';

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'pifuhd');
const RESULT_DIR = path.join(__dirname, '..', 'public', 'models');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 简易任务状态表
const tasks = new Map();
const ENABLED = false;

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '未上传图片' });
    const id = Date.now().toString(36);
    tasks.set(id, { status: 'done', progress: 100, gif: GIF_URL });
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.json({ success: true, id, gif: GIF_URL });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/status/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
  res.json({ success: true, data: task });
});

router.get('/preview/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task || task.status !== 'done') {
    return res.status(404).send('资源不可用');
  }
  res.render('pifuhd-preview', { title: '试穿动画预览', objUrl: GIF_URL });
});

router.get('/health', (req, res) => {
  res.json({ success: true, data: { enabled: ENABLED, gif: GIF_URL } });
});

module.exports = router;

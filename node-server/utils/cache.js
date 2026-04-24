// utils/cache.js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600, checkperiod: process.env.NODE_ENV === 'test' ? 0 : 600 }); // 默认过期时间 600 秒
module.exports = cache;

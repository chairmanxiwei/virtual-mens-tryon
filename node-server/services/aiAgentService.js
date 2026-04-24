const axios = require('axios');

const AI_AGENT_API_URL = (process.env.AI_AGENT_API_URL || process.env.AI_BACKEND_BASE_URL || '').replace(/\/+$/, '');

/**
 * AI 搭配推荐服务
 * 负责与 Python AI 搭配推荐 Agent 通信
 */
class AIAgentService {
    /**
     * 获取 AI 搭配推荐
     * @param {Object} params - 请求参数
     * @param {string} params.occasion - 场合
     * @param {string} params.style - 风格
     * @param {string} params.purpose - 目的
     * @param {string} params.scene - 场景
     * @param {number} params.temperature - 温度
     * @param {string} params.weather - 天气
     * @param {Array} params.clothes - 用户衣橱中的衣物
     * @returns {Promise<Object>} 推荐结果
     */
    static async getRecommendations(params) {
        try {
            const payload = {
                scene: params.occasion || params.scene || '',
                temperature: typeof params.temperature === 'number' ? params.temperature : Number(params.temperature || 0),
                purpose: params.purpose || '',
                clothes_list: params.clothes_list || []
            };

            let response = null;
            try {
                response = await axios.post(`${AI_AGENT_API_URL}/api/outfit/recommend`, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
            } catch (e) {
                response = await axios.post(`${AI_AGENT_API_URL}/recommend`, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
            }
            return response.data;
        } catch (error) {
            console.error('AI 推荐服务调用失败:', error.message);
            throw new Error('AI 推荐服务调用失败: ' + error.message);
        }
    }

    /**
     * 虚拟试衣（Python Agent）
     * @param {Object} params
     * @param {string} params.person_image_url
     * @param {string} params.garment_image_url
     * @param {string} params.garment_type
     */
    static async virtualTryon(params) {
        try {
            const response = await axios.post(`${AI_AGENT_API_URL}/api/virtual-tryon`, params, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000
            });
            return response.data;
        } catch (error) {
            console.error('虚拟试衣服务调用失败:', error.message);
            throw new Error('虚拟试衣服务调用失败: ' + error.message);
        }
    }

    /**
     * 健康检查
     * @returns {Promise<Object>} 健康状态
     */
    static async healthCheck() {
        try {
            const response = await axios.get(`${AI_AGENT_API_URL}/health`, {
                timeout: 3000 // 3秒超时
            });
            return response.data;
        } catch (error) {
            console.error('AI 服务健康检查失败:', error.message);
            throw new Error('AI 服务健康检查失败: ' + error.message);
        }
    }
}

module.exports = AIAgentService;

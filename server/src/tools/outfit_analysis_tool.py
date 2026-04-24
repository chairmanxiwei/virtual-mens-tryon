"""
穿搭分析工具
AI 穿搭推荐逻辑
"""
import json
from typing import List, Dict, Any


def analyze_outfit(
    temperature: float,
    feels_like: float,
    weather: str,
    scene: str,
    clothes_list: List[Dict[str, Any]]
) -> str:
    """
    AI 穿搭分析
    
    Args:
        temperature: 温度
        feels_like: 体感温度
        weather: 天气
        scene: 场景
        clothes_list: 衣物列表
        
    Returns:
        JSON字符串，包含AI穿搭建议
    """
    try:
        # 分析逻辑
        match_clothes = []
        missing_items = []
        tips = []
        
        # 根据场景和温度筛选合适的衣物
        for item in clothes_list:
            # 场景匹配
            if scene == "商务会议":
                if item.get("style") in ["商务正式", "商务休闲"]:
                    match_clothes.append(item)
            elif scene == "日常通勤":
                if item.get("style") in ["休闲", "商务休闲", "日常"]:
                    match_clothes.append(item)
            else:
                match_clothes.append(item)
        
        # 检查是否缺少必要单品
        has_top = any(item.get("type") == "上装" for item in match_clothes)
        has_bottom = any(item.get("type") == "下装" for item in match_clothes)
        has_shoes = any(item.get("type") == "鞋子" for item in match_clothes)
        
        if not has_top:
            missing_items.append("上装")
        if not has_bottom:
            missing_items.append("下装")
        if not has_shoes:
            missing_items.append("鞋子")
        
        # 根据温度生成穿搭建议
        if temperature < 15:
            tips.append("天气较冷，建议添加外套")
        elif temperature > 28:
            tips.append("天气炎热，选择透气面料")
        
        # 根据场景生成穿搭建议
        if scene == "商务会议":
            tips.append("保持整洁干练，注意细节")
        elif scene == "日常通勤":
            tips.append("舒适为主，兼顾时尚")
        
        # 生成分析结果
        analysis_data = {
            "success": True,
            "data": {
                "match_clothes": match_clothes[:3],  # 最多返回3件
                "missing_items": missing_items,
                "tips": tips,
                "scene": scene,
                "temperature": temperature,
                "weather": weather
            }
        }
        
        return json.dumps(analysis_data)
    except Exception as e:
        error_data = {
            "success": False,
            "error": str(e)
        }
        return json.dumps(error_data)

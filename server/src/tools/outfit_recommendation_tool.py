"""
AI搭配推荐工具
使用LLM生成智能搭配建议
"""
from typing import List, Dict, Any, Optional
from langchain.tools import tool, ToolRuntime


@tool
def generate_outfit_recommendation(
    scene: str,
    temperature: float,
    purpose: Optional[str] = None,
    clothes_list: Optional[List[Dict[str, Any]]] = None,
    style_preference: Optional[str] = None,
    runtime: ToolRuntime = None
) -> str:
    """
    根据场景、温度和衣橱内容生成搭配建议
    
    使用场景：当用户需要穿搭建议时，结合场景、天气和现有衣服给出专业建议
    
    Args:
        scene: 场景（商务会议、休闲聚会、日常通勤、正式晚宴等）
        temperature: 温度（摄氏度）
        purpose: 今日目的（可选，如：面试、约会、运动等）
        clothes_list: 用户衣橱中的衣服列表（可选，如为空则推荐购买）
        style_preference: 风格偏好（可选，如：商务正式、休闲时尚等）
    
    Returns:
        搭配建议（JSON字符串格式），包含：
        - recommendation: 搭配方案描述
        - selected_items: 选中的衣服列表（如果有）
        - missing_items: 缺失的衣服建议购买
        - tips: 穿搭小贴士
        - color_scheme: 配色方案
    
    示例：
        generate_outfit_recommendation(
            scene="商务会议",
            temperature=22,
            purpose="重要客户见面",
            clothes_list=[...],
            style_preference="商务正式"
        )
    """
    import json
    
    # 如果没有提供衣服列表，直接推荐购买
    if not clothes_list or len(clothes_list) == 0:
        return json.dumps({
            'has_wardrobe': False,
            'recommendation': f'根据您的需求（场景：{scene}，温度：{temperature}°C），建议购买以下衣服：',
            'missing_items': _generate_purchase_list(scene, temperature),
            'tips': _generate_style_tips(scene),
            'color_scheme': _recommend_color_scheme(scene)
        }, ensure_ascii=False, indent=2)
    
    # 分析衣橱中的衣服
    wardrobe_analysis = _analyze_wardrobe(clothes_list, scene, temperature)
    
    # 生成搭配建议
    recommendation = {
        'has_wardrobe': True,
        'scene': scene,
        'temperature': temperature,
        'purpose': purpose,
        'recommendation': wardrobe_analysis['recommendation_text'],
        'selected_items': wardrobe_analysis['selected_items'],
        'missing_items': wardrobe_analysis['missing_items'],
        'tips': wardrobe_analysis['tips'],
        'color_scheme': wardrobe_analysis['color_scheme'],
        'confidence': wardrobe_analysis['confidence']
    }
    
    return json.dumps(recommendation, ensure_ascii=False, indent=2)


def _analyze_wardrobe(
    clothes_list: List[Dict[str, Any]],
    scene: str,
    temperature: float
) -> Dict[str, Any]:
    """分析衣橱内容，生成搭配建议"""
    
    # 按类型分组
    clothes_by_type = {}
    for cloth in clothes_list:
        cloth_type = cloth.get('type', '其他')
        if cloth_type not in clothes_by_type:
            clothes_by_type[cloth_type] = []
        clothes_by_type[cloth_type].append(cloth)
    
    # 根据场景和温度选择合适的衣服
    selected_items = []
    missing_items = []
    
    # 确定需要的衣服类型
    required_types = _get_required_types(scene, temperature)
    
    for required_type in required_types:
        if required_type in clothes_by_type and len(clothes_by_type[required_type]) > 0:
            # 从该类型中选择最合适的一件
            best_match = _select_best_match(
                clothes_by_type[required_type],
                scene,
                temperature
            )
            selected_items.append(best_match)
        else:
            # 缺失该类型
            missing_items.append({
                'type': required_type,
                'suggestion': f'缺少{required_type}，建议购买',
                'recommended_styles': _get_recommended_styles(required_type, scene)
            })
    
    # 生成配色方案
    color_scheme = _generate_color_scheme(selected_items)
    
    # 生成推荐文本
    recommendation_text = _generate_recommendation_text(
        selected_items,
        missing_items,
        scene,
        temperature
    )
    
    # 生成穿搭贴士
    tips = _generate_outfit_tips(scene, temperature, selected_items)
    
    # 计算置信度
    confidence = len(selected_items) / len(required_types) if required_types else 0
    
    return {
        'selected_items': selected_items,
        'missing_items': missing_items,
        'color_scheme': color_scheme,
        'recommendation_text': recommendation_text,
        'tips': tips,
        'confidence': confidence
    }


def _get_required_types(scene: str, temperature: float) -> List[str]:
    """根据场景和温度确定需要的衣服类型"""
    base_types = ['上装', '下装', '鞋子']
    
    # 根据温度添加外套
    if temperature < 20:
        base_types.insert(2, '外套')
    
    # 根据场景调整
    if scene == '运动健身':
        base_types = ['上装', '下装', '鞋子']
    elif scene == '正式晚宴':
        base_types = ['上装', '下装', '外套', '鞋子']
    
    return base_types


def _select_best_match(
    clothes: List[Dict[str, Any]],
    scene: str,
    temperature: float
) -> Dict[str, Any]:
    """从多个同类衣服中选择最合适的一件"""
    
    # 简单的评分机制
    scored_clothes = []
    for cloth in clothes:
        score = 0
        
        # 风格匹配
        cloth_style = cloth.get('style', '')
        target_styles = _get_style_by_scene(scene)
        if cloth_style in target_styles:
            score += 2
        
        # 季节匹配
        cloth_season = cloth.get('season', '')
        current_season = _get_season_by_temperature(temperature)
        if cloth_season == current_season or cloth_season == '四季':
            score += 1
        
        scored_clothes.append((score, cloth))
    
    # 返回得分最高的
    scored_clothes.sort(key=lambda x: x[0], reverse=True)
    return scored_clothes[0][1] if scored_clothes else clothes[0]


def _get_style_by_scene(scene: str) -> List[str]:
    """场景到风格的映射"""
    style_mapping = {
        '商务会议': ['商务正式', '经典优雅'],
        '休闲聚会': ['休闲时尚', '街头潮流'],
        '日常通勤': ['商务正式', '休闲时尚'],
        '正式晚宴': ['经典优雅', '商务正式'],
        '运动健身': ['运动休闲'],
        '约会': ['休闲时尚', '经典优雅'],
        '旅行': ['休闲时尚', '街头潮流']
    }
    
    # 处理自定义场景
    if scene not in style_mapping:
        # 根据场景关键词推理风格
        scene_lower = scene.lower()
        if any(keyword in scene_lower for keyword in ['商务', '会议', '办公', '工作']):
            return ['商务正式', '经典优雅']
        elif any(keyword in scene_lower for keyword in ['休闲', '聚会', '朋友', '周末']):
            return ['休闲时尚', '街头潮流']
        elif any(keyword in scene_lower for keyword in ['运动', '健身', '锻炼']):
            return ['运动休闲']
        elif any(keyword in scene_lower for keyword in ['约会', '恋爱', '浪漫']):
            return ['休闲时尚', '经典优雅']
        elif any(keyword in scene_lower for keyword in ['旅行', '旅游', '度假']):
            return ['休闲时尚', '街头潮流']
        elif any(keyword in scene_lower for keyword in ['正式', '晚宴', '婚礼']):
            return ['经典优雅', '商务正式']
        else:
            # 默认风格
            return ['休闲时尚']
    
    return style_mapping.get(scene, ['休闲时尚'])


def _get_season_by_temperature(temperature: float) -> str:
    """温度到季节的映射"""
    if temperature >= 28:
        return '夏'
    elif temperature >= 20:
        return '春'
    elif temperature >= 12:
        return '秋'
    else:
        return '冬'


def _get_recommended_styles(clothing_type: str, scene: str) -> List[str]:
    """获取推荐的衣服风格"""
    style_recommendations = {
        '上装': {
            '商务会议': ['衬衫', 'Polo衫'],
            '休闲聚会': ['T恤', '卫衣'],
            '正式晚宴': ['西装衬衫'],
            '日常通勤': ['衬衫', '针织衫']
        },
        '下装': {
            '商务会议': ['西裤', '休闲裤'],
            '休闲聚会': ['牛仔裤', '休闲裤'],
            '正式晚宴': ['西裤'],
            '日常通勤': ['休闲裤', '牛仔裤']
        },
        '外套': {
            '商务会议': ['西装外套', '风衣'],
            '休闲聚会': ['夹克', '棒球服'],
            '正式晚宴': ['西装外套'],
            '日常通勤': ['夹克', '风衣']
        },
        '鞋子': {
            '商务会议': ['皮鞋', '休闲皮鞋'],
            '休闲聚会': ['运动鞋', '休闲鞋'],
            '正式晚宴': ['皮鞋'],
            '日常通勤': ['休闲鞋', '皮鞋']
        }
    }
    
    # 处理自定义场景
    if scene not in style_recommendations.get(clothing_type, {}):
        # 根据场景关键词推理推荐款式
        scene_lower = scene.lower()
        if any(keyword in scene_lower for keyword in ['商务', '会议', '办公', '工作']):
            return style_recommendations.get(clothing_type, {}).get('商务会议', ['基础款'])
        elif any(keyword in scene_lower for keyword in ['休闲', '聚会', '朋友', '周末']):
            return style_recommendations.get(clothing_type, {}).get('休闲聚会', ['基础款'])
        elif any(keyword in scene_lower for keyword in ['正式', '晚宴', '婚礼']):
            return style_recommendations.get(clothing_type, {}).get('正式晚宴', ['基础款'])
        else:
            # 默认使用日常通勤的推荐款式
            return style_recommendations.get(clothing_type, {}).get('日常通勤', ['基础款'])
    
    return style_recommendations.get(clothing_type, {}).get(scene, ['基础款'])


def _generate_color_scheme(selected_items: List[Dict[str, Any]]) -> Dict[str, str]:
    """生成配色方案"""
    colors = {}
    for item in selected_items:
        cloth_type = item.get('type', '其他')
        color = item.get('color', '未知')
        colors[cloth_type] = color
    
    return {
        'main_colors': colors,
        'harmony_level': _evaluate_color_harmony(colors),
        'suggestion': _get_color_suggestion(colors)
    }


def _evaluate_color_harmony(colors: Dict[str, str]) -> str:
    """评估颜色和谐度"""
    # 简单的颜色和谐度评估
    color_list = list(colors.values())
    unique_colors = set(color_list)
    
    if len(unique_colors) <= 2:
        return '优秀'
    elif len(unique_colors) <= 3:
        return '良好'
    else:
        return '建议简化'


def _get_color_suggestion(colors: Dict[str, str]) -> str:
    """获取配色建议"""
    color_list = list(colors.values())
    unique_colors = set(color_list)
    
    if len(unique_colors) <= 2:
        return '配色简洁大方，整体协调'
    elif len(unique_colors) <= 3:
        return '配色较为丰富，注意主次分明'
    else:
        return '颜色较多，建议选择2-3种主色调'


def _generate_recommendation_text(
    selected_items: List[Dict[str, Any]],
    missing_items: List[Dict[str, Any]],
    scene: str,
    temperature: float
) -> str:
    """生成推荐文本"""
    
    text_parts = [f"根据您的需求（场景：{scene}，温度：{temperature}°C），为您推荐以下搭配：\n"]
    
    if selected_items:
        text_parts.append("✅ 现有衣服搭配：")
        for item in selected_items:
            name = item.get('name', '未知')
            cloth_type = item.get('type', '未知')
            color = item.get('color', '未知')
            style = item.get('style', '未知')
            text_parts.append(f"  • {cloth_type}：{name}（{color}，{style}风格）")
        text_parts.append("")
    
    # 生成详细的搭配理由
    text_parts.append("### 搭配理由：")
    
    # 场景适配性
    text_parts.append(f"1. **场景适配性**：考虑到{scene}的场合需求，选择的搭配风格能够展现您的专业或休闲形象，符合场合的着装要求。")
    
    # 温度适应性
    if temperature < 10:
        text_parts.append(f"2. **温度适应性**：当前温度较低（{temperature}°C），所选搭配注重保暖性，同时保持整体造型的协调。")
    elif temperature > 30:
        text_parts.append(f"2. **温度适应性**：当前温度较高（{temperature}°C），所选搭配采用透气性好的面料，确保舒适感。")
    else:
        text_parts.append(f"2. **温度适应性**：当前温度适中（{temperature}°C），所选搭配既不会过热也不会过冷，适合季节变化。")
    
    # 颜色搭配
    if selected_items:
        colors = [item.get('color', '未知') for item in selected_items]
        unique_colors = set(colors)
        text_parts.append(f"3. **颜色搭配**：整体配色以{', '.join(unique_colors)}为主，形成协调的色彩体系，视觉效果和谐统一。")
    
    # 风格一致性
    if selected_items:
        styles = [item.get('style', '未知') for item in selected_items]
        dominant_style = max(set(styles), key=styles.count)
        text_parts.append(f"4. **风格一致性**：整体风格以{dominant_style}为主，保持造型的统一性和完整性。")
    
    # 细节建议
    text_parts.append("5. **细节建议**：")
    text_parts.append("   • 可以搭配适当的配饰，如手表、皮带或领带，提升整体造型的精致度。")
    text_parts.append("   • 注意鞋子与整体搭配的协调性，选择合适的鞋款。")
    text_parts.append("   • 根据场合的正式程度，调整搭配的细节，如选择合适的袜子颜色。")
    
    if missing_items:
        text_parts.append("\n⚠️ 缺少的衣服：")
        for item in missing_items:
            text_parts.append(f"  • {item['type']}：{item['suggestion']}")
            if item.get('recommended_styles'):
                text_parts.append(f"    推荐款式：{', '.join(item['recommended_styles'])}")
            text_parts.append(f"    建议理由：在{scene}场景下，{item['type']}是必不可少的搭配单品，能够提升整体造型的完整性。")
    
    # 总结
    text_parts.append("\n### 总结：")
    text_parts.append(f"这套搭配专为{scene}场景设计，考虑了温度、风格和整体协调性，能够展现您的个人品味和专业形象。")
    
    return '\n'.join(text_parts)


def _generate_outfit_tips(
    scene: str,
    temperature: float,
    selected_items: List[Dict[str, Any]]
) -> List[str]:
    """生成穿搭贴士"""
    tips = []
    
    # 温度相关贴士
    if temperature < 10:
        tips.append('天气较冷，注意保暖，建议增加内搭')
    elif temperature > 30:
        tips.append('天气炎热，选择透气性好的面料')
    
    # 场景相关贴士
    scene_tips = {
        '商务会议': '保持整洁干练，注意细节',
        '休闲聚会': '可以尝试个性化的配饰',
        '正式晚宴': '注重整体质感，选择高品质面料',
        '运动健身': '选择吸汗透气的运动面料',
        '约会': '适当展现个人风格，不要太正式'
    }
    
    if scene in scene_tips:
        tips.append(scene_tips[scene])
    
    return tips


def _generate_purchase_list(scene: str, temperature: float) -> List[Dict[str, Any]]:
    """生成购买建议列表"""
    required_types = _get_required_types(scene, temperature)
    
    purchase_list = []
    for cloth_type in required_types:
        purchase_list.append({
            'type': cloth_type,
            'recommended_styles': _get_recommended_styles(cloth_type, scene),
            'budget_range': _get_budget_range(cloth_type),
            'color_suggestion': _get_color_suggestion_for_type(cloth_type, scene)
        })
    
    return purchase_list


def _get_budget_range(clothing_type: str) -> str:
    """获取预算范围"""
    budget_ranges = {
        '上装': '100-500元',
        '下装': '150-600元',
        '外套': '200-1000元',
        '鞋子': '200-800元'
    }
    return budget_ranges.get(clothing_type, '100-500元')


def _get_color_suggestion_for_type(clothing_type: str, scene: str) -> List[str]:
    """为特定类型的衣服推荐颜色"""
    color_suggestions = {
        '上装': {
            '商务会议': ['白色', '浅蓝色', '灰色'],
            '休闲聚会': ['白色', '黑色', '灰色'],
            '正式晚宴': ['白色', '浅蓝色'],
            '日常通勤': ['白色', '浅蓝色', '灰色']
        },
        '下装': {
            '商务会议': ['深蓝色', '黑色', '灰色'],
            '休闲聚会': ['深蓝色', '黑色', '卡其色'],
            '正式晚宴': ['黑色', '深蓝色'],
            '日常通勤': ['深蓝色', '黑色', '灰色']
        },
        '外套': {
            '商务会议': ['深蓝色', '灰色', '黑色'],
            '休闲聚会': ['黑色', '深蓝色', '卡其色'],
            '正式晚宴': ['黑色', '深蓝色'],
            '日常通勤': ['深蓝色', '灰色', '黑色']
        },
        '鞋子': {
            '商务会议': ['黑色', '深棕色'],
            '休闲聚会': ['白色', '黑色'],
            '正式晚宴': ['黑色'],
            '日常通勤': ['黑色', '深棕色', '白色']
        }
    }
    return color_suggestions.get(clothing_type, {}).get(scene, ['黑色', '白色', '灰色'])


def _generate_style_tips(scene: str) -> List[str]:
    """生成风格贴士"""
    style_tips = {
        '商务会议': [
            '选择合身的西装或正装',
            '颜色以深色系为主',
            '注意领带、皮带等配饰的搭配',
            '皮鞋要擦亮'
        ],
        '休闲聚会': [
            '可以选择舒适的休闲装',
            '颜色可以更加活泼',
            '适当展现个人风格',
            '运动鞋或休闲鞋皆可'
        ],
        '正式晚宴': [
            '选择正式的西装礼服',
            '颜色以黑色、深蓝色为主',
            '注意面料的质感',
            '配饰要精致'
        ],
        '日常通勤': [
            '选择舒适且得体的商务休闲装',
            '颜色以中性色为主',
            '可以搭配休闲外套',
            '鞋子选择舒适的休闲皮鞋或乐福鞋'
        ]
    }
    return style_tips.get(scene, ['选择适合场合的服装', '注意整体协调', '保持整洁'])


def _recommend_color_scheme(scene: str) -> Dict[str, Any]:
    """推荐配色方案"""
    color_schemes = {
        '商务会议': {
            'primary': '深蓝色',
            'secondary': '白色',
            'accent': '灰色',
            'description': '经典的商务配色，稳重专业'
        },
        '休闲聚会': {
            'primary': '卡其色',
            'secondary': '白色',
            'accent': '深蓝色',
            'description': '轻松休闲的配色，自然舒适'
        },
        '正式晚宴': {
            'primary': '黑色',
            'secondary': '白色',
            'accent': '深蓝色',
            'description': '正式优雅的配色，庄重大方'
        },
        '日常通勤': {
            'primary': '深蓝色',
            'secondary': '灰色',
            'accent': '白色',
            'description': '简洁大方的配色，适合日常'
        }
    }
    
    # 处理自定义场景
    if scene not in color_schemes:
        # 根据场景关键词推理配色方案
        scene_lower = scene.lower()
        if any(keyword in scene_lower for keyword in ['商务', '会议', '办公', '工作']):
            return color_schemes.get('商务会议', {
                'primary': '深蓝色',
                'secondary': '白色',
                'accent': '灰色',
                'description': '经典的商务配色，稳重专业'
            })
        elif any(keyword in scene_lower for keyword in ['休闲', '聚会', '朋友', '周末']):
            return color_schemes.get('休闲聚会', {
                'primary': '卡其色',
                'secondary': '白色',
                'accent': '深蓝色',
                'description': '轻松休闲的配色，自然舒适'
            })
        elif any(keyword in scene_lower for keyword in ['正式', '晚宴', '婚礼']):
            return color_schemes.get('正式晚宴', {
                'primary': '黑色',
                'secondary': '白色',
                'accent': '深蓝色',
                'description': '正式优雅的配色，庄重大方'
            })
        else:
            # 默认使用日常通勤的配色方案
            return color_schemes.get('日常通勤', {
                'primary': '深蓝色',
                'secondary': '灰色',
                'accent': '白色',
                'description': '简洁大方的配色，适合日常'
            })
    
    return color_schemes.get(scene, {
        'primary': '黑色',
        'secondary': '白色',
        'accent': '灰色',
        'description': '经典的百搭配色'
    })

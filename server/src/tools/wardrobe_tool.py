"""
衣橱查询工具
对接网站的衣橱数据库
"""
import json


def query_user_wardrobe(user_id: int) -> str:
    """
    查询用户衣橱
    
    Args:
        user_id: 用户ID
        
    Returns:
        JSON字符串，包含用户衣橱衣物列表
    """
    try:
        # 这里模拟衣橱查询结果
        # 实际应该对接网站的衣橱数据库
        wardrobe_data = {
            "success": True,
            "clothes_list": [
                {
                    "id": 1,
                    "name": "白色衬衫",
                    "type": "上装",
                    "color": "白色",
                    "style": "商务正式",
                    "season": "四季",
                    "image_url": "https://example.com/shirt1.jpg"
                },
                {
                    "id": 2,
                    "name": "黑色西裤",
                    "type": "下装",
                    "color": "黑色",
                    "style": "商务正式",
                    "season": "四季",
                    "image_url": "https://example.com/pants1.jpg"
                },
                {
                    "id": 3,
                    "name": "黑色皮鞋",
                    "type": "鞋子",
                    "color": "黑色",
                    "style": "商务正式",
                    "season": "四季",
                    "image_url": "https://example.com/shoes1.jpg"
                },
                {
                    "id": 4,
                    "name": "休闲牛仔裤",
                    "type": "下装",
                    "color": "蓝色",
                    "style": "休闲",
                    "season": "四季",
                    "image_url": "https://example.com/pants2.jpg"
                },
                {
                    "id": 5,
                    "name": "休闲运动鞋",
                    "type": "鞋子",
                    "color": "白色",
                    "style": "休闲",
                    "season": "四季",
                    "image_url": "https://example.com/shoes2.jpg"
                }
            ]
        }
        return json.dumps(wardrobe_data)
    except Exception as e:
        error_data = {
            "success": False,
            "error": str(e)
        }
        return json.dumps(error_data)

from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass
class Clothing:
    """衣橱衣服数据模型"""
    id: int
    name: str
    type: str  # 衣服类型：上衣/裤子/鞋子
    style: str  # 款式：西装/休闲裤等
    season: str  # 季节：春/夏/秋/冬
    occasion: str  # 适用场景：商务/休闲等
    fashion_style: str  # 风格：简约/复古等
    color: str  # 颜色
    material: str  # 材质
    price: Optional[float]  # 价格
    image_url: str  # 图片URL
    description: Optional[str]  # 描述
    created_at: datetime  # 创建时间
    updated_at: datetime  # 更新时间

    def to_dict(self):
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "style": self.style,
            "season": self.season,
            "occasion": self.occasion,
            "fashion_style": self.fashion_style,
            "color": self.color,
            "material": self.material,
            "price": self.price,
            "image_url": self.image_url,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

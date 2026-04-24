"""
AI搭配推荐API服务
提供RESTful API接口供前端系统调用
"""
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import sys
import base64
import time
import logging
import uuid
import tempfile
from pathlib import Path
from starlette.responses import FileResponse
import requests
from decouple import config as env_config

# 添加 src 目录到Python路径（确保可 import tools / agents 等模块）
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

try:
    from coze_coding_dev_sdk.s3 import S3SyncStorage
except Exception:
    S3SyncStorage = None

logger = logging.getLogger("ai_outfit_api")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

_local_dir = Path(tempfile.gettempdir()) / "ai_outfit_uploads"
_local_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AI搭配推荐API",
    description="智能搭配推荐和虚拟试衣服务",
    version="1.0.0"
)

# 配置CORS，允许前端跨域访问
_cors_raw = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_ORIGIN") or os.getenv("PUBLIC_BASE_URL") or ""
_cors_origins = [v.strip() for v in str(_cors_raw).split(",") if v.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["https://cls.troby.cn"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 请求模型 ====================

class ClothesItem(BaseModel):
    """衣服数据模型"""
    id: int
    name: str
    type: str  # 上装、下装、外套、鞋子
    color: str
    style: Optional[str] = None
    season: Optional[str] = None
    pattern: Optional[str] = None
    material: Optional[str] = None
    image_url: Optional[str] = None


class OutfitRecommendRequest(BaseModel):
    """搭配推荐请求"""
    # 兼容前端字段：scene / occasion
    scene: Optional[str] = None  # 场景
    occasion: Optional[str] = None  # 场合（兼容字段）
    # 兼容前端字段：temperature / tempC
    temperature: Optional[float] = None  # 温度
    tempC: Optional[float] = None  # 摄氏温度（兼容字段）
    purpose: Optional[str] = None  # 目的
    clothes_list: List[ClothesItem] = []  # 用户衣橱数据
    style_preference: Optional[str] = None  # 风格偏好
    style: Optional[str] = None  # 风格（兼容字段）
    mock: bool = False


class VirtualTryonRequest(BaseModel):
    """虚拟试衣请求"""
    person_image_url: Optional[str] = None  # 人物照片URL
    person_image_base64: Optional[str] = None  # 人物照片base64
    garment_image_url: Optional[str] = None  # 衣服照片URL
    garment_image_base64: Optional[str] = None  # 衣服照片base64
    garment_type: str = "top"  # 衣服类型：top/bottom/dress
    user_id: Optional[int] = None  # 用户ID（可选）
    mock: bool = False


class WardrobeQueryRequest(BaseModel):
    """衣橱查询请求（用于数据库查询）"""
    user_id: int
    db_host: Optional[str] = None
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None


# ==================== API端点 ====================

@app.get("/")
async def root():
    """API根路径"""
    return {
        "message": "AI搭配推荐API服务",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/outfit/recommend": "生成搭配推荐",
            "POST /api/virtual-tryon": "虚拟试衣",
            "GET /api/weather/query": "查询天气（用于地图选点）",
            "POST /api/weather/query": "查询天气（用于地图选点）",
            "POST /api/upload/image": "上传图片（文件）",
            "POST /api/upload/base64": "上传图片（base64）",
            "POST /api/wardrobe/query": "查询衣橱（需要数据库配置）",
            "GET /health": "健康检查"
        }
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "service": "AI搭配推荐API"}

async def _fetch_weather(lat: float, lon: float, unit: str) -> Dict[str, Any]:
    unit = (unit or "C").upper()
    temperature_unit = "fahrenheit" if unit == "F" else "celsius"
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
        "temperature_unit": temperature_unit,
        "wind_speed_unit": "ms"
    }
    r = requests.get(url, params=params, headers={"User-Agent": "VirtualMenswear/1.0"}, timeout=6)
    r.raise_for_status()
    j = r.json() or {}
    cur = j.get("current") or {}
    temp = cur.get("temperature_2m")
    feels = cur.get("apparent_temperature")
    humidity = cur.get("relative_humidity_2m")
    wind = cur.get("wind_speed_10m")
    code = cur.get("weather_code")
    weather_type = _weather_code_to_text(code)
    if unit == "F":
        tempF = temp
        tempC = (tempF - 32) * 5 / 9 if isinstance(tempF, (int, float)) else None
    else:
        tempC = temp
        tempF = tempC * 9 / 5 + 32 if isinstance(tempC, (int, float)) else None
    return {
        "temperature": round(temp, 1) if isinstance(temp, (int, float)) else None,
        "feels_like": round(feels, 1) if isinstance(feels, (int, float)) else None,
        "humidity": int(humidity) if isinstance(humidity, (int, float)) else None,
        "wind_speed": round(wind, 1) if isinstance(wind, (int, float)) else None,
        "weather_type": weather_type,
        "weather_code": code,
        "unit": unit,
        "tempC": round(tempC, 1) if isinstance(tempC, (int, float)) else None,
        "tempF": round(tempF, 1) if isinstance(tempF, (int, float)) else None,
        "wind": round(wind, 1) if isinstance(wind, (int, float)) else None,
        "condition": code
    }

def _weather_code_to_text(code: Any) -> str:
    try:
        c = int(code)
    except Exception:
        return "未知"

    if c == 0:
        return "晴"
    if c in (1, 2, 3):
        return "多云"
    if c in (45, 48):
        return "雾"
    if c in (51, 53, 55, 56, 57):
        return "毛毛雨"
    if c in (61, 63, 65, 66, 67):
        return "雨"
    if c in (71, 73, 75, 77):
        return "雪"
    if c in (80, 81, 82):
        return "阵雨"
    if c in (85, 86):
        return "阵雪"
    if c in (95, 96, 99):
        return "雷暴"
    return "未知"

@app.get("/api/weather/query")
async def weather_query(lat: float, lon: float, unit: str = "C"):
    try:
        data = await _fetch_weather(lat, lon, unit)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"天气查询失败：{str(e)}")

class WeatherQueryBody(BaseModel):
    lat: float
    lon: float
    unit: Optional[str] = "C"

@app.post("/api/weather/query")
async def weather_query_post(body: WeatherQueryBody):
    try:
        data = await _fetch_weather(body.lat, body.lon, body.unit or "C")
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"天气查询失败：{str(e)}")

def _store_image(file_bytes: bytes, file_name: str) -> Dict[str, str]:
    if S3SyncStorage is not None and os.getenv("COZE_BUCKET_NAME") and os.getenv("COZE_BUCKET_ENDPOINT_URL"):
        storage = S3SyncStorage(
            endpoint_url=os.getenv("COZE_BUCKET_ENDPOINT_URL"),
            access_key=os.getenv("COZE_BUCKET_ACCESS_KEY", ""),
            secret_key=os.getenv("COZE_BUCKET_SECRET_KEY", ""),
            bucket_name=os.getenv("COZE_BUCKET_NAME"),
            region=os.getenv("COZE_BUCKET_REGION", "cn-beijing"),
        )
        key = storage.upload_file(
            file_content=file_bytes,
            file_name=f"virtual-tryon/{int(time.time())}_{file_name}",
            content_type="image/png" if file_name.lower().endswith(".png") else "image/jpeg"
        )
        url = storage.generate_presigned_url(key=key, expire_time=86400)
        return { "image_url": url, "image_key": key }

    ext = ".png" if file_name.lower().endswith(".png") else ".jpg"
    key = f"{uuid.uuid4().hex}{ext}"
    path = _local_dir / key
    path.write_bytes(file_bytes)
    return { "image_url": f"/files/{key}", "image_key": key }

@app.get("/files/{key}")
async def get_file(key: str):
    p = (_local_dir / key).resolve()
    if not str(p).startswith(str(_local_dir.resolve())) or not p.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(str(p))

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        out = _store_image(raw, file.filename or "image.jpg")
        return { "success": True, "image_url": out["image_url"], "image_key": out["image_key"], "message": "图片上传成功" }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图片上传失败：{str(e)}")

@app.post("/api/upload/base64")
async def upload_base64(image_base64: str, file_name: str = "image.jpg"):
    try:
        pure = image_base64.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", "")
        raw = base64.b64decode(pure)
        out = _store_image(raw, file_name)
        return { "success": True, "image_url": out["image_url"], "image_key": out["image_key"], "message": "图片上传成功" }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Base64上传失败：{str(e)}")

def _is_mock(person_url: Optional[str], garment_url: Optional[str], mock_flag: bool) -> bool:
    if mock_flag:
        return True
    if person_url and "example.com" in person_url:
        return True
    if garment_url and "example.com" in garment_url:
        return True
    return False


@app.post("/api/outfit/recommend")
async def recommend_outfit(request: OutfitRecommendRequest):
    """
    生成搭配推荐
    
    **请求示例：**
    ```json
    {
      "scene": "商务会议",
      "temperature": 22,
      "purpose": "重要客户见面",
      "clothes_list": [
        {
          "id": 1,
          "name": "白色衬衫",
          "type": "上装",
          "color": "白色",
          "style": "商务正式",
          "season": "四季",
          "image_url": "https://..."
        }
      ]
    }
    ```
    
    **返回示例：**
    ```json
    {
      "success": true,
      "data": {
        "scene": "商务会议",
        "temperature": 22,
        "selected_items": [...],
        "missing_items": [...],
        "tips": [...],
        "color_scheme": {...},
        "confidence": 1.0
      }
    }
    ```
    """
    try:
        clothes_list = [item.dict() for item in request.clothes_list]
        scene = (request.scene or request.occasion or "").strip()
        if not scene:
            raise ValueError("缺少 scene（或 occasion）")
        temperature = request.temperature if request.temperature is not None else request.tempC
        if temperature is None:
            raise ValueError("缺少 temperature（或 tempC）")

        style_pref = request.style_preference or request.style

        if request.mock:
            data = _mock_outfit(scene, float(temperature), request.purpose, clothes_list, style_pref)
            return { "success": True, "data": data, "message": "mock" }

        try:
            from tools.outfit_recommendation_tool import generate_outfit_recommendation
            import json
            result_json = generate_outfit_recommendation.invoke({
                "scene": scene,
                "temperature": float(temperature),
                "purpose": request.purpose,
                "clothes_list": clothes_list,
                "style_preference": style_pref
            })
            result = json.loads(result_json)
            data = _normalize_recommend_result(result, scene, float(temperature))
            return { "success": True, "data": data, "message": "搭配推荐生成成功" }
        except Exception as tool_err:
            # 真实环境依赖缺失时不再 500，直接返回模拟结果，保证前端可跑通
            msg = str(tool_err)
            if "No module named 'langchain'" in msg or "langchain" in msg:
                data = _mock_outfit(scene, float(temperature), request.purpose, clothes_list, style_pref)
                data["warning"] = "langchain 依赖缺失，已返回模拟推荐"
                return { "success": True, "data": data, "message": "mock_fallback" }
            raise tool_err
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搭配推荐失败：{str(e)}")

def _normalize_recommend_result(result: Dict[str, Any], scene: str, temperature: float) -> Dict[str, Any]:
    selected = result.get("selected_items") or []
    reason = result.get("recommendation") or result.get("recommendation_text") or result.get("reason") or ""
    if not reason and isinstance(result, dict):
        reason = f"根据场景「{scene}」与温度 {temperature}°C，从衣橱中优先挑选更符合风格与季节的单品，并保持配色与版型协调。"
    missing_items = result.get("missing_items") or []
    if (not selected) and missing_items:
        items = []
        for m in missing_items[:6]:
            if isinstance(m, dict):
                t = m.get("type") or "单品"
                styles = m.get("recommended_styles") or []
                ex = styles[0] if isinstance(styles, list) and styles else "基础款"
                items.append({"id": 0, "type": t, "name": f"建议购买：{ex}", "color": "", "image_url": ""})
            elif isinstance(m, str):
                items.append({"id": 0, "type": "单品", "name": f"建议购买：{m}", "color": "", "image_url": ""})
        selected = items
    return {
        "scene": result.get("scene") or scene,
        "temperature": result.get("temperature") or temperature,
        "items": selected,
        "reason": reason,
        "selected_items": selected,
        "missing_items": missing_items,
        "tips": result.get("tips") or [],
        "color_scheme": result.get("color_scheme") or None,
        "confidence": result.get("confidence")
    }

def _mock_outfit(scene: str, temperature: float, purpose: Optional[str], clothes_list: List[Dict[str, Any]], style: Optional[str]) -> Dict[str, Any]:
    # 固定返回两类场景的示例，确保前端可展示“衣物列表+理由”
    if "约会" in scene or "休闲" in scene:
        items = [
            {"id": 0, "type": "上装", "name": "浅色针织/白T（示例）", "color": "白色", "image_url": ""},
            {"id": 0, "type": "下装", "name": "深色牛仔裤/休闲裤（示例）", "color": "深蓝色", "image_url": ""},
            {"id": 0, "type": "鞋子", "name": "小白鞋/休闲鞋（示例）", "color": "白色", "image_url": ""}
        ]
        reason = f"场景为「{scene}」，建议以干净清爽的中性色为主，避免过强对比。温度 {temperature}°C 时，上身选择透气但有层次的单品（如针织/长袖T）更适合室内外切换；下装用深色提高整体利落感；鞋子建议舒适耐走，整体风格更亲近自然。{(' 目的：'+purpose+'。') if purpose else ''}"
    else:
        items = [
            {"id": 0, "type": "上装", "name": "白衬衫/浅色衬衫（示例）", "color": "白色", "image_url": ""},
            {"id": 0, "type": "下装", "name": "深色西裤/休闲西裤（示例）", "color": "深蓝色", "image_url": ""},
            {"id": 0, "type": "鞋子", "name": "黑色皮鞋/商务休闲鞋（示例）", "color": "黑色", "image_url": ""}
        ]
        reason = f"场景为「{scene}」，整体建议偏商务干练：上装用浅色衬衫提亮并增强正式度；下装选择深色直筒版型保证比例与稳重感；鞋子选择深色皮鞋统一色调。温度 {temperature}°C 时如有风可加轻薄外套或西装外套，既保暖又强化场合匹配。{(' 目的：'+purpose+'。') if purpose else ''}"

    # 简单提示衣橱缺失（不依赖复杂工具）
    existing_types = set([c.get("type") for c in clothes_list if c.get("type")])
    missing_items = []
    for t in ("上装", "下装", "鞋子"):
        if t not in existing_types:
            missing_items.append({"type": t, "suggestion": f"缺少{t}，建议补充 1-2 件基础款"})

    return {
        "scene": scene,
        "temperature": temperature,
        "items": items,
        "reason": reason,
        "selected_items": items,
        "missing_items": missing_items,
        "tips": ["优先选择基础色（黑白灰蓝卡其）做主色，再用小面积配饰点缀。", "注意版型统一：上宽下窄或上窄下宽保持平衡。"],
        "color_scheme": {"primary": "中性色", "accent": "低饱和点缀"},
        "confidence": 0.5
    }


@app.post("/api/virtual-tryon")
async def virtual_tryon(request: VirtualTryonRequest):
    """
    虚拟试衣
    
    **请求示例：**
    ```json
    {
      "person_image_url": "https://your-person-photo.jpg",
      "garment_image_url": "https://your-shirt-photo.jpg",
      "garment_type": "top"
    }
    ```
    
    **返回示例：**
    ```json
    {
      "success": true,
      "data": {
        "image_url": "https://result-image.jpg",
        "garment_type": "top",
        "status": "success"
      }
    }
    ```
    """
    try:
        if _is_mock(request.person_image_url, request.garment_image_url, request.mock):
            return {
                "success": True,
                "data": {
                    "image_url": "https://example.com/result-image.jpg",
                    "garment_type": request.garment_type,
                    "status": "success",
                    "message": "mock_mode"
                }
            }

        person_url = request.person_image_url
        garment_url = request.garment_image_url

        if request.person_image_base64 and not person_url:
            pure = request.person_image_base64.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", "")
            out = _store_image(base64.b64decode(pure), "person.jpg")
            person_url = out["image_url"]
        if request.garment_image_base64 and not garment_url:
            pure = request.garment_image_base64.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", "")
            out = _store_image(base64.b64decode(pure), "garment.png")
            garment_url = out["image_url"]

        if not person_url or not garment_url:
            raise ValueError("缺少人物或衣服图片（URL/base64 至少提供一种）")

        if person_url.startswith("/"):
            person_url = f"{env_config('PUBLIC_BASE_URL', default=os.getenv('PUBLIC_BASE_URL', 'https://cls.troby.cn')).rstrip('/')}{person_url}"
        if garment_url.startswith("/"):
            garment_url = f"{env_config('PUBLIC_BASE_URL', default=os.getenv('PUBLIC_BASE_URL', 'https://cls.troby.cn')).rstrip('/')}{garment_url}"

        from tools.virtual_tryon_tool import virtual_tryon as tryon_tool

        logger.info("tryon_request garment_type=%s person_url=%s garment_url=%s", request.garment_type, person_url[:64], garment_url[:64])

        result = tryon_tool.invoke({
            "person_image_url": person_url,
            "garment_image_url": garment_url,
            "garment_type": request.garment_type
        })
        
        # 解析结果
        if "试衣成功" in result:
            # 提取图片URL
            import re
            url_match = re.search(r'效果图URL：(http[^\s]+)', result)
            image_url = url_match.group(1) if url_match else None
            
            return {
                "success": True,
                "data": {
                    "image_url": image_url,
                    "garment_type": request.garment_type,
                    "status": "success",
                    "message": "试衣成功"
                }
            }
        else:
            return {
                "success": False,
                "data": {
                    "status": "failed",
                    "message": result
                }
            }
            
    except Exception as e:
        logger.exception("virtual_tryon_failed")
        raise HTTPException(status_code=500, detail=f"虚拟试衣失败：{str(e)}")


@app.post("/api/wardrobe/query")
async def query_wardrobe(request: WardrobeQueryRequest):
    """
    查询用户衣橱（从数据库）
    
    **注意**：此接口需要数据库配置信息
    
    **请求示例：**
    ```json
    {
      "user_id": 123,
      "db_host": "localhost",
      "db_name": "virtual_menswear",
      "db_user": "root",
      "db_password": "password"
    }
    ```
    
    **返回示例：**
    ```json
    {
      "success": true,
      "data": {
        "user_id": 123,
        "clothes_list": [
          {
            "id": 1,
            "name": "白色衬衫",
            "type": "上装",
            ...
          }
        ],
        "total_count": 10
      }
    }
    ```
    """
    try:
        from tools.database_tool import query_user_wardrobe
        
        # 查询数据库
        clothes_list = query_user_wardrobe(
            user_id=request.user_id,
            db_host=request.db_host,
            db_name=request.db_name,
            db_user=request.db_user,
            db_password=request.db_password
        )
        
        return {
            "success": True,
            "data": {
                "user_id": request.user_id,
                "clothes_list": clothes_list,
                "total_count": len(clothes_list)
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询衣橱失败：{str(e)}")


@app.post("/api/outfit/try-complete")
async def try_complete_outfit(
    person_image_url: str,
    outfit_items: List[Dict[str, Any]]
):
    """
    整套试衣（依次试穿多件衣服）
    
    **请求示例：**
    ```json
    {
      "person_image_url": "https://your-photo.jpg",
      "outfit_items": [
        {
          "garment_image_url": "https://shirt.jpg",
          "garment_type": "top"
        },
        {
          "garment_image_url": "https://pants.jpg",
          "garment_type": "bottom"
        }
      ]
    }
    ```
    
    **返回示例：**
    ```json
    {
      "success": true,
      "data": {
        "final_image_url": "https://final-result.jpg",
        "steps": [...],
        "status": "success"
      }
    }
    ```
    """
    try:
        from tools.virtual_tryon_tool import virtual_tryon as tryon_tool
        
        current_person_url = person_image_url
        steps = []
        
        # 依次试穿每件衣服
        for item in outfit_items:
            result = tryon_tool.invoke({
                "person_image_url": current_person_url,
                "garment_image_url": item["garment_image_url"],
                "garment_type": item["garment_type"]
            })
            
            if "试衣成功" in result:
                # 提取图片URL
                import re
                url_match = re.search(r'效果图URL：(http[^\s]+)', result)
                if url_match:
                    current_person_url = url_match.group(1)
                    steps.append({
                        "garment_type": item["garment_type"],
                        "status": "success",
                        "image_url": current_person_url
                    })
            else:
                steps.append({
                    "garment_type": item["garment_type"],
                    "status": "failed",
                    "message": result
                })
        
        return {
            "success": True,
            "data": {
                "final_image_url": current_person_url if current_person_url != person_image_url else None,
                "steps": steps,
                "status": "success"
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"整套试衣失败：{str(e)}")


# ==================== 启动配置 ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

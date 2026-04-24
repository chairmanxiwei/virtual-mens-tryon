from fastapi import FastAPI, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
import base64
import logging
import os
import tempfile
import time
import uuid
import threading
from pathlib import Path
import requests
from dotenv import load_dotenv
from decouple import config as env_config
from urllib.parse import urlparse
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError

_here = Path(__file__).resolve()
BASE_DIR = _here.parents[3]
# 修复 .env 文件路径，指向项目根目录
_project_root_env = BASE_DIR / ".env"

# 加载 .env 文件
try:
    load_dotenv(dotenv_path=str(_project_root_env), override=True)
except Exception:
    load_dotenv(dotenv_path=str(_project_root_env), override=True)

_FORCED_ENV_PATH = str(_project_root_env)


DB_HOST = str(env_config("DB_HOST", default=os.getenv("DB_HOST", "127.0.0.1"))).strip()
DB_PORT = int(env_config("DB_PORT", default=os.getenv("DB_PORT", "3306")))
DB_USER = str(env_config("DB_USER", default=os.getenv("DB_USER", ""))).strip()
DB_PASS = str(env_config("DB_PASS", default=os.getenv("DB_PASS") or os.getenv("DB_PASSWORD") or "")).strip()
DB_NAME = str(env_config("DB_NAME", default=os.getenv("DB_NAME", ""))).strip()
DEFAULT_USER_ID = 1


logger = logging.getLogger("ai_outfit_api_v3")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

APP_HOST = str(env_config("APP_HOST", default=os.getenv("APP_HOST", "127.0.0.1"))).strip()
APP_PORT = int(env_config("APP_PORT", default=os.getenv("APP_PORT", "8000")))
PUBLIC_BASE_URL = str(env_config("PUBLIC_BASE_URL", default=os.getenv("PUBLIC_BASE_URL", f"http://{APP_HOST}:{APP_PORT}"))).strip().rstrip("/")
_internal_hosts_raw = os.getenv("INTERNAL_FETCH_HOSTS", "localhost,127.0.0.1,::1")
INTERNAL_FETCH_HOSTS = {v.strip().lower() for v in _internal_hosts_raw.split(",") if v.strip()}

_local_dir = Path(tempfile.gettempdir()) / "ai_outfit_uploads_v3"
_local_dir.mkdir(parents=True, exist_ok=True)

_perf_lock = threading.Lock()
_perf_recent_slow = deque(maxlen=200)
_perf_stats: Dict[str, Any] = {
    "requests_total": 0,
    "requests_slow": 0,
    "requests_errors": 0,
    "by_path": {},
}

# 任务队列和线程池
_task_queue = deque(maxlen=1000)
_task_results: Dict[str, Dict[str, Any]] = {}
_task_lock = threading.Lock()
_task_executor = ThreadPoolExecutor(max_workers=5)

# 试衣图缓存
_tryon_cache: Dict[str, Dict[str, Any]] = {}
_tryon_cache_lock = threading.Lock()
_tryon_cache_ttl = 7 * 24 * 60 * 60  # 7天


def _get_tryon_cache_key(person_url: str, garment_url: str, garment_type: str) -> str:
    """生成试衣缓存键"""
    import hashlib
    key = f"{person_url}|{garment_url}|{garment_type}"
    return hashlib.md5(key.encode()).hexdigest()


def _perf_record(path: str, method: str, status_code: int, duration_ms: float, request_id: str) -> None:
    slow_ms = int(os.getenv("SLOW_REQUEST_MS") or "2000")
    is_slow = duration_ms >= slow_ms
    with _perf_lock:
        _perf_stats["requests_total"] += 1
        if status_code >= 500:
            _perf_stats["requests_errors"] += 1
        by_path = _perf_stats["by_path"].setdefault(f"{method} {path}", {"count": 0, "slow": 0, "p95_ms_approx": 0})
        by_path["count"] += 1
        if is_slow:
            by_path["slow"] += 1
            _perf_stats["requests_slow"] += 1
            _perf_recent_slow.append(
                {"request_id": request_id, "method": method, "path": path, "status_code": status_code, "duration_ms": int(duration_ms)}
            )
        if by_path["count"] % 20 == 0:
            by_path["p95_ms_approx"] = max(int(by_path["p95_ms_approx"]), int(duration_ms))


def ok(data: Any = None, message: str = "ok") -> JSONResponse:
    return JSONResponse(status_code=200, content={"success": True, "data": data if data is not None else {}, "message": message})


def fail(message: str, data: Any = None) -> JSONResponse:
    return JSONResponse(status_code=200, content={"success": False, "data": data if data is not None else {}, "message": message})


def _require_mysql_env() -> None:
    missing = []
    if not DB_USER:
        missing.append("DB_USER")
    if not DB_PASS:
        missing.append("DB_PASS")
    if not DB_NAME:
        missing.append("DB_NAME")
    if missing:
        raise Exception(f"MySQL 环境变量未配置完整：{', '.join(missing)}")


def _mysql_connect():
    _require_mysql_env()
    import pymysql
    from pymysql.cursors import DictCursor
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True,
        connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT") or "5"),
        read_timeout=int(os.getenv("DB_READ_TIMEOUT") or "20"),
        write_timeout=int(os.getenv("DB_WRITE_TIMEOUT") or "20"),
    )


def _get_request_user_id(request: Request) -> int:
    user_id_str = request.cookies.get("user_id")
    if not user_id_str:
        return DEFAULT_USER_ID
    try:
        user_id = int(user_id_str)
        return user_id if user_id > 0 else DEFAULT_USER_ID
    except Exception:
        return DEFAULT_USER_ID


def weather_code_to_text(code: Any) -> str:
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


def fetch_weather_by_location(location: str, unit: str = "C") -> Dict[str, Any]:
    """根据所在地名称获取天气"""
    unit = (unit or "C").upper()
    cache_ttl = int(os.getenv("WEATHER_CACHE_TTL") or "600")
    cache_key = f"loc:{unit}:{(location or '').strip().lower()}"
    now = time.time()
    try:
        cached = _perf_stats.get("weather_cache", {}).get(cache_key)
        if cached and (now - float(cached.get("ts") or 0)) < cache_ttl:
            return cached.get("value") or {}
    except Exception:
        pass
    amap_api_key = os.getenv("AMAP_API_KEY")
    
    # 尝试使用高德地图 API
    if amap_api_key:
        try:
            # 先通过地址获取城市编码
            geo_url = "https://restapi.amap.com/v3/geocode/geo"
            geo_params = {
                "key": amap_api_key,
                "address": location,
                "output": "json"
            }
            
            geo_r = requests.get(geo_url, params=geo_params, timeout=6)
            geo_r.raise_for_status()
            geo_j = geo_r.json() or {}
            
            if geo_j.get("status") != "1":
                logger.error(f"Geocoding failed: {geo_j.get('info', 'Unknown error')}")
            else:
                geocodes = geo_j.get("geocodes", [])
                if geocodes:
                    city_code = geocodes[0].get("citycode")
                    if city_code:
                        # 获取天气信息
                        weather_url = "https://restapi.amap.com/v3/weather/weatherInfo"
                        weather_params = {
                            "key": amap_api_key,
                            "city": city_code,
                            "extensions": "base",
                            "output": "json"
                        }
                        
                        r = requests.get(weather_url, params=weather_params, timeout=6)
                        r.raise_for_status()
                        j = r.json() or {}
                        
                        if j.get("status") == "1":
                            weather_data = j.get("lives", [])[0] if j.get("lives") else {}
                            temp = weather_data.get("temperature", 0)
                            temp = float(temp) if temp is not None else 20.0
                            feels = temp  # 高德API没有体感温度
                            humidity = weather_data.get("humidity", 0)
                            humidity = int(humidity) if humidity is not None else 0
                            wind = weather_data.get("windpower", 0)
                            wind = float(wind) if wind is not None else 0.0
                            weather_type = weather_data.get("weather", "未知")
                            
                            return {
                                "success": True,
                                "message": "天气查询成功",
                                "data": {
                                    "temperature": temp,
                                    "feels_like": feels,
                                    "humidity": humidity,
                                    "wind_speed": wind,
                                    "weather_type": weather_type,
                                    "weather_code": None,
                                    "unit": unit,
                                    "tempC": temp,
                                    "tempF": round(temp * 9/5 + 32, 1) if unit == "F" else None,
                                    "wind": wind,
                                    "condition": weather_type,
                                    "location": location
                                }
                            }
        except Exception as e:
            logger.exception("Weather by location error")
    
    # 降级方案：使用城市经纬度映射
    logger.info("Using fallback city lat/lon mapping for location: %s", location)
    # 特殊处理常见城市
    special_cities = {
        "厦门思明": "厦门",
        "思明": "厦门",
        "厦门": "厦门",
        "福州福清": "福州",
        "福清": "福州",
        "福州": "福州"
    }
    
    # 尝试不同的城市名提取方式
    city_candidates = []
    if location in special_cities:
        city_candidates.append(special_cities[location])
    
    # 按常见行政区划后缀分割
    for suffix in ["市", "区", "县", "省"]:
        if suffix in location:
            candidate = location.split(suffix)[0].strip()
            city_candidates.append(candidate)
            # 尝试提取更短的城市名
            if len(candidate) > 2:
                city_candidates.append(candidate[:2])
    
    # 尝试提取前两个字作为城市名（通用逻辑）
    if len(location) >= 2:
        city_candidates.append(location[:2])
    
    # 尝试直接匹配
    city_candidates.append(location)
    
    # 去重
    city_candidates = list(set(city_candidates))
    
    # 城市经纬度映射
    city_lat_lon_map = {
        "北京": (39.9, 116.4),
        "上海": (31.2, 121.4),
        "广州": (23.1, 113.3),
        "深圳": (22.5, 114.1),
        "杭州": (30.3, 120.2),
        "成都": (30.7, 104.1),
        "武汉": (30.6, 114.3),
        "西安": (34.3, 108.9),
        "南京": (32.1, 118.8),
        "重庆": (29.5, 106.5),
        "厦门": (24.5, 118.1),
        "福州": (26.1, 119.3)
    }
    
    # 查找匹配的城市
    matched_city = None
    for candidate in city_candidates:
        if candidate in city_lat_lon_map:
            matched_city = candidate
            break
    
    if matched_city:
        lat, lon = city_lat_lon_map[matched_city]
        logger.info(f"Using fallback location for {matched_city}: lat={lat}, lon={lon}")
        
        # 使用经纬度查询天气
        weather_data = fetch_weather(lat, lon, unit)
        if weather_data.get("temperature") is not None:
            return {
                "success": True,
                "message": "天气查询成功",
                "data": {
                    "temperature": weather_data.get("temperature"),
                    "feels_like": weather_data.get("feels_like"),
                    "humidity": weather_data.get("humidity"),
                    "wind_speed": weather_data.get("wind_speed"),
                    "weather_type": weather_data.get("weather_type"),
                    "weather_code": weather_data.get("weather_code"),
                    "unit": unit,
                    "tempC": weather_data.get("tempC"),
                    "tempF": weather_data.get("tempF"),
                    "wind": weather_data.get("wind"),
                    "condition": weather_data.get("condition"),
                    "location": location
                }
            }
    
    # 如果所有方法都失败，返回默认数据
    logger.warning("All weather query methods failed, returning default data for location: %s", location)
    result = {
        "success": True,
        "message": "天气查询成功",
        "data": {
            "temperature": 22.0,
            "feels_like": 22.0,
            "humidity": 50,
            "wind_speed": 1.0,
            "weather_type": "晴",
            "weather_code": None,
            "unit": unit,
            "tempC": 22.0,
            "tempF": 71.6 if unit == "F" else None,
            "wind": 1.0,
            "condition": "晴",
            "location": location
        }
    }
    try:
        with _perf_lock:
            _perf_stats.setdefault("weather_cache", {})[cache_key] = {"ts": now, "value": result}
    except Exception:
        pass
    return result


def fetch_weather(lat: float, lon: float, unit: str = "C") -> Dict[str, Any]:
    unit = (unit or "C").upper()
    cache_ttl = int(os.getenv("WEATHER_CACHE_TTL") or "600")
    cache_key = f"geo:{unit}:{round(float(lat),3)}:{round(float(lon),3)}"
    now = time.time()
    try:
        cached = _perf_stats.get("weather_cache", {}).get(cache_key)
        if cached and (now - float(cached.get("ts") or 0)) < cache_ttl:
            return cached.get("value") or {}
    except Exception:
        pass
    # 使用高德地图天气API
    amap_api_key = os.getenv("AMAP_API_KEY")
    if not amap_api_key:
        logger.error("AMAP_API_KEY not configured")
        # 降级使用open-meteo
        return fetch_weather_fallback(lat, lon, unit)
    
    url = "https://restapi.amap.com/v3/weather/weatherInfo"
    params = {
        "key": amap_api_key,
        "city": "",  # 后续通过地理编码获取
        "extensions": "base",
        "output": "json"
    }
    
    # 先通过经纬度获取城市编码
    geo_url = "https://restapi.amap.com/v3/geocode/regeo"
    geo_params = {
        "key": amap_api_key,
        "location": f"{lon},{lat}",
        "extensions": "base",
        "output": "json"
    }
    
    try:
        geo_r = requests.get(geo_url, params=geo_params, timeout=6)
        geo_r.raise_for_status()
        geo_j = geo_r.json() or {}
        
        if geo_j.get("status") != "1":
            logger.error(f"Geocoding failed: {geo_j.get('info', 'Unknown error')}")
            return fetch_weather_fallback(lat, lon, unit)
        
        city_code = geo_j.get("regeocode", {}).get("addressComponent", {}).get("citycode")
        if not city_code:
            logger.error("City code not found")
            return fetch_weather_fallback(lat, lon, unit)
        
        params["city"] = city_code
        r = requests.get(url, params=params, timeout=6)
        r.raise_for_status()
        j = r.json() or {}
        
        if j.get("status") != "1":
            logger.error(f"Weather API failed: {j.get('info', 'Unknown error')}")
            return fetch_weather_fallback(lat, lon, unit)
        
        weather_data = j.get("lives", [])[0] if j.get("lives") else {}
        temp = weather_data.get("temperature", 0)
        temp = float(temp) if temp is not None else 20.0
        feels = temp  # 高德API没有体感温度
        humidity = weather_data.get("humidity", 0)
        humidity = int(humidity) if humidity is not None else 0
        wind = weather_data.get("windpower", 0)
        wind = float(wind) if wind is not None else 0.0
        weather_type = weather_data.get("weather", "未知")
        
        result = {
            "temperature": temp,
            "feels_like": feels,
            "humidity": humidity,
            "wind_speed": wind,
            "weather_type": weather_type,
            "weather_code": None,
            "unit": unit,
            "tempC": temp,
            "tempF": round(temp * 9/5 + 32, 1) if unit == "F" else None,
            "wind": wind,
            "condition": weather_type
        }
        try:
            with _perf_lock:
                _perf_stats.setdefault("weather_cache", {})[cache_key] = {"ts": now, "value": result}
        except Exception:
            pass
        return result
    except Exception as e:
        logger.exception("Weather API error")
        return fetch_weather_fallback(lat, lon, unit)


def fetch_weather_fallback(lat: float, lon: float, unit: str = "C") -> Dict[str, Any]:
    """天气查询降级方案，使用open-meteo"""
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
    try:
        r = requests.get(url, params=params, headers={"User-Agent": "VirtualMenswear/1.0"}, timeout=6)
        r.raise_for_status()
        j = r.json() or {}
        cur = j.get("current") or {}
        temp = cur.get("temperature_2m")
        feels = cur.get("apparent_temperature")
        humidity = cur.get("relative_humidity_2m")
        wind = cur.get("wind_speed_10m")
        code = cur.get("weather_code")
        weather_type = weather_code_to_text(code)

        return {
            "temperature": round(temp, 1) if isinstance(temp, (int, float)) else None,
            "feels_like": round(feels, 1) if isinstance(feels, (int, float)) else None,
            "humidity": int(humidity) if isinstance(humidity, (int, float)) else None,
            "wind_speed": round(wind, 1) if isinstance(wind, (int, float)) else None,
            "weather_type": weather_type,
            "weather_code": code,
            "unit": unit,
            "tempC": round(temp, 1) if unit == "C" and isinstance(temp, (int, float)) else None,
            "tempF": round(temp, 1) if unit == "F" and isinstance(temp, (int, float)) else None,
            "wind": round(wind, 1) if isinstance(wind, (int, float)) else None,
            "condition": code
        }
    except Exception as e:
        logger.exception("Fallback weather API error")
        return {
            "temperature": None,
            "feels_like": None,
            "humidity": None,
            "wind_speed": None,
            "weather_type": "未知",
            "weather_code": None,
            "unit": unit,
            "tempC": None,
            "tempF": None,
            "wind": None,
            "condition": None
        }


def store_image(file_bytes: bytes, file_name: str) -> Dict[str, str]:
    try:
        t0 = time.time()
        # 确保 file_bytes 不为 None
        if not file_bytes:
            raise Exception("图片数据为空")
        # 压缩图片，设置最大边长为2048像素
        compressed_bytes = compress_image(file_bytes, max_size=2048)
        # 确保压缩后的数据不为 None
        if not compressed_bytes:
            compressed_bytes = file_bytes  # 如果压缩失败，使用原始数据
        compress_ms = (time.time() - t0) * 1000.0
        if compress_ms >= 800:
            logger.warning("image_compress_slow duration_ms=%d size_in=%d size_out=%d", int(compress_ms), len(file_bytes or b""), len(compressed_bytes or b""))
        ext = ".png" if file_name.lower().endswith(".png") else ".jpg"
        key = f"{uuid.uuid4().hex}{ext}"
        if _oss_enabled():
            try:
                return _upload_bytes_to_oss(compressed_bytes, key, "image/png" if ext == ".png" else "image/jpeg")
            except Exception:
                pass
        path = _local_dir / key
        path.write_bytes(compressed_bytes)
        return {"image_url": f"{PUBLIC_BASE_URL}/files/{key}", "image_key": key}
    except Exception as e:
        logger.exception("store_image_failed")
        raise


def _clean_env_value(v: Optional[str], *, remove_all_whitespace: bool = False) -> str:
    if v is None:
        return ""
    s = str(v)
    s = s.replace("\ufeff", "")
    s = s.replace("\u200b", "").replace("\u200c", "").replace("\u200d", "").replace("\u2060", "")
    s = s.strip()
    if (s.startswith("`") and s.endswith("`")) or (s.startswith("'") and s.endswith("'")) or (s.startswith('"') and s.endswith('"')):
        s = s[1:-1].strip()
    if remove_all_whitespace:
        import re
        s = re.sub(r"\s+", "", s)
    return s


def _oss_config() -> Dict[str, str]:
    load_dotenv(dotenv_path=_FORCED_ENV_PATH, override=True)
    return {
        "bucket": _clean_env_value(os.getenv("OSS_BUCKET_NAME")),
        "endpoint": _clean_env_value(os.getenv("OSS_ENDPOINT")),
        "access_key_id": _clean_env_value(os.getenv("OSS_ACCESS_KEY_ID"), remove_all_whitespace=True),
        "access_key_secret": _clean_env_value(os.getenv("OSS_ACCESS_KEY_SECRET"), remove_all_whitespace=True),
        "public_base": _clean_env_value(os.getenv("OSS_PUBLIC_BASE_URL")),
    }


def _oss_enabled() -> bool:
    cfg = _oss_config()
    return bool(cfg["bucket"] and cfg["endpoint"] and cfg["access_key_id"] and cfg["access_key_secret"])


def _oss_public_base() -> str:
    base = _oss_config()["public_base"]
    if base:
        return base.rstrip("/")
    cfg = _oss_config()
    bucket = cfg["bucket"]
    endpoint = cfg["endpoint"]
    if not endpoint:
        return ""
    endpoint = endpoint.replace("https://", "").replace("http://", "").rstrip("/")
    return f"https://{bucket}.{endpoint}"


def _get_oss_bucket():
    import oss2
    cfg = _oss_config()
    access_key_id = cfg["access_key_id"]
    access_key_secret = cfg["access_key_secret"]
    endpoint = cfg["endpoint"]
    bucket_name = cfg["bucket"]
    if not (access_key_id and access_key_secret and endpoint and bucket_name):
        raise Exception("OSS 配置不完整（OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_ENDPOINT/OSS_BUCKET_NAME）")
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}"
    auth = oss2.Auth(access_key_id, access_key_secret)
    return oss2.Bucket(auth, endpoint, bucket_name)


def _upload_bytes_to_oss(file_bytes: bytes, object_key: str, content_type: str) -> Dict[str, str]:
    try:
        bucket = _get_oss_bucket()
        headers = {"Content-Type": content_type, "x-oss-object-acl": "public-read"} if content_type else {"x-oss-object-acl": "public-read"}
        # 先压缩图片（确保不超过5MB且长边≤2048）
        compressed = _compress_image_for_tryon(file_bytes)
        if len(compressed) > 5 * 1024 * 1024:
            # 如果压缩后仍超过5MB，再降质量
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(compressed))
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=70)
            compressed = output.getvalue()
        bucket.put_object(object_key, compressed, headers=headers)
        # 构建公共读 URL（不带签名）
        endpoint = _oss_config()["endpoint"].replace("https://", "").replace("http://", "")
        public_url = f"https://{bucket.bucket_name}.{endpoint}/{object_key}"
        return {"image_url": public_url, "image_key": object_key}
    except Exception as e:
        logger.exception("oss_upload_failed")
        error_msg = str(e)
        if "403" in error_msg:
            raise Exception(f"OSS 上传失败：403 Forbidden - 可能是 Access Key 无效或权限不足，请检查 OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET 配置")
        elif "500" in error_msg:
            raise Exception(f"OSS 上传失败：500 Internal Server Error - OSS 服务端错误，请稍后重试")
        elif "No such bucket" in error_msg:
            raise Exception(f"OSS 上传失败：Bucket 不存在 - 请检查 OSS_BUCKET_NAME 配置")
        elif "Connection refused" in error_msg or "timeout" in error_msg:
            raise Exception(f"OSS 上传失败：网络连接失败 - 请检查 OSS_ENDPOINT 配置和网络连接")
        elif "AccessDenied" in error_msg:
            raise Exception(f"OSS 上传失败：AccessDenied - 权限不足，请检查 Access Key 权限")
        elif "InvalidAccessKeyId" in error_msg:
            raise Exception(f"OSS 上传失败：InvalidAccessKeyId - Access Key ID 无效")
        elif "SignatureDoesNotMatch" in error_msg:
            raise Exception(f"OSS 上传失败：SignatureDoesNotMatch - 签名不匹配，请检查 Access Key Secret 配置")
        else:
            raise Exception(f"OSS 上传失败：{error_msg}")


def _read_local_file_from_api_url(url: str) -> Optional[bytes]:
    try:
        if url.startswith("/files/"):
            key = url.split("/files/", 1)[1]
            p = (_local_dir / key).resolve()
            if str(p).startswith(str(_local_dir.resolve())) and p.exists():
                return p.read_bytes()
        if url.startswith(f"{PUBLIC_BASE_URL}/files/"):
            key = url.split("/files/", 1)[1]
            p = (_local_dir / key).resolve()
            if str(p).startswith(str(_local_dir.resolve())) and p.exists():
                return p.read_bytes()
        return None
    except Exception:
        return None


def _promote_url_to_oss(url: str) -> Optional[str]:
    if not _oss_enabled():
        return None
    if _is_public_fetchable_url(url):
        return url
    
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            b = _read_local_file_from_api_url(url)
            if b is not None:
                ext = ".jpg"
                if url.lower().endswith(".png"):
                    ext = ".png"
                key = f"tryon/{time.strftime('%Y%m%d')}/{uuid.uuid4().hex}{ext}"
                out = _upload_bytes_to_oss(b, key, "image/png" if ext == ".png" else "image/jpeg")
                return out["image_url"]
            
            p = urlparse(url)
            host = (p.hostname or "").lower()
            if host in INTERNAL_FETCH_HOSTS and p.scheme in ("http", "https"):
                # 增加超时控制和重试
                r = requests.get(url, timeout=(5, 20))
                r.raise_for_status()
                ct = (r.headers.get("content-type") or "").lower()
                ext = ".jpg"
                if "png" in ct or url.lower().endswith(".png"):
                    ext = ".png"
                key = f"tryon/{time.strftime('%Y%m%d')}/{uuid.uuid4().hex}{ext}"
                out = _upload_bytes_to_oss(r.content, key, "image/png" if ext == ".png" else "image/jpeg")
                return out["image_url"]
            return None
        except Exception as e:
            if attempt < max_attempts - 1:
                logger.warning(f"Attempt {attempt+1} failed, retrying...: {str(e)}")
                time.sleep(2)
                continue
            logger.error(f"All attempts failed for promote_url_to_oss: {str(e)}")
            return None


def _is_public_fetchable_url(url: str) -> bool:
    try:
        p = urlparse(url)
        host = (p.hostname or "").lower()
        if not p.scheme.startswith("http"):
            return False
        if host in INTERNAL_FETCH_HOSTS:
            return False
        if host.startswith("127.") or host.startswith("0.") or host == "::1":
            return False
        # 如果是 OSS URL 且包含签名参数（OSSAccessKeyId），视为不可公网访问（因为百炼可能无法下载）
        if host.endswith("aliyuncs.com") and ("OSSAccessKeyId=" in url or "Signature=" in url):
            return False
        return True
    except Exception:
        return False


def generate_taobao_link(item_name: str, is_menswear: bool = True) -> str:
    """生成淘宝搜索链接"""
    import urllib.parse
    name = str(item_name or "").strip()
    if is_menswear and "男" not in name:
        name += " 男"
    encoded_name = urllib.parse.quote(name)
    return f"https://s.taobao.com/search?q={encoded_name}"


def base64_to_bytes(b64: str) -> bytes:
    pure = (b64 or "").strip()
    pure = pure.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", "")
    pure = pure.replace("data:image/jpg;base64,", "").replace("data:image/webp;base64,", "")
    return base64.b64decode(pure)


# 阿里云通义千问（DashScope）文本生成
DASHSCOPE_TEXT_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"


def _force_load_root_env() -> None:
    try:
        load_dotenv(dotenv_path=_FORCED_ENV_PATH, override=True)
    except Exception:
        pass


_dashscope_key_lock = threading.Lock()
_dashscope_key_idx = 0


def _dashscope_all_keys() -> List[str]:
    _force_load_root_env()
    keys: List[str] = []
    for env_key in ("DASHSCOPE_TRYON_API_KEY", "DASHSCOPE_LLM_API_KEY", "DASHSCOPE_API_KEY", "ALIYUN_API_KEY"):
        v = os.getenv(env_key)
        if not v:
            continue
        s = str(v).strip()
        if s and s not in keys:
            keys.append(s)
    return keys


def _dashscope_rotated_keys() -> List[str]:
    global _dashscope_key_idx
    keys = _dashscope_all_keys()
    if not keys:
        return []
    with _dashscope_key_lock:
        start = _dashscope_key_idx % len(keys)
        _dashscope_key_idx += 1
    return keys[start:] + keys[:start]


def dashscope_api_key() -> Optional[str]:
    _force_load_root_env()
    return os.getenv("DASHSCOPE_API_KEY") or os.getenv("ALIYUN_API_KEY") or None


def dashscope_llm_api_key() -> Optional[str]:
    _force_load_root_env()
    return os.getenv("DASHSCOPE_LLM_API_KEY") or dashscope_api_key()


def dashscope_tryon_api_key() -> Optional[str]:
    _force_load_root_env()
    return os.getenv("DASHSCOPE_TRYON_API_KEY") or None


def _mask_key(k: Optional[str]) -> str:
    if not k:
        return ""
    s = str(k).strip()
    if len(s) <= 10:
        return s[:2] + "***"
    return s[:6] + "***" + s[-4:]


def _dashscope_llm_key_source() -> str:
    if os.getenv("DASHSCOPE_LLM_API_KEY"):
        return "DASHSCOPE_LLM_API_KEY"
    if os.getenv("DASHSCOPE_API_KEY"):
        return "DASHSCOPE_API_KEY"
    if os.getenv("ALIYUN_API_KEY"):
        return "ALIYUN_API_KEY"
    return ""


def _post_json_with_retry(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: int = 30, max_attempts: int = 3) -> requests.Response:
    last_exc: Optional[Exception] = None
    for i in range(max_attempts):
        try:
            return requests.post(url, headers=headers, json=payload, timeout=timeout)
        except Exception as e:
            last_exc = e
            time.sleep(min(0.8 * (2**i), 3.0))
    raise last_exc or Exception("请求失败")


def _get_with_retry(url: str, headers: Dict[str, str], timeout: int = 30, max_attempts: int = 3) -> requests.Response:
    last_exc: Optional[Exception] = None
    for i in range(max_attempts):
        try:
            return requests.get(url, headers=headers, timeout=timeout)
        except Exception as e:
            last_exc = e
            time.sleep(min(0.8 * (2**i), 3.0))
    raise last_exc or Exception("请求失败")


QWEN_MAIN_MODEL = "qwen-max-2025-01-25"
QWEN_FALLBACK_MODEL = "qwen-plus-2025-04-28"


def call_aliyun_llm(prompt: str, model: str) -> str:
    api_key = dashscope_llm_api_key()
    if not api_key:
        raise Exception("未配置 DASHSCOPE_LLM_API_KEY（或 DASHSCOPE_API_KEY）")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "input": {"messages": [{"role": "user", "content": prompt}]},
        "parameters": {"temperature": 0.7, "top_p": 0.8}
    }
    response = _post_json_with_retry(DASHSCOPE_TEXT_ENDPOINT, headers=headers, payload=payload, timeout=30, max_attempts=3)
    try:
        result = response.json()
    except Exception:
        raise Exception(f"大模型返回非JSON（HTTP {response.status_code}）：{response.text[:800]}")

    if response.status_code != 200:
        req_id = response.headers.get("x-dashscope-request-id") or response.headers.get("x-tt-logid")
        src = _dashscope_llm_key_source()
        masked = _mask_key(api_key)
        raise Exception(
            f"大模型调用失败（HTTP {response.status_code}）: {str(result)[:800]}"
            f"{(' (logid: '+req_id+')') if req_id else ''}"
            f"{(' (key_source: '+src+', key: '+masked+')') if (src or masked) else ''}"
        )

    output = result.get("output") or {}
    text = output.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    choices = output.get("choices")
    if isinstance(choices, list) and choices:
        c0 = choices[0] or {}
        msg = c0.get("message") or {}
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()

    raise Exception(f"大模型返回格式异常：{str(result)[:800]}")

async def call_aliyun_llm_stream(prompt: str, model: str):
    """流式调用大模型"""
    api_key = dashscope_llm_api_key()
    if not api_key:
        raise Exception("未配置 DASHSCOPE_LLM_API_KEY（或 DASHSCOPE_API_KEY）")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "input": {"messages": [{"role": "user", "content": prompt}]},
        "parameters": {"temperature": 0.7, "top_p": 0.8},
        "stream": True
    }
    
    try:
        with requests.post(DASHSCOPE_TEXT_ENDPOINT, headers=headers, json=payload, stream=True, timeout=30) as response:
            if response.status_code != 200:
                req_id = response.headers.get("x-dashscope-request-id") or response.headers.get("x-tt-logid")
                src = _dashscope_llm_key_source()
                masked = _mask_key(api_key)
                raise Exception(
                    f"大模型调用失败（HTTP {response.status_code}）: {response.text[:800]}"
                    f"{(' (logid: '+req_id+')') if req_id else ''}"
                    f"{(' (key_source: '+src+', key: '+masked+')') if (src or masked) else ''}"
                )
            
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        line = line[6:]
                        if line == '[DONE]':
                            break
                        try:
                            import json
                            chunk = json.loads(line)
                            output = chunk.get("output") or {}
                            text = output.get("text")
                            if isinstance(text, str) and text.strip():
                                yield text
                        except Exception:
                            pass
    except Exception as e:
        raise Exception(f"流式调用失败：{str(e)}")


_llm_model_lock = threading.Lock()
_llm_model_idx = 0


def _llm_models() -> List[str]:
    _force_load_root_env()
    cands = [
        QWEN_MAIN_MODEL,
        QWEN_FALLBACK_MODEL,
        str(os.getenv("QWEN_MODEL") or "").strip(),
        "qwen-turbo",
        "qwen-plus",
    ]
    out: List[str] = []
    for m in cands:
        m = str(m or "").strip()
        if m and m not in out:
            out.append(m)
    while len(out) < 5:
        for m in ("qwen-max", "qwen-plus", "qwen-turbo"):
            if m not in out:
                out.append(m)
            if len(out) >= 5:
                break
    return out[:5]


def _llm_rotated_models() -> List[str]:
    global _llm_model_idx
    models = _llm_models()
    with _llm_model_lock:
        start = _llm_model_idx % len(models)
        _llm_model_idx += 1
    return models[start:] + models[:start]


def _call_aliyun_llm_with_key(prompt: str, model: str, api_key: str, timeout: int) -> str:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model, "input": {"messages": [{"role": "user", "content": prompt}]}, "parameters": {"temperature": 0.7, "top_p": 0.8}}
    response = _post_json_with_retry(DASHSCOPE_TEXT_ENDPOINT, headers=headers, payload=payload, timeout=timeout, max_attempts=1)
    try:
        result = response.json()
    except Exception:
        raise Exception(f"大模型返回非JSON（HTTP {response.status_code}）：{response.text[:800]}")
    if response.status_code != 200:
        req_id = response.headers.get("x-dashscope-request-id") or response.headers.get("x-tt-logid")
        raise Exception(f"大模型调用失败（HTTP {response.status_code}）: {str(result)[:800]}{(' (logid: '+req_id+')') if req_id else ''}")
    output = result.get("output") or {}
    text = output.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    choices = output.get("choices")
    if isinstance(choices, list) and choices:
        c0 = choices[0] or {}
        msg = c0.get("message") or {}
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    raise Exception(f"大模型返回格式异常：{str(result)[:800]}")


def call_aliyun_llm_with_fallback(prompt: str) -> str:
    keys = _dashscope_rotated_keys()
    if not keys:
        raise Exception("未配置任何 DashScope API Key")
    models = _llm_rotated_models()
    timeout = int(os.getenv("LLM_TIMEOUT") or "10")
    max_total_attempts = int(os.getenv("LLM_MAX_TOTAL_ATTEMPTS") or "3")
    attempts: List[tuple[str, str]] = []
    for model in models:
        for api_key in keys:
            attempts.append((model, api_key))
    last_err = ""
    for model, api_key in attempts[: max(1, max_total_attempts)]:
        try:
            return _call_aliyun_llm_with_key(prompt, model, api_key, timeout)
        except Exception as e:
            last_err = str(e)
            continue
    raise Exception(last_err or "大模型调用失败")


TEXT2IMAGE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
TASKS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/tasks"

_text2img_error_logger = logging.getLogger("text2img_error")
try:
    _text2img_error_logger.setLevel(logging.INFO)
    _text2img_error_logger.propagate = False
    _text2img_log_path = str((BASE_DIR / "text2img_error.log"))
    if not any(isinstance(h, logging.FileHandler) and (getattr(h, "baseFilename", "") == _text2img_log_path) for h in _text2img_error_logger.handlers):
        _t2i_fh = logging.FileHandler(_text2img_log_path, encoding="utf-8")
        _t2i_fh.setLevel(logging.INFO)
        _text2img_error_logger.addHandler(_t2i_fh)
except Exception:
    pass


def _extract_image_url_from_task_result(task_json: Dict[str, Any]) -> Optional[str]:
    output = task_json.get("output") or {}
    if isinstance(output.get("image_url"), str) and output.get("image_url"):
        return output.get("image_url")
    results = output.get("results")
    if isinstance(results, list) and results:
        for it in results:
            if isinstance(it, dict):
                u = it.get("url") or it.get("image_url")
                if isinstance(u, str) and u:
                    return u
    data = task_json.get("data")
    if isinstance(data, dict):
        u = data.get("url") or data.get("image_url")
        if isinstance(u, str) and u:
            return u
    return None


def _select_text2image_models(hint_key: str) -> List[str]:
    raw_primary = str(os.getenv("TEXT2IMAGE_PRIMARY_MODELS") or "").strip()
    raw_secondary = str(os.getenv("TEXT2IMAGE_SECONDARY_MODELS") or "").strip()
    raw_all = str(os.getenv("TEXT2IMAGE_MODELS") or "").strip()

    if raw_all:
        return [m.strip() for m in raw_all.split(",") if m and m.strip()]

    # 只使用 qwen-image-2.0-pro
    primary = ["qwen-image-2.0-pro"]
    secondary = []

    mix_enabled = str(os.getenv("TEXT2IMAGE_MIX_ENABLED") or "1") != "0"
    if not mix_enabled or not hint_key:
        return primary + secondary

    try:
        import hashlib
        bucket = int(hashlib.md5(str(hint_key).encode("utf-8")).hexdigest()[:8], 16) % 3
    except Exception:
        bucket = 1
    if bucket == 0:
        return secondary + primary
    return primary + secondary


def text_to_img(prompt: str, hint_key: str = "") -> Optional[str]:
    """调用通义万相文生图 API（异步任务模式）"""
    logger.info(f"调用文生图 API，prompt: {prompt[:100]}")
    api_key = (
        os.getenv("DASHSCOPE_WANX_API_KEY")
        or os.getenv("DASHSCOPE_IMAGE_API_KEY")
        or os.getenv("DASHSCOPE_TRYON_API_KEY")
        or os.getenv("DASHSCOPE_LLM_API_KEY")
        or os.getenv("DASHSCOPE_API_KEY")
        or os.getenv("ALIYUN_API_KEY")
    )
    if not api_key:
        logger.error("文生图 API Key 未配置")
        return None

    # 使用 wanx2.1-t2i-turbo 模型
    prompt_text = f"男士服装商品实拍图，白底，正面展示，高清8K，简约质感，无水印无文字，{str(prompt or '').strip()}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    }
    payload = {
        "model": "wanx2.1-t2i-turbo",
        "input": {"prompt": prompt_text},
        "parameters": {"size": "1024*1024", "n": 1}
    }

    try:
        # 1. 创建任务
        resp = requests.post("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
                             headers=headers, json=payload, timeout=30)
        if resp.status_code != 200:
            logger.error(f"创建文生图任务失败: {resp.status_code}, {resp.text}")
            return None
        task_id = resp.json().get("output", {}).get("task_id")
        if not task_id:
            logger.error(f"未获取到 task_id: {resp.text}")
            return None

        # 2. 轮询任务结果
        poll_interval = 2.0
        max_attempts = 60  # 最多等待 120 秒
        for _ in range(max_attempts):
            time.sleep(poll_interval)
            status_resp = requests.get(f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
                                       headers={"Authorization": f"Bearer {api_key}"}, timeout=15)
            if status_resp.status_code != 200:
                logger.warning(f"查询任务状态失败: {status_resp.status_code}, 继续重试...")
                continue
            status_data = status_resp.json()
            task_status = status_data.get("output", {}).get("task_status")
            if task_status == "SUCCEEDED":
                results = status_data.get("output", {}).get("results", [])
                if results and results[0].get("url"):
                    image_url = results[0]["url"]
                    # 可选：将生成的图片转存到 OSS
                    try:
                        if _oss_enabled():
                            img_resp = requests.get(image_url, timeout=15)
                            if img_resp.status_code == 200:
                                stored = store_image(img_resp.content, "missing_item.jpg")
                                return stored["image_url"]
                    except Exception:
                        pass
                    return image_url
                else:
                    logger.error(f"任务成功但无图片URL: {status_data}")
                    return None
            elif task_status == "FAILED":
                logger.error(f"文生图任务失败: {status_data}")
                return None
            # 其他状态（PENDING、RUNNING）继续等待

        logger.error(f"文生图任务超时，task_id={task_id}")
        return None
    except Exception as e:
        logger.exception(f"text_to_img 异常: {e}")
        return None


_missing_item_cache: Dict[str, Dict[str, Any]] = {}
_missing_item_cache_lock = threading.Lock()
_missing_item_cache_ttl = 24 * 60 * 60
_image_semaphore = threading.Semaphore(max(1, int(os.getenv("TEXT2IMAGE_CONCURRENCY") or "1")))

_missing_item_error_logger = logging.getLogger("missing_item_image_error")
try:
    _missing_item_error_logger.setLevel(logging.INFO)
    _missing_item_error_logger.propagate = False
    _error_log_path = str((BASE_DIR / "missing_item_image_error.log"))
    if not any(isinstance(h, logging.FileHandler) and (getattr(h, "baseFilename", "") == _error_log_path) for h in _missing_item_error_logger.handlers):
        _fh = logging.FileHandler(_error_log_path, encoding="utf-8")
        _fh.setLevel(logging.INFO)
        _missing_item_error_logger.addHandler(_fh)
except Exception:
    pass


def _json_dumps_safe(obj: Any) -> str:
    import json
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return str(obj)


def _log_missing_item_image_error(
    user_id: Any,
    recognized_types: List[str],
    missing_category: str,
    error_code: str,
    prompt: str,
    raw_response: str,
) -> None:
    import datetime
    record = {
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "user_id": user_id,
        "recognized_types": recognized_types,
        "missing_category": missing_category,
        "error_code": error_code,
        "prompt": (prompt or "")[:4000],
        "raw_response": (raw_response or "")[:8000],
    }
    try:
        _missing_item_error_logger.info(_json_dumps_safe(record))
    except Exception:
        pass


def _extract_first_json_obj(text: str) -> Optional[Dict[str, Any]]:
    import json
    if not isinstance(text, str) or not text.strip():
        return None
    s = text.strip()
    start = s.find("{")
    end = s.rfind("}")
    if start < 0 or end <= start:
        return None
    snippet = s[start : end + 1]
    try:
        obj = json.loads(snippet)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def _validate_missing_item_meta(meta: Dict[str, Any]) -> Optional[str]:
    if not isinstance(meta, dict):
        return "meta_not_dict"
    if not str(meta.get("category") or "").strip():
        return "missing_category"
    if not str(meta.get("taobaoKeyword") or "").strip():
        return "missing_taobaoKeyword"
    kws = meta.get("keywords")
    if not isinstance(kws, list) or len([k for k in kws if str(k or "").strip()]) < 8:
        return "keywords_lt_8"
    img_prompt = str(meta.get("imagePrompt") or "").strip()
    if not img_prompt:
        return "missing_imagePrompt"
    detailed_desc = str(meta.get("detailedDescription") or "").strip()
    if not detailed_desc:
        return "missing_detailedDescription"
    return None


def _guess_missing_item_visual_spec(category: str, style_tag: str) -> Dict[str, str]:
    cat = str(category or "").strip()
    style_tag = str(style_tag or "").strip() or "通勤"
    style = style_tag

    if cat == "鞋子":
        sub_map = {"通勤": "德训鞋", "简约": "低帮小白鞋", "休闲": "帆布鞋", "运动": "跑鞋", "商务": "乐福鞋"}
        sub_category = sub_map.get(style) or "低帮板鞋"
        color_info = "主色：白色；辅色：浅灰（鞋底/后跟小面积）；分布：鞋面大面积白色，鞋底灰白拼色，整体干净利落。"
        stripe_detail = "无条纹（纯色鞋面）。"
        return {"subCategory": sub_category, "colorInfo": color_info, "stripeDetail": stripe_detail}

    if cat == "裤子":
        sub_map = {"通勤": "直筒西装裤", "简约": "直筒牛仔裤", "休闲": "宽松工装裤", "运动": "束脚运动裤", "商务": "修身西装裤"}
        sub_category = sub_map.get(style) or "直筒长裤"
        color_info = "主色：深灰/藏青（二选一偏深色）；辅色：无；分布：大面积纯色，线条利落显腿长。"
        stripe_detail = "无条纹（纯色面料）。"
        return {"subCategory": sub_category, "colorInfo": color_info, "stripeDetail": stripe_detail}

    sub_map = {"通勤": "真皮腰带", "简约": "极简腕表", "休闲": "棒球帽", "运动": "运动袜", "商务": "真皮公文包"}
    sub_category = sub_map.get(style) or "棒球帽"
    color_info = "主色：黑色；辅色：银色/白色（小面积扣具或标识）；分布：主体纯色，辅色点缀增强质感。"
    stripe_detail = "无条纹（纯色/无明显图案）。"
    return {"subCategory": sub_category, "colorInfo": color_info, "stripeDetail": stripe_detail}


def _missing_item_detail_hint(category: str, sub_category: str, style_tag: str) -> str:
    cat = str(category or "").strip()
    sub_category = str(sub_category or "").strip()
    style_tag = str(style_tag or "").strip() or "通勤"

    if cat == "鞋子":
        if "跑鞋" in sub_category:
            return "细节：透气网面/缓震中底/耐磨橡胶底/系带"
        if "帆布" in sub_category:
            return "细节：低帮/帆布鞋面/橡胶包头/系带"
        if "乐福" in sub_category:
            return "细节：一脚蹬/圆头或方头/皮质鞋面/橡胶或皮底"
        return "细节：低帮/系带/橡胶底/简洁拼接"

    if cat == "裤子":
        if "西装裤" in sub_category:
            return "细节：直筒或微锥/中高腰/垂坠面料/有压线更利落"
        if "工装裤" in sub_category:
            return "细节：宽松直筒/侧袋/耐磨面料/可抽绳或工装扣"
        if "运动" in sub_category or style_tag == "运动":
            return "细节：束脚或直筒/弹力面料/抽绳腰头/舒适活动"
        return "细节：直筒剪裁/中高腰/纯色面料/百搭耐穿"

    if "腰带" in sub_category:
        return "细节：真皮或仿皮/3.0-3.5cm宽/自动扣或针扣/低调五金"
    if "腕表" in sub_category:
        return "细节：极简表盘/金属或皮质表带/小面积金属点缀"
    if "棒球帽" in sub_category:
        return "细节：弯檐/可调节帽围/纯棉或混纺/低调小标"
    if "袜" in sub_category:
        return "细节：中筒或短筒/吸汗透气/弹力袜口/简洁标识"
    if "公文包" in sub_category:
        return "细节：皮质包身/硬挺轮廓/多隔层/金属拉链五金"
    return "细节：简约设计/质感材质/不抢主单品"


def _build_taobao_keyword_for_missing_item(category: str, style_tag: str, visual: Dict[str, str]) -> str:
    cat = str(category or "").strip()
    style_tag = str(style_tag or "").strip() or "通勤"
    sub_category = str((visual or {}).get("subCategory") or "").strip() or cat
    color_info = str((visual or {}).get("colorInfo") or "").strip()
    main_color = color_info.split("；", 1)[0].replace("主色：", "").strip() if color_info else ""
    core = f"{main_color}{sub_category}".strip()
    tokens = [core, "男", style_tag, "百搭", "春季"]
    return " ".join([t for t in tokens if t])


def _build_missing_item_reason_text(category: str, style_tag: str, recognized_types: List[str], visual: Dict[str, str]) -> str:
    cat = str(category or "").strip()
    style_tag = str(style_tag or "").strip() or "通勤"
    recognized = "、".join([t for t in recognized_types if t]) or "当前搭配"
    sub_category = str((visual or {}).get("subCategory") or cat).strip()
    color_info = str((visual or {}).get("colorInfo") or "").strip()
    stripe_detail = str((visual or {}).get("stripeDetail") or "").strip()
    detail_hint = _missing_item_detail_hint(cat, sub_category, style_tag)
    main_color = color_info.split("；", 1)[0].replace("主色：", "").strip() if color_info else ""
    title = f"{main_color}{sub_category}".strip() or sub_category

    if cat == "鞋子":
        return (
            f"{recognized}已经把上身与下装风格定住了，但缺少鞋子会让整体“落点”不完整。"
            f"推荐补充{title}，{stripe_detail}{detail_hint}，中性色基调更容易和现有单品做色彩统一，"
            f"同时提供更好的通勤/行走功能性，让{style_tag}风格更完整。"
        )
    if cat == "裤子":
        return (
            f"{recognized}在视觉上需要一条稳定的下装来建立比例与线条。"
            f"推荐补充{title}，{stripe_detail}{detail_hint}，深色系更容易与上衣形成层次，"
            f"直筒轮廓能让整体更利落，符合{style_tag}的场合适配。"
        )
    return (
        f"{recognized}已经有基础穿搭框架，配饰可以用来收束风格并补齐功能。"
        f"推荐补充{title}，{stripe_detail}{detail_hint}，小面积点缀不抢主单品，"
        f"能把色彩与质感细节串起来，让{style_tag}风格更精致、完整。"
    )


def _is_probably_image_url(url: str) -> bool:
    u = str(url or "").strip().lower()
    if not (u.startswith("http://") or u.startswith("https://")):
        return False
    if any(u.split("?", 1)[0].endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
        return True
    return True


def _check_image_quality(url: str) -> Optional[str]:
    from io import BytesIO
    try:
        if not _is_probably_image_url(url):
            return "url_invalid"
        r = requests.get(url, timeout=(6, 10), stream=True)
        if r.status_code < 200 or r.status_code >= 300:
            return f"http_{r.status_code}"
        ct = str(r.headers.get("Content-Type") or "").lower()
        if ("image" not in ct) and (not any(url.lower().split("?", 1)[0].endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp"))):
            return "content_type_not_image"
        data = b""
        for chunk in r.iter_content(chunk_size=65536):
            if not chunk:
                break
            data += chunk
            if len(data) >= 300000:
                break
        try:
            from PIL import Image
            im = Image.open(BytesIO(data))
            w, h = im.size
            if w < 500 or h < 500:
                return f"size_lt_500:{w}x{h}"
        except Exception:
            pass
        return None
    except Exception:
        return "fetch_failed"


def _build_missing_item_llm_prompt(category: str, style_tag: str, recognized_types: List[str]) -> str:
    cat = str(category or "").strip()
    style_tag = str(style_tag or "").strip() or "通勤"
    recognized = "、".join([t for t in recognized_types if t]) or "未知"
    # 分品类示例
    if cat == "裤子":
        example = "深灰色束脚运动裤 男 通勤运动 春季 纯色无条纹 束脚腰头 弹力面料 修身版型 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
    elif cat == "鞋子":
        example = "白色德训鞋 男 通勤百搭 春季 低帮系带 橡胶底 纯色鞋面 无条纹 简约设计 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
    else: # 配饰类
        example = "黑色真皮腰带 男 通勤百搭 四季通用 3.0-3.5cm宽 自动扣 纯色无图案 简约设计 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
    return (
        "你是电商选品与服装搭配专家。请根据缺失品类生成可在淘宝直接搜索的关键词与用于生成商品图的视觉描述。\n"
        f"已识别品类：{recognized}\n"
        f"缺失品类：{cat}\n"
        f"搭配风格：{style_tag}\n"
        "输出要求：\n"
        "1) 严格输出 JSON（不要代码块、不要额外文本）。\n"
        "2) JSON 必须包含键：category、taobaoKeyword、keywords、imagePrompt、imageUrl、detailedDescription、subCategory、colorInfo、stripeDetail。\n"
        "3) keywords 至少 8 个，按热度降序排列。\n"
        "4) taobaoKeyword 必须是一个可直接用于淘宝搜索的短语（建议包含：品类+关键属性+风格）。\n"
        "5) imagePrompt 必须严格按照以下分品类模板生成：\n"
        "   - 鞋子类：\"{单品名称} 男 通勤百搭 春季 低帮系带 橡胶底 纯色鞋面 无条纹 简约设计 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰\"\n"
        "   - 配饰类：\"{单品名称} 男 通勤百搭 四季通用 3.0-3.5cm宽 自动扣 纯色无图案 简约设计 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰\"\n"
        "   - 裤子类：\"{单品名称} 男 通勤运动 春季 纯色无条纹 束脚腰头 弹力面料 修身版型 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰\"\n"
        "   - 上衣/外套类：\"{单品名称} 男 通勤百搭 春季 纯色无图案 合身版型 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰\"\n"
        "6) detailedDescription 必须包含：产品类型、整体外观特征、主要颜色及功能特点、特殊设计元素、使用场景等详细信息。\n"
        "7) subCategory 必须是该品类更精确的产品子类别（例如：低帮小白鞋/德训鞋/直筒西装裤/宽松工装裤/棒球帽/真皮腰带 等）。\n"
        "8) colorInfo 必须描述颜色：主色调、辅助色及颜色分布特征（例如：鞋面/鞋底/拼接/缝线等占比与位置）。\n"
        "9) stripeDetail 必须描述条纹：若无条纹，明确写“无条纹（纯色）”；若有条纹，写清条纹样式、条纹颜色组合、宽度比例与分布规律。\n"
        f"示例单品描述：{example}\n"
        "JSON 字段说明：\n"
        "- category: 缺失品类（如 裤子/鞋子/配饰）\n"
        "- taobaoKeyword: 淘宝搜索关键词短语\n"
        "- keywords: 淘宝可搜索关键词数组\n"
        "- imagePrompt: 用于文生图的完整提示词\n"
        "- detailedDescription: 详细的产品描述（用于展示与检索）\n"
        "- subCategory: 具体细分类别\n"
        "- colorInfo: 颜色信息\n"
        "- stripeDetail: 条纹细节\n"
        "- imageUrl: 先返回空字符串\n"
    )


def _llm_generate_missing_item_meta(user_id: Any, category: str, style_tag: str, recognized_types: List[str]) -> Dict[str, Any]:
    prompt = _build_missing_item_llm_prompt(category, style_tag, recognized_types)
    raw = ""
    last_err = ""
    for attempt, delay in enumerate((1, 2, 4), start=1):
        try:
            raw = call_aliyun_llm_with_fallback(prompt)
            meta = _extract_first_json_obj(raw) or {}
            err = _validate_missing_item_meta(meta)
            if err:
                last_err = err
                _log_missing_item_image_error(user_id, recognized_types, category, f"llm_invalid:{err}", prompt, raw)
                raise Exception(err)
            meta["imageUrl"] = ""
            visual = _guess_missing_item_visual_spec(str(meta.get("category") or category), style_tag)
            if not str(meta.get("subCategory") or "").strip():
                meta["subCategory"] = visual.get("subCategory") or ""
            if not str(meta.get("colorInfo") or "").strip():
                meta["colorInfo"] = visual.get("colorInfo") or ""
            if not str(meta.get("stripeDetail") or "").strip():
                meta["stripeDetail"] = visual.get("stripeDetail") or ""
            return meta
        except Exception as e:
            last_err = str(e)
            _log_missing_item_image_error(user_id, recognized_types, category, f"llm_attempt_{attempt}:{last_err}", prompt, raw)
            time.sleep(delay)

    try:
        visual = _guess_missing_item_visual_spec(category, style_tag)
        sub_category = visual.get("subCategory") or ""
        fallback_keyword = f"{sub_category} 男 {style_tag} 淘宝同款".strip()
        kws = [f"{category} 男", f"{style_tag} {category}", "淘宝同款", "白底 商品图", "高清 实拍", "春季", "百搭", "经典款"]
        if category == "裤子":
            detailed_desc = f"产品类型：男士{category}；具体细分类别：{sub_category or '直筒长裤'}；整体外观特征：{style_tag}风格，直筒剪裁，简洁利落；颜色信息：{visual.get('colorInfo') or '主色：深色系；辅色：无；分布：大面积纯色'}；条纹细节：{visual.get('stripeDetail') or '无条纹（纯色面料）'}；功能特点：舒适耐穿，易搭配；特殊设计元素：简约走线与口袋结构；使用场景：通勤、日常出行、休闲约会。"
        elif category == "鞋子":
            detailed_desc = f"产品类型：男士{category}；具体细分类别：{sub_category or '低帮板鞋'}；整体外观特征：{style_tag}风格，低帮轮廓，鞋型简洁；颜色信息：{visual.get('colorInfo') or '主色：白色；辅色：浅灰；分布：鞋面白色为主'}；条纹细节：{visual.get('stripeDetail') or '无条纹（纯色鞋面）'}；功能特点：轻便透气，橡胶底防滑耐磨；特殊设计元素：简约拼接与低调细节；使用场景：通勤、休闲出行、轻运动。"
        else:
            detailed_desc = f"产品类型：男士{category}；具体细分类别：{sub_category or '棒球帽'}；整体外观特征：{style_tag}风格，简约设计，细节克制；颜色信息：{visual.get('colorInfo') or '主色：黑色；辅色：小面积金属/白色点缀'}；条纹细节：{visual.get('stripeDetail') or '无条纹（纯色/无明显图案）'}；功能特点：提升整体完成度与风格统一；特殊设计元素：低调五金或小标；使用场景：通勤、日常出行、户外。"
        if category == "裤子":
            image_prompt = f"{fallback_keyword} 男 通勤运动 春季 纯色无条纹 束脚腰头 弹力面料 修身版型 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
        elif category == "鞋子":
            image_prompt = f"{fallback_keyword} 男 通勤百搭 春季 低帮系带 橡胶底 纯色鞋面 无条纹 简约设计 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
        elif category in ["上衣", "外套"]:
            image_prompt = f"{fallback_keyword} 男 通勤百搭 春季 纯色无图案 合身版型 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
        else: # 配饰类
            image_prompt = f"{fallback_keyword} 男 通勤百搭 四季通用 3.0-3.5cm宽 自动扣 纯色无图案 简约设计 商品实拍图 纯白背景 高清 8K 无水印 正面视角 细节清晰"
        meta = {
            "category": str(category),
            "taobaoKeyword": fallback_keyword,
            "keywords": kws,
            "imagePrompt": image_prompt,
            "detailedDescription": detailed_desc,
            "subCategory": sub_category,
            "colorInfo": visual.get("colorInfo") or "",
            "stripeDetail": visual.get("stripeDetail") or "",
            "imageUrl": "",
        }
        _log_missing_item_image_error(user_id, recognized_types, category, f"llm_failed:{last_err}", prompt, raw)
        return meta
    except Exception:
        visual = _guess_missing_item_visual_spec(category, style_tag)
        return {
            "category": str(category),
            "taobaoKeyword": f"{category} {style_tag}",
            "keywords": [],
            "imagePrompt": "",
            "detailedDescription": "",
            "subCategory": visual.get("subCategory") or "",
            "colorInfo": visual.get("colorInfo") or "",
            "stripeDetail": visual.get("stripeDetail") or "",
            "imageUrl": "",
        }


def _text2img_cached(prompt_text: str, cache_key: str) -> str:
    cache_ttl = int(os.getenv("TEXT2IMAGE_CACHE_TTL") or "86400")
    now = time.time()
    try:
        with _missing_item_cache_lock:
            cached = _missing_item_cache.get(cache_key)
        if cached and (now - float(cached.get("ts") or 0)) < cache_ttl:
            u = cached.get("url")
            if isinstance(u, str) and u:
                return u
    except Exception:
        pass

    url = text_to_img(prompt_text, hint_key=cache_key)
    if not url:
        raise Exception("text2img_failed")
    try:
        with _missing_item_cache_lock:
            _missing_item_cache[cache_key] = {"ts": now, "url": str(url)}
    except Exception:
        pass
    return str(url)


def _generate_missing_item_image_sync(
    user_id: Any,
    category: str,
    style_tag: str,
    recognized_types: List[str],
) -> Dict[str, Any]:
    logger.info(f"开始生成缺失单品图片: category={category}, style={style_tag}")
    category = str(category or "").strip()
    style_tag = str(style_tag or "").strip() or "通勤"
    meta = _llm_generate_missing_item_meta(user_id, category, style_tag, recognized_types)
    prompt = str(meta.get("imagePrompt") or "").strip()
    cache_key = f"missing:{category}:{style_tag}:{str(meta.get('taobaoKeyword') or '').strip()}"

    raw_error = ""
    for attempt, delay in enumerate((1, 2), start=1):
        try:
            url = _text2img_cached(prompt, cache_key)
            qerr = _check_image_quality(url)
            if qerr:
                raw_error = qerr
                raise Exception(qerr)
            meta["imageUrl"] = url
            return {"success": True, "meta": meta, "image_url": url}
        except Exception as e:
            raw_error = str(e)
            _log_missing_item_image_error(user_id, recognized_types, category, f"text2img_attempt_{attempt}:{raw_error}", prompt, _json_dumps_safe(meta))
            time.sleep(delay)

    meta["imageUrl"] = ""
    return {"success": False, "meta": meta, "image_url": "", "error": raw_error}


def _missing_item_image_task_worker(task_id: str, user_id: Any, category: str, style_tag: str, recognized_types: List[str]):
    try:
        _task_results[task_id] = {"status": "running", "message": "图片生成中", "kind": "missing_item_image"}
        max_seconds = int(os.getenv("MISSING_IMAGE_TASK_MAX_SECONDS") or "140")
        with _image_semaphore:
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                fut = ex.submit(_generate_missing_item_image_sync, user_id, category, style_tag, recognized_types)
                try:
                    result = fut.result(timeout=max_seconds)
                except concurrent.futures.TimeoutError:
                    _task_results[task_id] = {"status": "failed", "message": "生成超时", "kind": "missing_item_image", "error": "timeout"}
                    return
        meta = result.get("meta") or {}
        image_url = result.get("image_url") or ""
        status = "completed" if result.get("success") else "failed"
        _task_results[task_id] = {
            "status": status,
            "message": "生成成功" if status == "completed" else "生成失败",
            "kind": "missing_item_image",
            "imageUrl": meta.get("imageUrl") or (image_url if status == "completed" else ""),
            "taobaoKeyword": meta.get("taobaoKeyword") or "",
            "category": meta.get("category") or category,
            "keywords": meta.get("keywords") or [],
            "imagePrompt": meta.get("imagePrompt") or "",
            "subCategory": meta.get("subCategory") or "",
            "colorInfo": meta.get("colorInfo") or "",
            "stripeDetail": meta.get("stripeDetail") or "",
            "detailedDescription": meta.get("detailedDescription") or "",
            "error": result.get("error") or "",
        }
    except Exception as e:
        logger.exception("missing_item_image_task_failed")
        _task_results[task_id] = {"status": "failed", "message": "生成失败", "kind": "missing_item_image", "error": str(e)}
    finally:
        if os.getenv("DEBUG_MISSING_IMAGE") == "1":
            try:
                logger.info("missing_item_image_task_done task_id=%s status=%s", task_id, (_task_results.get(task_id) or {}).get("status"))
            except Exception:
                pass


async def get_missing_item_image_task(task_id: str):
    try:
        result = _task_results.get(task_id)
        if not result:
            return fail("任务不存在")
        return ok(result, "查询成功")
    except Exception as e:
        logger.exception("get_missing_item_image_task_failed")
        return fail(f"查询失败：{str(e)}")


async def metrics_taobao_click(request: Request):
    try:
        body = {}
        try:
            body = await request.json()
        except Exception:
            body = {}
        keyword = str(body.get("taobaoKeyword") or body.get("keyword") or "").strip()
        category = str(body.get("category") or "").strip()
        source = str(body.get("source") or "").strip()
        logger.info("taobao_click source=%s category=%s keyword=%s", source, category, keyword[:80])
        return ok({"received": True}, "ok")
    except Exception as e:
        logger.exception("metrics_taobao_click_failed")
        return ok({"received": False, "error": str(e)}, "ok")


async def _debug_dashscope_handler():
    if os.getenv("DEBUG_DASHSCOPE") != "1":
        return fail("debug disabled", {"hint": "set DEBUG_DASHSCOPE=1 temporarily"})
    llm = dashscope_llm_api_key()
    tryon = dashscope_tryon_api_key()
    return ok(
        {
            "llm_key_source": _dashscope_llm_key_source(),
            "llm_key_masked": _mask_key(llm),
            "llm_key_len": len(llm.strip()) if llm else 0,
            "tryon_key_masked": _mask_key(tryon),
            "tryon_key_len": len(tryon.strip()) if tryon else 0,
            "qwen_model": os.getenv("QWEN_MODEL", "qwen-turbo")
        },
        "ok"
    )


def _fallback_selected_items(user_clothes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not user_clothes:
        return []
    by_type: Dict[str, List[Dict[str, Any]]] = {}
    for it in user_clothes:
        t = str(it.get("type") or "").strip()
        by_type.setdefault(t, []).append(it)
    picked: List[Dict[str, Any]] = []
    for t in ("上衣", "裤子", "外套", "鞋子"):
        if by_type.get(t):
            picked.append(by_type[t][0])
    if len(picked) >= 2:
        return picked[:4]
    return user_clothes[:2]


def _normalize_type(t: str) -> str:
    t = (t or "").strip()
    if t in ("上装", "上衣"):
        return "上衣"
    if t in ("下装", "裤子", "长裤", "短裤"):
        return "裤子"
    if t in ("鞋子", "鞋"):
        return "鞋子"
    if t in ("外套", "上衣外套"):
        return "外套"
    return t or "其他"


def _normalize_occasion(style_val: str) -> str:
    s = (style_val or "")
    if "商务" in s or "正装" in s:
        return "商务"
    if "运动" in s:
        return "运动"
    return "休闲"


def _normalize_fashion_style(style_val: str) -> str:
    s = (style_val or "").strip()
    return s or "简约"


def _wardrobe_image_base() -> str:
    return (os.getenv("WARDROBE_IMAGE_BASE_URL") or PUBLIC_BASE_URL).rstrip("/")


def _normalize_tryon_input_url(url: Any) -> str:
    u = str(url or "").strip()
    if not u:
        return ""
    if u.startswith("http://") or u.startswith("https://"):
        return u
    if u.startswith("/"):
        if u.startswith("/files/"):
            return f"{PUBLIC_BASE_URL}{u}"
        return f"{_wardrobe_image_base()}{u}"
    return f"{_wardrobe_image_base()}/{u.lstrip('/')}"


def fetch_user_clothes_from_db(user_id: int) -> List[Dict[str, Any]]:
    image_base = _wardrobe_image_base()
    conn = _mysql_connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, type, style, image, color, material, season, brand, suitable_temp, price, description "
                "FROM clothes WHERE user_id=%s ORDER BY id ASC",
                (user_id,),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    clothes: List[Dict[str, Any]] = []
    for r in rows:
        try:
            image = r.get("image")
            img = ""
            if image:
                img = str(image)
                if not img.startswith("http"):
                    img = f"{image_base}/{img.lstrip('/')}"
            cstyle = r.get("style") or ""
            
            # 安全处理各个字段
            item_id = None
            if r.get("id") is not None:
                try:
                    item_id = int(r.get("id"))
                except (ValueError, TypeError):
                    item_id = 0
            
            price = None
            if r.get("price") is not None:
                try:
                    price = float(r.get("price"))
                except (ValueError, TypeError):
                    price = None
            
            clothes.append(
                {
                    "id": item_id,
                    "name": str(r.get("name") or ""),
                    "type": _normalize_type(str(r.get("type") or "")),
                    "occasion": _normalize_occasion(str(cstyle)),
                    "fashion_style": _normalize_fashion_style(str(cstyle)),
                    "image_url": img,
                    "color": str(r.get("color") or ""),
                    "material": str(r.get("material") or ""),
                    "season": str(r.get("season") or ""),
                    "brand": str(r.get("brand") or ""),
                    "suitable_temp": str(r.get("suitable_temp") or ""),
                    "price": price,
                    "description": str(r.get("description") or ""),
                }
            )
        except Exception as e:
            logger.warning(f"Failed to parse clothes item: {str(e)}, item: {r}")
            # 继续处理下一个
            continue
    
    return clothes


def _safe_temp_text(tempC: Any) -> str:
    if tempC is None:
        return "未知"
    try:
        return f"{float(tempC):.0f}"
    except Exception:
        return str(tempC)


def _color_strategy_text(items: List[Dict[str, Any]], style: str) -> str:
    colors: List[str] = []
    for it in items:
        c = str(it.get("color") or "").strip()
        if c and c not in colors:
            colors.append(c)
    colors = colors[:3]
    style = (style or "").strip()
    if not colors:
        if style:
            return f"色彩上以{style}常用的低饱和配色为主，保证整体干净利落。"
        return "色彩上以低饱和配色为主，保证整体干净利落。"
    if len(colors) == 1:
        return f"色彩以「{colors[0]}」为主色，统一视觉重心并提升整体协调度。"
    if len(colors) == 2:
        return f"色彩采用「{colors[0]}」+「{colors[1]}」的主辅搭配，兼顾层次与稳定感。"
    return f"色彩以「{colors[0]}」为主，辅以「{colors[1]}」「{colors[2]}」点缀，形成清晰层次。"


def _fallback_outfit_reason(scene: str, purpose: str, style: str, tempC: Any, weather_type: str, items: List[Dict[str, Any]]) -> str:
    scene = (scene or "").strip() or "日常"
    purpose = (purpose or "").strip()
    style = (style or "").strip() or "简约"
    weather_type = (weather_type or "").strip() or "未知"
    temp_txt = _safe_temp_text(tempC)
    names = [str(it.get("name") or "").strip() for it in items if str(it.get("name") or "").strip()]
    names = names[:6]
    outfit_line = "、".join(names) if names else "当前衣橱可用单品"
    color_line = _color_strategy_text(items, style)
    purpose_line = f"目的为「{purpose}」，" if purpose else ""
    return (
        f"该套搭配面向「{scene}」场景，{purpose_line}在{temp_txt}℃、{weather_type}的天气下兼顾舒适与得体。"
        f"以「{style}」风格为主线，单品选择围绕{outfit_line}展开，突出版型与质感的统一。"
        f"{color_line}同时通过单品之间的正式度与材质层次，确保在该场合呈现自然且有辨识度的整体效果。"
    )


def _build_three_fallback_outfits(user_clothes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_type: Dict[str, List[Dict[str, Any]]] = {"上衣": [], "裤子": [], "外套": [], "鞋子": []}
    other: List[Dict[str, Any]] = []
    for it in user_clothes:
        t = str(it.get("type") or "").strip()
        if t in by_type:
            by_type[t].append(it)
        else:
            other.append(it)

    tops = by_type["上衣"] or other
    bottoms = by_type["裤子"] or other
    outers = by_type["外套"]
    shoes = by_type["鞋子"]

    outfits: List[Dict[str, Any]] = []
    for i in range(3):
        picked: List[Dict[str, Any]] = []
        if tops:
            picked.append(tops[i % len(tops)])
        if bottoms:
            picked.append(bottoms[(i + 1) % len(bottoms)])
        if outers and i % 2 == 0:
            picked.insert(0, outers[i % len(outers)])
        if shoes:
            picked.append(shoes[i % len(shoes)])
        if not picked:
            picked = _fallback_selected_items(user_clothes)
        uniq: List[Dict[str, Any]] = []
        seen: set[int] = set()
        for it in picked:
            try:
                cid = int(it.get("id") or 0)
            except Exception:
                cid = 0
            if cid and cid in seen:
                continue
            if cid:
                seen.add(cid)
            uniq.append(it)
        outfits.append({"selected_items": uniq})
    return outfits


def compress_image(image_bytes: bytes, max_size: int = 1024, dpi: int = 72) -> bytes:
    """压缩图片尺寸，最大边长不超过 max_size，分辨率为 dpi"""
    from PIL import Image
    import io
    try:
        # 确保输入是有效的字节数据
        if not image_bytes or len(image_bytes) == 0:
            raise Exception("空图片数据")
        
        # 打开图片
        img = Image.open(io.BytesIO(image_bytes))
        
        # 转换为RGB模式（如果不是）
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        
        # 调整大小
        width, height = img.size
        if max(width, height) > max_size:
            if width > height:
                new_width = max_size
                new_height = int(height * (max_size / width))
            else:
                new_height = max_size
                new_width = int(width * (max_size / height))
            # 使用抗锯齿算法调整大小
            img = img.resize((new_width, new_height), Image.LANCZOS)
        
        # 保存为JPEG格式
        output = io.BytesIO()
        # 如果是RGBA模式，需要处理透明度
        if img.mode == 'RGBA':
            # 创建白色背景
            background = Image.new('RGB', img.size, (255, 255, 255))
            # 粘贴图片，使用透明度作为遮罩
            background.paste(img, mask=img.split()[3])  # 3是alpha通道
            img = background
        # 保存图片，控制质量
        img.save(output, format='JPEG', quality=85, dpi=(dpi, dpi))
        compressed_bytes = output.getvalue()
        
        # 确保压缩后的图片大小合理
        if len(compressed_bytes) > 5 * 1024 * 1024:  # 5MB限制
            # 降低质量再次压缩
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=70, dpi=(dpi, dpi))
            compressed_bytes = output.getvalue()
        
        return compressed_bytes
    except Exception as e:
        logger.warning(f"Image compression failed: {str(e)}")
        # 压缩失败时返回原始数据
        return image_bytes

def _validate_tryon_image_url(image_url: str) -> bool:
    """验证试衣图片URL的有效性"""
    if not image_url:
        return False
    # 必须是HTTP/HTTPS链接
    if not image_url.startswith(('http://', 'https://')):
        return False
    if image_url.startswith(f"{PUBLIC_BASE_URL}/files/"):
        return True
    # 检查是否是真实的图片URL（避免返回默认图或无关图）
    try:
        # 检查URL格式
        from urllib.parse import urlparse
        parsed = urlparse(image_url)
        if not parsed.netloc:
            return False
        # 检查是否是已知的默认图或无关图
        invalid_patterns = ['default-top.png', 'placeholder', 'default-image']
        for pattern in invalid_patterns:
            if pattern in image_url.lower():
                return False
        import requests
        headers = {"Range": "bytes=0-2047"}
        response = requests.get(image_url, timeout=(5, 8), stream=True, headers=headers, allow_redirects=True)
        if response.status_code not in (200, 206):
            return False
        ct = str(response.headers.get("Content-Type") or "").lower()
        if "image" not in ct:
            return False
        return True
    except Exception:
        return False


def _fetch_tryon_image_bytes(url: str) -> bytes:
    u = str(url or "").strip()
    if not u:
        raise Exception("empty_url")
    b = _read_local_file_from_api_url(u)
    if b is not None:
        return b
    r = requests.get(u, timeout=(8, 20))
    r.raise_for_status()
    return r.content


def _simple_tryon_compose(person_bytes: bytes, garment_bytes: bytes, garment_type: str) -> bytes:
    from PIL import Image
    import io

    p = Image.open(io.BytesIO(person_bytes)).convert("RGBA")
    g = Image.open(io.BytesIO(garment_bytes)).convert("RGBA")

    pw, ph = p.size
    if garment_type == "bottom":
        scale = 0.62
        x0 = int(pw * 0.19)
        y0 = int(ph * 0.52)
    elif garment_type == "dress":
        scale = 0.72
        x0 = int(pw * 0.14)
        y0 = int(ph * 0.22)
    else:
        scale = 0.68
        x0 = int(pw * 0.16)
        y0 = int(ph * 0.20)

    target_w = max(80, int(pw * scale))
    gw, gh = g.size
    if gw <= 0 or gh <= 0:
        raise Exception("garment_invalid")
    target_h = max(80, int(gh * (target_w / gw)))
    g = g.resize((target_w, target_h), Image.LANCZOS)

    alpha = g.split()[-1]
    if alpha.getextrema() == (255, 255):
        rgb = g.convert("RGB")
        mask = Image.new("L", rgb.size, 0)
        px = rgb.load()
        mx = mask.load()
        for y in range(rgb.size[1]):
            for x in range(rgb.size[0]):
                r, gg, bb = px[x, y]
                if not (r > 245 and gg > 245 and bb > 245):
                    mx[x, y] = 255
        alpha = mask

    canvas = p.copy()
    canvas.alpha_composite(Image.new("RGBA", (pw, ph), (0, 0, 0, 0)))
    layer = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    layer.paste(g, (x0, y0), mask=alpha)
    out = Image.alpha_composite(canvas, layer).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=85, dpi=(72, 72))
    return buf.getvalue()


def _tryon_local_fallback(person_url: str, garments: List[Dict[str, str]]) -> Dict[str, Any]:
    pbytes = _fetch_tryon_image_bytes(person_url)
    current = pbytes
    steps = []
    for g in garments:
        gtype = str(g.get("garment_type") or "top")
        gurl = str(g.get("garment_image_url") or "").strip()
        if not gurl:
            continue
        gbytes = _fetch_tryon_image_bytes(gurl)
        current = _simple_tryon_compose(current, gbytes, gtype)
        steps.append({**g, "status": "success"})
    out = store_image(current, "tryon_local.jpg")
    return {"success": True, "mode": "local", "final_image_url": out.get("image_url") or "", "steps": steps}


def dashscope_tryon(person_url: str, garment_url: str, garment_type: str, cancel_check: Optional[Any] = None) -> Dict[str, Any]:
    # 检查缓存
    cache_key = _get_tryon_cache_key(person_url, garment_url, garment_type)
    with _tryon_cache_lock:
        cached = _tryon_cache.get(cache_key)
        if cached and (time.time() - cached.get("ts", 0)) < _tryon_cache_ttl:
            logger.info(f"使用缓存试衣结果: {cache_key}")
            return cached["result"]

    api_keys = _dashscope_rotated_keys()
    if not api_keys:
        return {"success": False, "message": "未配置任何 DashScope API Key"}

    # 验证输入URL的有效性
    if not _validate_tryon_image_url(person_url):
        return {"success": False, "message": "人物图片URL无效"}
    if not _validate_tryon_image_url(garment_url):
        return {"success": False, "message": "衣物图片URL无效"}

    dashscope_api_url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis"
    dashscope_task_url = "https://dashscope.aliyuncs.com/api/v1/tasks"

    top_garment_url = garment_url if garment_type in ("top", "dress") else None
    bottom_garment_url = garment_url if garment_type == "bottom" else None
    if not top_garment_url and not bottom_garment_url:
        top_garment_url = garment_url
    
    # 构建参数，添加上半身优化配置
    parameters = {
        "resolution": -1,
        "restore_face": True,
        "top_priority": True,  # 上半身优先处理
        "top_fit_optimization": True,  # 上半身贴合度优化
        "edge_refinement": True,  # 边缘细化处理
        "wrinkle_generation": True,  # 褶皱生成
        "texture_preservation": True,  # 纹理保护
        "color_calibration": True,  # 颜色校准
        "timeout": 30  # 超时控制
    }
    
    # 上半身专属优化参数
    if top_garment_url:
        parameters.update({
            "top_fit_params": {
                "shoulder_fit": 1.02,  # 肩宽计算：人体肩宽 × 1.02
                "top_length": 0.85,  # 衣长计算：人体上半身长度 × 0.85
                "sleeve_length": 0.98,  # 袖长计算：人体臂长 × 0.98
                "fit_algorithm": "hierarchical",  # 分级形变算法
                "fit_order": ["shoulder", "sleeve", "neckline", "hem"],  # 形变顺序
                "fit_error_threshold": 2,  # 形变误差控制在2像素以内
                "pattern_correction": True  # 图案服装矫正
            },
            "edge_params": {
                "edge_refinement": True,  # 边缘细化
                "edge_dilation": 3,  # 3-5像素膨胀
                "edge_contraction": 3,  # 等量收缩
                "alpha_blend": True,  # Alpha融合
                "blend_width": 5,  # 5像素过渡带
                "high_contrast_threshold": 0.8,  # 高对比度阈值
                "high_contrast_adjustment": 0.2  # 高对比度调整
            },
            "wrinkle_params": {
                "wrinkle_generation": True,  # 褶皱生成
                "wrinkle_density": "medium",  # 褶皱密度
                "wrinkle_locations": ["shoulder", "armpit", "cuff"],  # 褶皱位置
                "light_consistency": True,  # 光影一致性
                "shadow_opacity": 0.4,  # 阴影不透明度
                "highlight_brightness": 0.2,  # 高光亮度
                "drape_simulation": True,  # 垂坠模拟
                "drape_angle": 12  # 垂坠角度
            },
            "texture_params": {
                "texture_scale_limit": 1.2,  # 纹理缩放限制
                "color_calibration": True,  # 颜色校准
                "brightness_adjustment": 0.1,  # 亮度调整
                "contrast_adjustment": 0.15  # 对比度调整
            }
        })
    
    payload = {
        "model": "aitryon-plus",
        "input": {"person_image_url": person_url},
        "parameters": parameters
    }
    if top_garment_url:
        payload["input"]["top_garment_url"] = top_garment_url
    if bottom_garment_url:
        payload["input"]["bottom_garment_url"] = bottom_garment_url

    max_attempts = int(os.getenv("TRYON_MAX_ATTEMPTS") or "2")
    create_read_timeout = int(os.getenv("TRYON_CREATE_READ_TIMEOUT") or "60")
    query_read_timeout = int(os.getenv("TRYON_QUERY_READ_TIMEOUT") or "30")
    max_wait_seconds = int(os.getenv("TRYON_MAX_WAIT_SECONDS") or "180")
    poll_interval = float(os.getenv("TRYON_POLL_INTERVAL") or "3")
    last_result: Optional[Dict[str, Any]] = None
    for api_key in api_keys:
        api_key = str(api_key).strip()
        if not api_key:
            continue
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}", "X-DashScope-Async": "enable"}
        logger.info(
            "dashscope_tryon_call model=%s garment_type=%s key=%s person_url=%s garment_url=%s",
            payload.get("model"),
            garment_type,
            _mask_key(api_key),
            str(person_url)[:120],
            str(garment_url)[:120],
        )

        for attempt in range(max_attempts):
            try:
                start_time = time.time()

                if attempt > 0 and top_garment_url:
                    parameters["top_fit_params"]["shoulder_fit"] *= 1.05 if attempt % 2 == 0 else 0.95
                    parameters["top_fit_params"]["top_length"] *= 1.05 if attempt % 2 == 0 else 0.95
                    parameters["top_fit_params"]["sleeve_length"] *= 1.05 if attempt % 2 == 0 else 0.95
                    parameters["edge_params"]["high_contrast_adjustment"] *= 1.1 if attempt % 2 == 0 else 0.9
                    payload["parameters"] = parameters

                resp = requests.post(dashscope_api_url, json=payload, headers=headers, timeout=(10, create_read_timeout))
                request_time = time.time() - start_time
                logger.info(f"dashscope_tryon_request attempt={attempt+1} time={request_time:.2f}s status={resp.status_code}")

                if resp.status_code == 401 or resp.status_code == 403:
                    last_result = {"success": False, "message": f"百炼鉴权失败HTTP{resp.status_code}"}
                    break
                if resp.status_code < 200 or resp.status_code >= 300:
                    logid = resp.headers.get("x-tt-logid") or resp.headers.get("x-dashscope-request-id")
                    logger.error(f"DashScope API error: {resp}")
                    logger.error(f"Response content: {resp.text[:800]}")
                    if attempt < max_attempts - 1:
                        logger.warning(f"Attempt {attempt+1} failed, retrying...")
                        time.sleep(2)
                        continue
                    last_result = {
                        "success": False,
                        "message": f"百炼返回HTTP{resp.status_code}: {resp.text[:800]}{(' (logid: '+logid+')') if logid else ''}",
                    }
                    break

                task_id = (resp.json() or {}).get("output", {}).get("task_id")
                if not task_id:
                    if attempt < max_attempts - 1:
                        logger.warning(f"Attempt {attempt+1} failed (no task_id), retrying...")
                        time.sleep(2)
                        continue
                    last_result = {"success": False, "message": f"百炼未返回task_id: {resp.text[:800]}"}
                    break

                headers2 = {"Authorization": f"Bearer {api_key}"}
                start = time.time()
                while True:
                    try:
                        if cancel_check and bool(cancel_check()):
                            return {"success": False, "message": "任务已取消", "canceled": True}
                    except Exception:
                        pass
                    if time.time() - start > max_wait_seconds:
                        if attempt < max_attempts - 1:
                            logger.warning(f"Attempt {attempt+1} timeout, retrying...")
                            break
                        last_result = {"success": False, "message": f"百炼任务超时: {task_id}"}
                        break
                    q = requests.get(f"{dashscope_task_url}/{task_id}", headers=headers2, timeout=(10, query_read_timeout))
                    if q.status_code == 401 or q.status_code == 403:
                        last_result = {"success": False, "message": f"百炼鉴权失败HTTP{q.status_code}"}
                        break
                    if q.status_code < 200 or q.status_code >= 300:
                        logid = q.headers.get("x-tt-logid") or q.headers.get("x-dashscope-request-id")
                        logger.error(f"DashScope API error: {q}")
                        logger.error(f"Response content: {q.text[:800]}")
                        if attempt < max_attempts - 1:
                            logger.warning(f"Attempt {attempt+1} failed (query), retrying...")
                            time.sleep(2)
                            break
                        last_result = {"success": False, "message": f"百炼查询失败HTTP{q.status_code}: {q.text[:800]}{(' (logid: '+logid+')') if logid else ''}"}
                        break
                    rj = q.json() or {}
                    status = rj.get("output", {}).get("task_status", "UNKNOWN")
                    if status == "SUCCEEDED":
                        image_url = rj.get("output", {}).get("image_url")
                        # 将百炼返回的图片转存到自己的 OSS，确保公网可访问
                        try:
                            img_resp = requests.get(image_url, timeout=30)
                            if img_resp.status_code == 200:
                                stored = store_image(img_resp.content, "tryon_result.jpg")                                                                                                                          
                                image_url = stored["image_url"]
                            logger.info(f"Transferred tryon result to OSS: {image_url}")
                        except Exception as e:          
                            logger.warning(f"Failed to transfer image to OSS: {e}, using original URL")
                        if not image_url:
                            if attempt < max_attempts - 1:
                                logger.warning(f"Attempt {attempt+1} failed (no image_url), retrying...")
                                time.sleep(2)
                                break
                            last_result = {"success": False, "message": f"百炼成功但无image_url: {str(rj)[:800]}"}
                            break
                        if str(image_url).strip() == str(person_url).strip() or str(image_url).strip() == str(garment_url).strip():
                            if attempt < max_attempts - 1:
                                logger.warning(f"Attempt {attempt+1} failed (image_url equals input), retrying...")
                                time.sleep(2)
                                break
                            last_result = {"success": False, "message": "生成的试衣图片疑似兜底结果（与输入相同）"}
                            break
                        if not _validate_tryon_image_url(image_url):
                            if attempt < max_attempts - 1:
                                logger.warning(f"Attempt {attempt+1} failed (invalid image_url), retrying...")
                                time.sleep(2)
                                break
                            last_result = {"success": False, "message": "生成的试衣图片无效"}
                            break
                        total_time = time.time() - start_time
                        logger.info(f"dashscope_tryon_success task_id={task_id} total_time={total_time:.2f}s")
                        
                        # 存入缓存
                        with _tryon_cache_lock:
                            _tryon_cache[cache_key] = {
                                "ts": time.time(),
                                "result": {
                                    "success": True,
                                    "image_url": image_url,
                                    "task_id": task_id,
                                    "model": payload.get("model"),
                                    "garment_type": garment_type,
                                    "total_time": total_time,
                                    "parameters": parameters,
                                    "cached": False
                                }
                            }
                        
                        return {
                            "success": True,
                            "image_url": image_url,
                            "task_id": task_id,
                            "model": payload.get("model"),
                            "garment_type": garment_type,
                            "total_time": total_time,
                            "parameters": parameters,
                        }
                    if status == "FAILED":
                        code = rj.get("output", {}).get("code", "Unknown")
                        msg = rj.get("output", {}).get("message", "Unknown error")
                        if attempt < max_attempts - 1:
                            logger.warning(f"Attempt {attempt+1} failed: {code} - {msg}, retrying...")
                            time.sleep(2)
                            break
                        last_result = {"success": False, "message": f"百炼任务失败：{code} - {msg}"}
                        break
                    time.sleep(poll_interval)
                if last_result and (last_result.get("message") or "").startswith("百炼鉴权失败HTTP"):
                    break
            except Exception as e:
                logger.exception(f"dashscope_tryon_attempt_{attempt+1}_error")
                logger.error(f"DashScope API error: {str(e)}")
                if attempt < max_attempts - 1:
                    logger.warning(f"Attempt {attempt+1} failed with exception, retrying...")
                    time.sleep(2)
                    continue
                last_result = {"success": False, "message": f"百炼调用异常：{str(e)}"}
                break
        if last_result and (last_result.get("message") or "").startswith("百炼鉴权失败HTTP"):
            continue

    return last_result or {"success": False, "message": "所有尝试都失败了"}


_tryon_chain_logger = logging.getLogger("tryon_chain")
try:
    _tryon_chain_logger.setLevel(logging.INFO)
    _tryon_chain_logger.propagate = False
    _tryon_chain_log_path = str((BASE_DIR / "tryon_chain.log"))
    if not any(isinstance(h, logging.FileHandler) and (getattr(h, "baseFilename", "") == _tryon_chain_log_path) for h in _tryon_chain_logger.handlers):
        _tcl_fh = logging.FileHandler(_tryon_chain_log_path, encoding="utf-8")
        _tcl_fh.setLevel(logging.INFO)
        _tryon_chain_logger.addHandler(_tcl_fh)
except Exception:
    pass


def _calc_image_quality_metrics(url: str) -> Dict[str, Any]:
    try:
        from PIL import Image, ImageFilter, ImageStat
        import io

        b = _fetch_tryon_image_bytes(url)
        img = Image.open(io.BytesIO(b))
        w, h = img.size
        mode = img.mode
        g = img.convert("L")
        brightness = float(ImageStat.Stat(g).mean[0])
        edges = g.filter(ImageFilter.FIND_EDGES)
        edge_mean = float(ImageStat.Stat(edges).mean[0])
        return {"bytes": int(len(b)), "width": int(w), "height": int(h), "mode": str(mode), "brightness": brightness, "edge_mean": edge_mean}
    except Exception as e:
        return {"error": str(e)}


def dashscope_tryon_chain(person_url: str, garment_url: str, garment_type: str, cancel_check: Optional[Any] = None) -> Dict[str, Any]:
    trace_id = uuid.uuid4().hex
    started = time.time()
    try:
        import hashlib
        t1 = time.time()
        r1 = dashscope_tryon(person_url, garment_url, garment_type, cancel_check=cancel_check)
        d1 = time.time() - t1
        if not r1.get("success"):
            if r1.get("canceled"):
                return {"success": False, "message": "任务已取消", "canceled": True, "trace_id": trace_id}
            return {**r1, "trace_id": trace_id}
        mid_url = str(r1.get("image_url") or "").strip()

        t2 = time.time()
        r2 = dashscope_tryon(mid_url, garment_url, garment_type, cancel_check=cancel_check)
        d2 = time.time() - t2
        if not r2.get("success"):
            if r2.get("canceled"):
                return {"success": False, "message": "任务已取消", "canceled": True, "trace_id": trace_id}
            return {**r2, "trace_id": trace_id}
        final_url = str(r2.get("image_url") or "").strip()

        m1 = _calc_image_quality_metrics(mid_url) if mid_url else {}
        m2 = _calc_image_quality_metrics(final_url) if final_url else {}

        rec = {
            "ts": time.time(),
            "trace_id": trace_id,
            "garment_type": garment_type,
            "person_url_hash": hashlib.md5(str(person_url).encode("utf-8")).hexdigest(),
            "garment_url_hash": hashlib.md5(str(garment_url).encode("utf-8")).hexdigest(),
            "step1": {"ok": True, "task_id": r1.get("task_id"), "model": r1.get("model"), "duration": d1, "metrics": m1, "parameters": r1.get("parameters")},
            "step2": {"ok": True, "task_id": r2.get("task_id"), "model": r2.get("model"), "duration": d2, "metrics": m2, "parameters": r2.get("parameters")},
            "total_duration": time.time() - started,
        }
        try:
            _tryon_chain_logger.info(_json_dumps_safe(rec))
        except Exception:
            pass

        return {"success": True, "image_url": final_url, "trace_id": trace_id, "mode": "real_chain"}
    except Exception as e:
        try:
            _tryon_chain_logger.info(_json_dumps_safe({"ts": time.time(), "trace_id": trace_id, "error": str(e)}))
        except Exception:
            pass
        return {"success": False, "message": f"试衣失败：{str(e)}", "trace_id": trace_id}


def recommend_rule_based(scene: str, temperature: float, purpose: str, clothes_list: List[Dict[str, Any]], style: Optional[str]) -> Dict[str, Any]:
    """智能穿搭推荐逻辑"""
    # 按类型分组衣服
    clothes_by_type = {}
    for c in clothes_list:
        c_type = c.get("type") or ""
        if c_type not in clothes_by_type:
            clothes_by_type[c_type] = []
        clothes_by_type[c_type].append(c)
    
    # 根据温度和场景选择合适的衣服
    selected_items = []
    
    # 选择上衣
    if "上衣" in clothes_by_type:
        # 优先选择适合当前场景和风格的上衣
        suitable_tops = [c for c in clothes_by_type["上衣"] if 
                        (scene in c.get("occasion", "") or "通用" in c.get("occasion", "")) and
                        (style in c.get("fashion_style", "") or not style)]
        if suitable_tops:
            selected_items.append(suitable_tops[0])
    
    # 选择裤子
    if "裤子" in clothes_by_type:
        suitable_bottoms = [c for c in clothes_by_type["裤子"] if 
                          (scene in c.get("occasion", "") or "通用" in c.get("occasion", "")) and
                          (style in c.get("fashion_style", "") or not style)]
        if suitable_bottoms:
            selected_items.append(suitable_bottoms[0])
    
    # 根据温度选择外套
    if temperature < 18 and "外套" in clothes_by_type:
        suitable_coats = [c for c in clothes_by_type["外套"] if 
                         (scene in c.get("occasion", "") or "通用" in c.get("occasion", "")) and
                         (style in c.get("fashion_style", "") or not style)]
        if suitable_coats:
            selected_items.append(suitable_coats[0])
    
    # 选择鞋子
    if "鞋子" in clothes_by_type:
        suitable_shoes = [c for c in clothes_by_type["鞋子"] if 
                         (scene in c.get("occasion", "") or "通用" in c.get("occasion", "")) and
                         (style in c.get("fashion_style", "") or not style)]
        if suitable_shoes:
            selected_items.append(suitable_shoes[0])
    
    # 检查缺少的物品
    required_types = ["上衣", "裤子", "鞋子"]
    missing_items = []
    for required_type in required_types:
        if required_type not in clothes_by_type:
            missing_items.append({
                "type": required_type,
                "suggestion": f"缺少{required_type}，建议补充",
                "budget_range": "根据场景选择合适价位"
            })
    
    # 生成搭配理由
    reason_parts = []
    reason_parts.append(f"场景为「{scene}」，温度约 {temperature}°C。")
    
    if temperature < 18:
        reason_parts.append("温度偏低，建议穿着保暖衣物，可添加外套增加层次感。")
    elif temperature > 28:
        reason_parts.append("温度较高，建议穿着轻便透气的衣物。")
    else:
        reason_parts.append("温度适中，可根据个人喜好选择合适的穿搭。")
    
    if purpose:
        reason_parts.append(f"今日目的：{purpose}，选择适合该场合的着装风格。")
    
    if style:
        reason_parts.append(f"风格偏好：{style}，选择符合该风格的服装单品。")
    
    reason = " ".join(reason_parts)
    
    # 生成穿搭建议
    tips = []
    if style == "简约":
        tips.append("简约风格建议使用中性色调，注重线条和剪裁。")
    elif style == "复古":
        tips.append("复古风格可选择有年代感的单品，搭配经典配饰。")
    elif style == "休闲":
        tips.append("休闲风格注重舒适感，可选择宽松版型的衣物。")
    elif style == "商务":
        tips.append("商务风格建议选择正式单品，注重整体协调。")
    
    tips.append("上下装颜色搭配建议：避免过于鲜艳的对比色，选择协调的色系。")
    tips.append("根据场合调整服装正式程度，确保得体大方。")
    
    # 确定颜色方案
    color_scheme = {"primary": "中性色", "accent": "低饱和点缀"}
    if style == "复古":
        color_scheme = {"primary": "暖色调", "accent": "复古图案"}
    elif style == "商务":
        color_scheme = {"primary": "深色系", "accent": "精致细节"}
    
    return {
        "scene": scene,
        "temperature": temperature,
        "items": selected_items,
        "reason": reason,
        "selected_items": selected_items,
        "missing_items": missing_items,
        "tips": tips,
        "color_scheme": color_scheme,
        "confidence": 0.8
    }


app = FastAPI(title="AI穿搭API v3", version="3.0.0")

# Configure CORS to allow frontend access
_cors_raw = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_ORIGIN") or PUBLIC_BASE_URL
_cors_origins = [v.strip() for v in str(_cors_raw).split(",") if v.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def perf_middleware(request: Request, call_next):
    start = time.time()
    status_code = 500
    request_id = uuid.uuid4().hex[:12]
    try:
        response = await call_next(request)
        status_code = int(getattr(response, "status_code", 200) or 200)
        return response
    finally:
        duration_ms = (time.time() - start) * 1000.0
        _perf_record(request.url.path, request.method, status_code, duration_ms, request_id)
        slow_ms = int(os.getenv("SLOW_REQUEST_MS") or "2000")
        if duration_ms >= slow_ms:
            logger.warning(
                "slow_request request_id=%s method=%s path=%s status=%s duration_ms=%d",
                request_id,
                request.method,
                request.url.path,
                status_code,
                int(duration_ms),
            )

app.add_api_route("/api/missing-item/image/task/{task_id}", get_missing_item_image_task, methods=["GET"])
app.add_api_route("/api/metrics/taobao-click", metrics_taobao_click, methods=["POST"])


@app.get("/health")
async def health():
    return ok({"status": "healthy"})


@app.get("/api/debug/dashscope")
async def debug_dashscope():
    return await _debug_dashscope_handler()


@app.get("/api/debug/perf")
async def debug_perf():
    with _perf_lock:
        return ok({"stats": _perf_stats, "recent_slow": list(_perf_recent_slow)}, "ok")


@app.get("/files/{key}")
async def files(key: str):
    p = (_local_dir / key).resolve()
    if not str(p).startswith(str(_local_dir.resolve())) or not p.exists():
        return fail("文件不存在")
    return FileResponse(str(p))


@app.get("/api/weather/query")
async def weather_query(lat: float, lon: float, unit: str = "C", callback: Optional[str] = None):
    try:
        data = fetch_weather(lat, lon, unit)
        result = ok(data)
        
        # 支持JSONP
        if callback:
            return JSONResponse(
                content=f"{callback}({result.body.decode()})",
                media_type="application/javascript"
            )
        return result
    except Exception as e:
        logger.exception("weather_query_failed")
        result = fail("天气查询失败，请稍后重试", {"error": str(e)})
        
        # 支持JSONP错误处理
        if callback:
            return JSONResponse(
                content=f"{callback}({result.body.decode()})",
                media_type="application/javascript"
            )
        return result


@app.post("/api/weather/query")
async def weather_query_post(body: Dict[str, Any]):
    try:
        # 检查是否提供了location或address参数
        location = body.get("location") or body.get("address")
        if location:
            # 根据所在地名称查询天气
            result = fetch_weather_by_location(str(location), str(body.get("unit") or "C"))
            if result.get("success"):
                return ok(result.get("data"), result.get("message"))
            else:
                return fail(result.get("message"), result.get("data"))
        
        # 否则使用经纬度查询
        lat = body.get("lat")
        lon = body.get("lon")
        if lat is None or lon is None:
            return fail("缺少 lat 或 lon 参数")
        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            return fail("lat 或 lon 参数格式错误")
        unit = str(body.get("unit") or "C")
        data = fetch_weather(lat, lon, unit)
        return ok(data)
    except Exception as e:
        logger.exception("weather_query_failed")
        return fail("天气查询失败，请稍后重试", {"error": str(e)})


@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        out = store_image(raw, file.filename or "image.jpg")
        return ok(out, "图片上传成功")
    except Exception as e:
        logger.exception("upload_image_failed")
        return fail("图片上传失败", {"error": str(e)})


@app.post("/api/upload/base64")
async def upload_base64(image_base64: str, file_name: str = "image.jpg"):
    try:
        raw = base64_to_bytes(image_base64)
        out = store_image(raw, file_name)
        return ok(out, "图片上传成功")
    except Exception as e:
        logger.exception("upload_base64_failed")
        return fail("图片上传失败", {"error": str(e)})


@app.post("/api/upload/to-oss")
async def upload_to_oss(file: UploadFile = File(...)):
    try:
        if not _oss_enabled():
            return fail("未配置 OSS（OSS_* 环境变量）", {})
        raw = await file.read()
        suffix = ".jpg"
        if (file.filename or "").lower().endswith(".png"):
            suffix = ".png"
        object_key = f"tryon/{time.strftime('%Y%m%d')}/{uuid.uuid4().hex}{suffix}"
        out = _upload_bytes_to_oss(raw, object_key, "image/png" if suffix == ".png" else "image/jpeg")
        return ok({"oss_url": out["image_url"], "object_key": out["image_key"]}, "上传 OSS 成功")
    except Exception as e:
        logger.exception("upload_to_oss_failed")
        return fail("上传 OSS 失败", {"error": str(e)})


class UploadUrlToOssBody(BaseModel):
    image_url: str


@app.post("/api/upload/url-to-oss")
async def upload_url_to_oss(body: UploadUrlToOssBody):
    try:
        if not _oss_enabled():
            return fail("未配置 OSS（OSS_* 环境变量）", {})
        url = (body.image_url or "").strip()
        if not url:
            return fail("缺少 image_url", {})
        promoted = _promote_url_to_oss(url)
        if not promoted:
            return fail("URL 无法上传到 OSS（仅支持本机 localhost 或 /files/ 路径）", {})
        return ok({"oss_url": promoted}, "上传 OSS 成功")
    except Exception as e:
        logger.exception("upload_url_to_oss_failed")
        return fail("上传 OSS 失败", {"error": str(e)})


@app.post("/api/outfit/recommend")
async def outfit_recommend(request: Request):
    try:
        user_id = _get_request_user_id(request)
        
        # 2. 获取前端传入的场景参数
        data = await request.json()
        scenario = (data.get("scenario") or data.get("scene") or data.get("occasion") or "").strip()
        purpose = (data.get("purpose") or "").strip()
        style = (data.get("style") or data.get("style_preference") or "").strip()
        weather_type = (data.get("weather_type") or data.get("weather") or "").strip()
        tempC = data.get("tempC") if data.get("tempC") is not None else data.get("temperature")
        
        user_clothes = fetch_user_clothes_from_db(user_id)
        
        if len(user_clothes) == 0:
            return {
                "success": False,
                "data": {"reason": "", "selected_items": [], "error": "你还没有录入任何衣物，无法生成推荐"},
                "message": "你还没有录入任何衣物，无法生成推荐",
                "reason": "",
                "selected_items": [],
                "error": "你还没有录入任何衣物，无法生成推荐"
            }
        
        import random
        import re
        from urllib.parse import quote

        rng = random.Random()
        rng.seed(f"{user_id}-{int(time.time() * 1_000_000_000)}")

        by_type: Dict[str, List[Dict[str, Any]]] = {"上衣": [], "裤子": [], "外套": [], "鞋子": [], "配饰": []}
        others: List[Dict[str, Any]] = []
        for it in user_clothes:
            t = str(it.get("type") or "").strip()
            if t in by_type:
                by_type[t].append(it)
            else:
                others.append(it)
        for k in by_type:
            rng.shuffle(by_type[k])
        rng.shuffle(others)

        used_item_ids: set[str] = set()
        used_item_names: set[str] = set()

        def _item_key(item: Dict[str, Any]) -> str:
            return str(item.get("id") or item.get("name") or uuid.uuid4().hex)

        def _pick_from(pool: List[Dict[str, Any]], keywords: List[str]) -> Optional[Dict[str, Any]]:
            for it in pool:
                ik = _item_key(it)
                if ik in used_item_ids:
                    continue
                nm = str(it.get("name") or "").strip()
                if not nm or nm in used_item_names:
                    continue
                txt = f"{it.get('name','')} {it.get('fashion_style','')} {it.get('occasion','')}"
                if any(kw in txt for kw in keywords):
                    used_item_ids.add(ik)
                    used_item_names.add(nm)
                    return it
            for it in pool:
                ik = _item_key(it)
                if ik in used_item_ids:
                    continue
                nm = str(it.get("name") or "").strip()
                if not nm or nm in used_item_names:
                    continue
                used_item_ids.add(ik)
                used_item_names.add(nm)
                return it
            return None

        style_plans = [
            {"title": "方案1", "style_tag": "通勤", "scene": "日常通勤/办公室", "keywords": ["商务", "通勤", "简约", "正式"]},
            {"title": "方案2", "style_tag": "休闲", "scene": "休闲约会/周末出行", "keywords": ["休闲", "街头", "潮流", "复古"]},
            {"title": "方案3", "style_tag": "运动", "scene": "运动健身/户外活动", "keywords": ["运动", "机能", "训练", "户外"]},
        ]

        def _ensure_non_empty(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for it in items:
                if it and str(it.get("name") or "").strip():
                    out.append(it)
            return out

        outfits: List[Dict[str, Any]] = []
        for plan in style_plans:
            picked: List[Dict[str, Any]] = []
            top = _pick_from(by_type["上衣"], plan["keywords"]) or _pick_from(others, plan["keywords"])
            bottom = _pick_from(by_type["裤子"], plan["keywords"]) or _pick_from(others, plan["keywords"])
            outer = _pick_from(by_type["外套"], plan["keywords"])
            shoes = _pick_from(by_type["鞋子"], plan["keywords"])
            accessory = _pick_from(by_type["配饰"], plan["keywords"])

            # 严格限制只使用数据库中已存在的服装单品，不再生成虚拟单品
            picked = []
            if top:
                picked.append(top)
            if bottom:
                picked.append(bottom)
            if outer:
                picked.insert(0, outer)
            if shoes:
                picked.append(shoes)
            if accessory:
                picked.append(accessory)

            picked = _ensure_non_empty(picked)
            outfits.append({"title": plan["title"], "style_tag": plan["style_tag"], "scene": plan["scene"], "selected_items": picked, "reason": ""})

        def _needs_image(it: Dict[str, Any]) -> bool:
            u = str(it.get("image_url") or "").strip()
            return not u

        candidates: List[Dict[str, Any]] = []
        for of in outfits:
            for it in of["selected_items"]:
                if _needs_image(it):
                    nm = str(it.get("name") or "").strip()
                    if nm:
                        candidates.append(it)

        for of in outfits:
            for it in of["selected_items"]:
                if _needs_image(it):
                    it["image_url"] = f"{_wardrobe_image_base()}/img/placeholder.svg"
        generated_count = 0

        reasons_prompt = (
            "你是专业男装搭配师。请为以下3套穿搭分别写出专业、详细、互不重复的搭配理由。\n"
            "硬性要求（必须全部满足）：\n"
            "1) 每套理由必须 3-5 句，至少 3 句，每句不少于 15 个汉字。\n"
            "2) 每套理由必须同时包含：风格解析 + 版型选择 + 色彩搭配 + 场景适配 + 质感说明。\n"
            "3) 三套理由不能复用句式或描述，不能出现重复段落。\n"
            "4) 不允许把某套的单品写到另一套里，不允许跨方案复用同一件单品的描述。\n"
            "5) 语言要专业连贯，禁止只写一句“建议补充鞋子/配饰”这种泛泛而谈。\n"
            "输出格式严格为：\n"
            "方案1理由：...\n方案2理由：...\n方案3理由：...\n"
        )
        for of in outfits:
            names = "、".join([str(it.get("name") or "").strip() for it in of["selected_items"]])
            reasons_prompt += f"\n{of['title']}（风格：{of['style_tag']}，场景：{of['scene']}，单品：{names}）\n"

        llm_reasons: Dict[str, str] = {}
        try:
            llm_text = call_aliyun_llm_with_fallback(reasons_prompt)
            for i in range(1, 4):
                m = re.search(rf"方案{i}理由：\s*(.+?)(?=方案\d理由：|$)", llm_text, re.DOTALL)
                if m:
                    llm_reasons[f"方案{i}"] = m.group(1).strip()
        except Exception:
            llm_reasons = {}

        def _reason_quality_ok(text: str) -> bool:
            t = (text or "").strip()
            if len(t) < 60:
                return False
            parts = [p.strip() for p in re.split(r"[。！？\n]+", t) if p and p.strip()]
            if len(parts) < 3 or len(parts) > 8:
                return False
            if any(len(p) < 15 for p in parts[:5]):
                return False
            return True

        for idx, of in enumerate(outfits):
            rtxt = (llm_reasons.get(of["title"]) or "").strip()
            if not _reason_quality_ok(rtxt):
                of["reason"] = _fallback_outfit_reason(of["scene"], purpose, of["style_tag"], tempC, weather_type, of["selected_items"])
            else:
                of["reason"] = rtxt

        priority_order = ["鞋子", "配饰", "裤子"]
        detected_missing: List[Dict[str, Any]] = []
        for of in outfits:
            present_types = set(str(it.get("type") or "").strip() for it in (of.get("selected_items") or []))
            recognized_types = sorted([t for t in present_types if t])
            for t in priority_order:
                if t not in present_types:
                    detected_missing.append({"category": t, "style_tag": str(of.get("style_tag") or ""), "recognized_types": recognized_types})

        detected_by_type: Dict[str, int] = {}
        manual_search: List[Dict[str, Any]] = []
        for it in detected_missing:
            cat = str(it.get("category") or "").strip()
            if cat:
                detected_by_type[cat] = detected_by_type.get(cat, 0) + 1
        for cat, cnt in detected_by_type.items():
            visual = _guess_missing_item_visual_spec(cat, "通勤")
            manual_search.append({"category": cat, "count": cnt, "taobaoKeyword": _build_taobao_keyword_for_missing_item(cat, "通勤", visual)})

        placeholder_url = "/img/placeholder.svg"
        missing_items: List[Dict[str, Any]] = []
        used_cats: set[str] = set()
        max_tasks = int(os.getenv("MISSING_IMAGE_TASK_LIMIT") or "12")
        task_count = 0
        for cand in detected_missing:
            cat = str(cand.get("category") or "").strip()
            if not cat or cat in used_cats:
                continue
            used_cats.add(cat)
            cnt = int(detected_by_type.get(cat) or 0)
            style_tag = str(cand.get("style_tag") or "").strip() or "通勤"
            recognized_types = cand.get("recognized_types") or []
            visual = _guess_missing_item_visual_spec(cat, style_tag)
            kw = _build_taobao_keyword_for_missing_item(cat, style_tag, visual)
            taobao_url = f"https://s.taobao.com/search?q={quote(kw)}"
            main_color = (visual.get("colorInfo") or "").split("；", 1)[0].replace("主色：", "").strip()
            sub_category = str(visual.get("subCategory") or "").strip()
            detail_hint = _missing_item_detail_hint(cat, sub_category, style_tag)
            reason_text = _build_missing_item_reason_text(cat, style_tag, recognized_types, visual)
            example_text = f"{kw} {detail_hint} {visual.get('stripeDetail') or ''}".strip()
            item: Dict[str, Any] = {
                "category": cat,
                "type": cat,
                "count": cnt,
                "style": style_tag,
                "scene": str(cand.get("scene") or "") or "",
                "name": f"{main_color}{sub_category}（{style_tag}风格）" if (main_color or sub_category) else f"{cat}（{style_tag}风格）",
                "example": example_text,
                "suggestion": f"推荐：{main_color}{sub_category}，{visual.get('stripeDetail') or ''}{detail_hint}".strip("，"),
                "reason": reason_text,
                "taobaoKeyword": kw,
                "taobao_keyword": kw,
                "taobao_link": taobao_url,
                "taobao_url": taobao_url,
                "subCategory": visual.get("subCategory") or "",
                "colorInfo": visual.get("colorInfo") or "",
                "stripeDetail": visual.get("stripeDetail") or "",
                "detailedDescription": f"具体细分类别：{visual.get('subCategory') or ''}；颜色信息：{visual.get('colorInfo') or ''}；条纹细节：{visual.get('stripeDetail') or ''}；{detail_hint}".strip("；"),
                "imageUrl": placeholder_url,
                "image_url": placeholder_url,
            }
            if task_count < max_tasks:
                task_id = uuid.uuid4().hex
                item["image_task_id"] = task_id
                _task_results[task_id] = {"status": "pending", "message": "任务初始化", "kind": "missing_item_image"}
                _task_executor.submit(_missing_item_image_task_worker, task_id, user_id, cat, style_tag, recognized_types)
                task_count += 1
            missing_items.append(item)
            if len(missing_items) >= 3:
                break

        missing_items_info = {"count": sum(detected_by_type.values()), "types": list(detected_by_type.keys()), "by_type": detected_by_type, "manual_search": manual_search}
        

        
        outfits = outfits[:3]
        
        # 为所有穿搭方案中的选中衣物添加淘宝跳转链接
        for outfit in outfits:
            selected_items = outfit.get("selected_items", [])
            for item in selected_items:
                item_name = item.get("name", "")
                item["taobao_link"] = generate_taobao_link(item_name)
        
        default_outfit = outfits[0]
        
        payload = {
            "reason": default_outfit["reason"], 
            "selected_items": default_outfit["selected_items"], 
            "missing_items": missing_items, 
            "missing_items_info": missing_items_info,  # 添加缺失单品数量信息
            "error": "",
            "outfits": outfits  # 添加所有3套方案
        }
        return {
            "success": True,
            "data": payload,
            "message": "搭配推荐生成成功",
            "reason": default_outfit["reason"],
            "selected_items": default_outfit["selected_items"],
            "missing_items": missing_items,
            "missing_items_info": missing_items_info,  # 添加缺失单品数量信息
            "outfits": outfits,  # 添加所有3套方案
            "error": ""
        }
    except Exception as e:
        err = str(e)
        return {
            "success": False,
            "data": {"reason": "", "selected_items": [], "missing_items": [], "missing_items_info": {"count": 0, "types": [], "by_type": {}}, "outfits": [], "error": err},
            "message": "推荐接口异常",
            "reason": "",
            "selected_items": [],
            "missing_items": [],
            "missing_items_info": {"count": 0, "types": [], "by_type": {}},
            "outfits": [],
            "error": err
        }


@app.get("/api/wardrobe/clothes")
async def get_wardrobe_clothes(request: Request):
    """获取衣橱衣服数据"""
    try:
        user_id = _get_request_user_id(request)
        clothes = fetch_user_clothes_from_db(user_id)
        return ok(clothes, "获取成功")
    except Exception as e:
        logger.exception("get_wardrobe_clothes_failed")
        return JSONResponse(status_code=200, content={"success": False, "data": [], "message": f"获取衣物失败：{str(e)}"})


@app.get("/api/test/database")
async def test_database():
    """测试数据库连接"""
    try:
        clothes = fetch_user_clothes_from_db(DEFAULT_USER_ID)
        return {"success": True, "data": clothes, "message": "数据库查询成功", "db_config": {"host": DB_HOST, "port": DB_PORT, "user": DB_USER, "db": DB_NAME}}
    except Exception as e:
        return {
            "success": False,
            "data": [],
            "message": f"数据库查询失败：{str(e)}"
        }


@app.post("/api/outfit/recommend/stream")
async def outfit_recommend_stream(request: Request):
    """流式生成穿搭推荐"""
    try:
        user_id = _get_request_user_id(request)
        
        # 获取前端传入的场景参数
        data = await request.json()
        scenario = (data.get("scenario") or data.get("scene") or data.get("occasion") or "").strip()
        purpose = (data.get("purpose") or "").strip()
        style = (data.get("style") or data.get("style_preference") or "").strip()
        weather_type = (data.get("weather_type") or data.get("weather") or "").strip()
        tempC = data.get("tempC") if data.get("tempC") is not None else data.get("temperature")
        
        user_clothes = fetch_user_clothes_from_db(user_id)
        
        if len(user_clothes) == 0:
            yield {"status": "error", "message": "你还没有录入任何衣物，无法生成推荐"}
            return
        
        # 随机抽取衣物，增加多样性
        import random
        random.shuffle(user_clothes)
        
        # 拼接Prompt，充分利用所有字段
        clothes_text = ""
        for item in user_clothes:
            clothes_text += f"""
            - 名称：{item['name']}，颜色：{item.get('color', '未知')}，类型：{item['type']}
              材质：{item.get('material', '未知')}，季节：{item.get('season', '未知')}，风格：{item.get('fashion_style', '未知')}
              适合温度：{item.get('suitable_temp', '未知')}，品牌：{item.get('brand', '未知')}
            """
        weather_line = ""
        if tempC is not None or weather_type:
            weather_line = f"天气：{str(tempC) if tempC is not None else '未知'}℃，{weather_type or '未知'}"
        prompt = f"""
        你是专业男装搭配师，根据以下信息生成穿搭方案：
        - 天气：{weather_line}
        - 场景：{scenario}
        - 目的：{purpose}
        - 风格偏好：{style}
        - 用户现有衣物：{clothes_text}
        
        要求：
        1. 生成3套完全不同的穿搭方案，每套都有详细的搭配理由
        2. 3套穿搭必须风格/单品组合/场景适配完全不同
        3. 每套穿搭的核心单品（上衣/裤子/外套）不能重复
        4. 每套穿搭的搭配理由必须完全不同，分别对应不同的场景/风格亮点
        5. 每套搭配理由必须包含：风格说明、色彩搭配逻辑、场合适配性说明
        6. 对比用户现有衣物，推荐可实现的搭配，选中衣物必须来自用户现有衣物列表
        7. 输出文字要自然可读，不要只给关键词
        
        搭配主题建议：
        - 第1套：主打「日常通勤」，侧重简约舒适
        - 第2套：主打「休闲约会」，侧重潮流个性
        - 第3套：主打「运动健身」，侧重轻便实用
        
        输出格式：
        方案1：
        搭配理由：详细的搭配理由（必须包含风格说明、色彩搭配逻辑、场合适配性说明）
        选中衣物：用中文逗号分隔的衣物名称列表（必须来自用户现有衣物）
        
        方案2：
        搭配理由：详细的搭配理由（必须包含风格说明、色彩搭配逻辑、场合适配性说明）
        选中衣物：用中文逗号分隔的衣物名称列表（必须来自用户现有衣物）
        
        方案3：
        搭配理由：详细的搭配理由（必须包含风格说明、色彩搭配逻辑、场合适配性说明）
        选中衣物：用中文逗号分隔的衣物名称列表（必须来自用户现有衣物）
        """
        
        # 流式调用大模型
        yield {"status": "generating", "message": "正在生成穿搭方案..."}
        
        try:
            logger.info(f"开始流式调用大模型，Prompt 长度: {len(prompt)}")
            full_response = ""
            async for chunk in call_aliyun_llm_stream(prompt, QWEN_MAIN_MODEL):
                full_response += chunk
                yield {"status": "streaming", "chunk": chunk}
            logger.info(f"大模型流式调用成功，响应长度: {len(full_response)}")
        except Exception as e:
            err = str(e)
            logger.exception("outfit_recommend_stream_llm_failed")
            yield {"status": "error", "message": f"生成失败：{err}"}
            return
        
        # 解析大模型响应
        outfits = []
        lines = full_response.split("\n")
        current_outfit = None
        for line in lines:
            line = line.strip()
            if line.startswith("方案") and "：" in line:
                if current_outfit:
                    outfits.append(current_outfit)
                current_outfit = {"reason": "", "selected_items": []}
            elif line.startswith("搭配理由："):
                if current_outfit:
                    current_outfit["reason"] = line[5:].strip()
            elif line.startswith("选中衣物："):
                if current_outfit:
                    item_names = [name.strip() for name in line[5:].split("，")]
                    for name in item_names:
                        # 严格限制只使用数据库中已存在的服装单品
                        matched = next((c for c in user_clothes if str(c.get("name") or "").strip() == name), None)
                        if matched:
                            current_outfit["selected_items"].append(matched)
        if current_outfit:
            outfits.append(current_outfit)
        
        if not outfits:
            yield {"status": "error", "message": "生成失败：无法解析大模型响应"}
            return
        
        import urllib.parse
        placeholder_url = f"{_wardrobe_image_base()}/img/placeholder.svg"
        max_tasks = int(os.getenv("MISSING_IMAGE_TASK_LIMIT") or "12")
        task_count = 0
        style_tags = ["通勤", "休闲", "运动"]
        missing_items_all: List[Dict[str, Any]] = []
        
        # 按优先级排序：鞋子 > 配饰 > 裤子
        priority_order = ["鞋子", "配饰", "裤子"]
        
        # 全局去重，避免重复推荐同类型单品
        global_missing_types = set()

        for i, outfit in enumerate(outfits):
            selected_items = outfit.get("selected_items", [])
            for item in selected_items:
                if not str(item.get("image_url") or "").strip():
                    item["image_url"] = placeholder_url
                item_name = str(item.get("name") or "").strip()
                item["taobao_link"] = generate_taobao_link(item_name)

            present_types = set(str(it.get("type") or "").strip() for it in selected_items)
            recognized_types = sorted([t for t in present_types if t])
            tag = style_tags[i] if i < len(style_tags) else (style or "简约")
            per_missing = []
            
            # 按优先级顺序检查缺失单品
            for req_type in priority_order:
                if req_type not in present_types and req_type not in global_missing_types:
                    visual = _guess_missing_item_visual_spec(req_type, str(tag))
                    kw = _build_taobao_keyword_for_missing_item(req_type, str(tag), visual)
                    main_color = (visual.get("colorInfo") or "").split("；", 1)[0].replace("主色：", "").strip()
                    sub_category = str(visual.get("subCategory") or "").strip()
                    detail_hint = _missing_item_detail_hint(req_type, sub_category, str(tag))
                    reason_text = _build_missing_item_reason_text(req_type, str(tag), recognized_types, visual)
                    m = {
                        "category": req_type,
                        "type": req_type,
                        "name": f"{main_color}{sub_category}（{tag}风格）" if (main_color or sub_category) else f"{req_type}（{tag}风格）",
                        "example": f"{kw} {detail_hint} {visual.get('stripeDetail') or ''}".strip(),
                        "suggestion": f"推荐：{main_color}{sub_category}，{visual.get('stripeDetail') or ''}{detail_hint}".strip("，"),
                        "reason": reason_text,
                        "taobaoKeyword": kw,
                        "taobao_keyword": kw,
                        "taobao_link": f"https://s.taobao.com/search?q={urllib.parse.quote(kw)}",
                        "subCategory": visual.get("subCategory") or "",
                        "colorInfo": visual.get("colorInfo") or "",
                        "stripeDetail": visual.get("stripeDetail") or "",
                        "detailedDescription": f"具体细分类别：{visual.get('subCategory') or ''}；颜色信息：{visual.get('colorInfo') or ''}；条纹细节：{visual.get('stripeDetail') or ''}；{detail_hint}".strip("；"),
                        "imageUrl": placeholder_url,
                        "image_url": placeholder_url,
                    }
                    if task_count < max_tasks:
                        task_id = uuid.uuid4().hex
                        m["image_task_id"] = task_id
                        _task_results[task_id] = {"status": "pending", "message": "任务初始化", "kind": "missing_item_image"}
                        _task_executor.submit(_missing_item_image_task_worker, task_id, user_id, req_type, str(tag), recognized_types)
                        task_count += 1
                    per_missing.append(m)
                    global_missing_types.add(req_type)
                    # 限制最多3个缺失单品
                    if len(global_missing_types) >= 3:
                        break
            outfit["missing_items"] = per_missing
            missing_items_all.extend(per_missing)
        
        # 全局去重：按品类去重，保留优先级高的
        unique_items = {}
        for item in missing_items_all:
            category = item.get("category") or item.get("type")
            if category:
                if category not in unique_items:
                    unique_items[category] = item
        
        # 按优先级排序
        sorted_items = []
        for t in priority_order:
            if t in unique_items:
                sorted_items.append(unique_items[t])
        
        # 严格限制最多3个缺失单品
        missing_items_all = sorted_items[:3]

        yield {"status": "generating_images", "message": "缺失单品图片任务已提交", "total": task_count}

        # 为每一套穿搭组装输出
        final_outfits = []
        for i, outfit in enumerate(outfits):
            selected_items = outfit.get("selected_items", [])
            reason = outfit.get("reason", "")
            
            missing_items = outfit.get("missing_items", [])
            
            # 构建最终的穿搭方案
            final_outfits.append({
                "id": i + 1,
                "reason": reason,
                "selected_items": selected_items,
                "missing_items": missing_items
            })
        
        # 补充推荐建议
        suggest_items = []
        if len(user_clothes) < 10:
            suggest_items.append({"type": "上衣", "suggestion": "建议多准备几件不同风格的上衣，增加搭配多样性"})
            suggest_items.append({"type": "裤子", "suggestion": "建议多准备几条不同款式的裤子，适应不同场景"})
            suggest_items.append({"type": "鞋子", "suggestion": "建议多准备几双不同风格的鞋子，提升整体搭配效果"})
        
        missing_by_type: Dict[str, int] = {}
        missing_items_flat: List[Dict[str, Any]] = []
        for outfit in final_outfits:
            for item in outfit.get("missing_items", []):
                missing_items_flat.append(item)
                t = str(item.get("type") or item.get("category") or "").strip()
                if t:
                    missing_by_type[t] = missing_by_type.get(t, 0) + 1
        missing_items_info = {"count": len(missing_items_flat), "types": list(missing_by_type.keys()), "by_type": missing_by_type}

        # 返回最终结果
        yield {"status": "completed", "data": {
            "outfits": final_outfits,
            "suggest_items": suggest_items,
            "missing_items": missing_items_flat,
            "missing_items_info": missing_items_info
        }}
    except Exception as e:
        logger.exception("outfit_recommend_stream_failed")
        yield {"status": "error", "message": f"生成失败：{str(e)}"}


@app.post("/api/wardrobe/clothes")
async def add_wardrobe_clothes(request: Request, body: Dict[str, Any]):
    """添加衣橱衣服数据"""
    try:
        user_id = _get_request_user_id(request)
        name = str(body.get("name") or "").strip()
        ctype = str(body.get("type") or "").strip()
        if not name or not ctype:
            return fail("缺少必填字段: name/type")

        color = str(body.get("color") or "").strip()
        material = str(body.get("material") or "").strip()
        season = str(body.get("season") or "").strip()
        brand = str(body.get("brand") or "").strip()
        style = str(body.get("style") or body.get("fashion_style") or "").strip()
        suitable_temp = str(body.get("suitable_temp") or "").strip()
        description = str(body.get("description") or "").strip()
        image_url = str(body.get("image_url") or body.get("image") or "").strip()
        price = body.get("price")

        conn = _mysql_connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO clothes (name, color, type, image, brand, material, style, season, suitable_temp, price, description, user_id) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (name, color, ctype, image_url, brand, material, style, season, suitable_temp, price, description, user_id),
                )
                cur.execute("SELECT LAST_INSERT_ID() AS id")
                inserted = cur.fetchone() or {}
                inserted_id = int(inserted.get("id") or 0)
        finally:
            conn.close()

        clothes = fetch_user_clothes_from_db(user_id)
        created = next((c for c in clothes if int(c.get("id") or 0) == inserted_id), None)
        return ok(created or {"id": inserted_id}, "添加衣服成功")
    except Exception as e:
        logger.exception("add_wardrobe_clothes_failed")
        return fail("添加衣服失败，请稍后重试", {"error": str(e)})


@app.post("/api/weather")
async def weather_by_address(body: Dict[str, Any]):
    """根据地址查询天气"""
    try:
        address = body.get("address")
        if not address:
            return fail("缺少 address 参数")
        
        logger.info(f"Processing weather request for address: {address}")
        
        # 城市经纬度映射（作为 fallback）
        city_lat_lon_map = {
            "北京": (39.9, 116.4),
            "上海": (31.2, 121.4),
            "广州": (23.1, 113.3),
            "深圳": (22.5, 114.1),
            "杭州": (30.3, 120.2),
            "成都": (30.7, 104.1),
            "武汉": (30.6, 114.3),
            "西安": (34.3, 108.9),
            "南京": (32.1, 118.8),
            "重庆": (29.5, 106.5),
            "厦门": (24.5, 118.1),
            "福州": (26.1, 119.3)
        }
        
        # 尝试使用高德地图 API
        amap_key = os.getenv("AMAP_KEY") or os.getenv("AMAP_API_KEY")
        if amap_key:
            try:
                # 1. 调用地理编码API获取经纬度
                geo_url = "https://restapi.amap.com/v3/geocode/geo"
                geo_params = {
                    "key": amap_key,
                    "address": address,
                    "output": "json"
                }
                
                logger.info(f"Calling geocoding API: {geo_url} with params: {geo_params}")
                geo_r = requests.get(geo_url, params=geo_params, timeout=6)
                logger.info(f"Geocoding API response status: {geo_r.status_code}")
                logger.info(f"Geocoding API response: {geo_r.text[:500]}")
                
                geo_r.raise_for_status()
                geo_j = geo_r.json() or {}
                
                if geo_j.get("status") == "1":
                    geocodes = geo_j.get("geocodes", [])
                    if geocodes:
                        location = geocodes[0].get("location")
                        if location:
                            citycode = geocodes[0].get("citycode")
                            adcode = geocodes[0].get("adcode")
                            logger.info(f"Geocoding successful: location={location}, citycode={citycode}, adcode={adcode}")
                            
                            # 2. 调用天气查询API
                            weather_url = "https://restapi.amap.com/v3/weather/weatherInfo"
                            weather_params = {
                                "key": amap_key,
                                "city": citycode or adcode,
                                "extensions": "base",
                                "output": "json"
                            }
                            
                            logger.info(f"Calling weather API: {weather_url} with params: {weather_params}")
                            weather_r = requests.get(weather_url, params=weather_params, timeout=6)
                            logger.info(f"Weather API response status: {weather_r.status_code}")
                            logger.info(f"Weather API response: {weather_r.text[:500]}")
                            
                            weather_r.raise_for_status()
                            weather_j = weather_r.json() or {}
                            
                            if weather_j.get("status") == "1":
                                weather_data = weather_j.get("lives", [])[0] if weather_j.get("lives") else {}
                                temperature = weather_data.get("temperature", "0")
                                try:
                                    temperature = int(temperature) if temperature is not None else 20
                                except (ValueError, TypeError):
                                    temperature = 20
                                weather = weather_data.get("weather", "未知")
                                wind = weather_data.get("windpower", "微风")
                                
                                logger.info(f"Weather data: temperature={temperature}, weather={weather}, wind={wind}")
                                
                                return ok({
                                    "temperature": temperature,
                                    "weather": weather,
                                    "wind": wind
                                })
            except Exception as e:
                logger.exception("Amap API failed, using fallback")
        
        # 降级方案：使用城市经纬度映射
        logger.info("Using fallback city lat/lon mapping")
        # 提取城市名（改进的处理逻辑）
        city = address.strip()
        # 尝试不同的城市名提取方式
        city_candidates = []
        
        # 特殊处理常见城市
        special_cities = {
            "厦门思明": "厦门",
            "思明": "厦门",
            "厦门": "厦门",
            "福州福清": "福州",
            "福清": "福州",
            "福州": "福州"
        }
        if city in special_cities:
            city_candidates.append(special_cities[city])
        
        # 按常见行政区划后缀分割
        for suffix in ["市", "区", "县", "省"]:
            if suffix in city:
                candidate = city.split(suffix)[0].strip()
                city_candidates.append(candidate)
                # 尝试提取更短的城市名
                if len(candidate) > 2:
                    # 尝试提取前两个字作为城市名
                    city_candidates.append(candidate[:2])
        
        # 尝试提取前两个字作为城市名（通用逻辑）
        if len(city) >= 2:
            city_candidates.append(city[:2])
        
        # 尝试直接匹配
        city_candidates.append(city)
        
        # 去重
        city_candidates = list(set(city_candidates))
        
        # 查找匹配的城市
        matched_city = None
        for candidate in city_candidates:
            if candidate in city_lat_lon_map:
                matched_city = candidate
                break
        
        if matched_city:
            lat, lon = city_lat_lon_map[matched_city]
            logger.info(f"Using fallback location for {matched_city}: lat={lat}, lon={lon}")
            
            # 使用经纬度查询天气
            weather_data = fetch_weather(lat, lon, "C")
            if weather_data.get("temperature") is not None:
                return ok({
                    "temperature": int(weather_data.get("temperature")),
                    "weather": weather_data.get("weather_type", "未知"),
                    "wind": f"{weather_data.get('wind_speed', 0)} m/s"
                })
        else:
            logger.info(f"No city match found for address: {address}, candidates: {city_candidates}")
        
        # 如果所有方法都失败，返回默认数据
        logger.warning("All weather query methods failed, returning default data")
        return ok({
            "temperature": 22,
            "weather": "晴",
            "wind": "微风"
        })
    except Exception as e:
        logger.exception("weather_by_address_failed")
        return fail("天气查询失败，请稍后重试", {"error": str(e)})


def _compress_image_for_tryon(image_bytes: bytes) -> bytes:
    """压缩试衣图片，最大边长512px，分辨率72dpi，文件大小控制在500KB以内"""
    from PIL import Image
    import io
    try:
        # 确保输入是有效的字节数据
        if not image_bytes or len(image_bytes) == 0:
            raise Exception("空图片数据")
        
        # 打开图片
        img = Image.open(io.BytesIO(image_bytes))
        
        # 转换为RGB模式（如果不是）
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        
        # 调整大小
        width, height = img.size
        max_size = 512
        if max(width, height) > max_size:
            if width > height:
                new_width = max_size
                new_height = int(height * (max_size / width))
            else:
                new_height = max_size
                new_width = int(width * (max_size / height))
            # 使用抗锯齿算法调整大小
            img = img.resize((new_width, new_height), Image.LANCZOS)
        
        # 保存为JPEG格式
        output = io.BytesIO()
        # 如果是RGBA模式，需要处理透明度
        if img.mode == 'RGBA':
            # 创建白色背景
            background = Image.new('RGB', img.size, (255, 255, 255))
            # 粘贴图片，使用透明度作为遮罩
            background.paste(img, mask=img.split()[3])  # 3是alpha通道
            img = background
        # 保存图片，控制质量
        img.save(output, format='JPEG', quality=85, dpi=(72, 72))
        compressed_bytes = output.getvalue()
        
        # 确保文件大小控制在500KB以内
        if len(compressed_bytes) > 500 * 1024:
            # 降低质量再次压缩
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=75, dpi=(72, 72))
            compressed_bytes = output.getvalue()
            # 如果还是太大，继续降低质量
            if len(compressed_bytes) > 500 * 1024:
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=65, dpi=(72, 72))
                compressed_bytes = output.getvalue()
        
        return compressed_bytes
    except Exception as e:
        logger.warning(f"Try-on image compression failed: {str(e)}")
        # 压缩失败时返回原始数据
        return image_bytes

def _get_tryon_cache_key(person_url: str, garment_url: str, garment_type: str) -> str:
    """生成试衣缓存键"""
    import hashlib
    key = f"{person_url}|{garment_url}|{garment_type}"
    return hashlib.md5(key.encode()).hexdigest()

def _tryon_task_worker(task_id: str, person_url: str, garment_url: str, garment_type: str):
    """试衣任务工作函数"""
    try:
        # 更新任务状态为处理中
        _task_results[task_id] = {
            "status": "processing",
            "message": "正在生成试衣图...",
            "mode": "real"
        }

        max_wait = int(os.getenv("TRYON_TASK_MAX_WAIT_SECONDS") or "600")
        deadline = time.time() + max_wait
        attempt = 0
        backoff = 1.0
        last_msg = ""

        while time.time() < deadline:
            try:
                st = (_task_results.get(task_id) or {}).get("status")
                if st == "canceled":
                    return
            except Exception:
                pass
            attempt += 1
            def _should_cancel():
                try:
                    return (_task_results.get(task_id) or {}).get("status") == "canceled"
                except Exception:
                    return False

            use_chain = str(os.getenv("TRYON_CHAIN_ENABLED") or "1") != "0"
            result = dashscope_tryon_chain(person_url, garment_url, garment_type, cancel_check=_should_cancel) if use_chain else dashscope_tryon(person_url, garment_url, garment_type, cancel_check=_should_cancel)
            if isinstance(result, dict) and result.get("success"):
                image_url = str(result.get("image_url") or "").strip()
                if image_url and _validate_tryon_image_url(image_url) and (image_url != str(person_url)) and (image_url != str(garment_url)):
                    _task_results[task_id] = {
                        "status": "completed",
                        "image_url": image_url,
                        "message": "试衣成功",
                        "mode": "real",
                        "attempts": attempt,
                        "trace_id": result.get("trace_id") or "",
                    }
                    return
                last_msg = "生成的试衣图片无效"
            else:
                last_msg = str((result or {}).get("message") or "试衣未完成")

            _task_results[task_id] = {
                "status": "processing",
                "message": f"{last_msg}，继续等待生成结果...",
                "mode": "real",
                "attempts": attempt,
            }
            time.sleep(min(backoff, 8.0))
            backoff = min(backoff * 2.0, 8.0)

        _task_results[task_id] = {
            "status": "failed",
            "message": f"试衣超时未获得有效结果：{last_msg or 'timeout'}",
            "mode": "real",
            "attempts": attempt,
        }
    except Exception as e:
        logger.exception(f"tryon_task_failed: {task_id}")
        _task_results[task_id] = {
            "status": "failed",
            "message": f"试衣失败：{str(e)}",
            "mode": "real"
        }


@app.post("/api/virtual-tryon")
async def virtual_tryon(request: Request, body: Dict[str, Any]):
    """虚拟试衣（异步任务模式）"""
    try:
        current_user_id = _get_request_user_id(request)

        garment_type = str(body.get("garment_type") or "top")
        if garment_type not in ("top", "bottom", "dress"):
            garment_type = "top"

        person_url = body.get("person_image_url")
        garment_url = body.get("garment_image_url")

        if (not person_url) and body.get("person_image_base64"):
            pbytes = base64_to_bytes(body.get("person_image_base64"))
            # 压缩图片
            pbytes = _compress_image_for_tryon(pbytes)
            out = store_image(pbytes, "person.jpg")
            person_url = out["image_url"]
        if (not garment_url) and body.get("garment_image_base64"):
            gbytes = base64_to_bytes(body.get("garment_image_base64"))
            # 压缩图片
            gbytes = _compress_image_for_tryon(gbytes)
            out = store_image(gbytes, "garment.png")
            garment_url = out["image_url"]

        if not person_url or not garment_url:
            return fail("缺少人物或衣服图片（URL/base64 至少提供一种）")

        if str(garment_url).endswith("/img/placeholder.svg") or "placeholder.svg" in str(garment_url):
            return fail("衣物图片无效，请选择真实衣物图片后再试衣")

        person_url = _normalize_tryon_input_url(person_url)
        garment_url = _normalize_tryon_input_url(garment_url)

        logger.info("virtual_tryon request user_id=%s garment_type=%s person_url=%s garment_url=%s", current_user_id, garment_type, str(person_url)[:120], str(garment_url)[:120])

        if not _is_public_fetchable_url(str(person_url)):
            promoted = _promote_url_to_oss(str(person_url))
            if promoted:
                person_url = promoted
        if not _is_public_fetchable_url(str(garment_url)):
            promoted = _promote_url_to_oss(str(garment_url))
            if promoted:
                garment_url = promoted

        if not _is_public_fetchable_url(str(person_url)) or not _is_public_fetchable_url(str(garment_url)):
            if str(os.getenv("TRYON_ALLOW_LOCAL_FALLBACK") or "0") != "0":
                out = _tryon_local_fallback(str(person_url), [{"garment_type": garment_type, "garment_image_url": str(garment_url)}])
                url = out.get("final_image_url") or ""
                if url:
                    return ok({"image_url": url, "mode": out.get("mode") or "local"}, "local_tryon_ok")
            return fail("真实试衣需要公网可访问的图片URL。请配置 OSS（OSS_* 环境变量）让系统自动上传。", {"mode": "real", "code": "TRYON_PUBLIC_URL_REQUIRED"})

        # 生成任务ID
        task_id = str(uuid.uuid4())
        logger.info(f"Generated task_id: {task_id}")
        
        # 初始化任务状态
        _task_results[task_id] = {
            "status": "pending",
            "message": "任务初始化",
            "mode": "real"
        }
        logger.info(f"Task {task_id} added to _task_results, current keys: {list(_task_results.keys())}")
        
        # 提交任务到线程池
        _task_executor.submit(_tryon_task_worker, task_id, person_url, garment_url, garment_type)
        
        # 立即返回任务ID
        logger.info(f"Returning task_id: {task_id}")
        return ok({
            "task_id": task_id,
            "status": "pending",
            "message": "任务已提交，正在处理",
            "mode": "real"
        }, "任务已提交")
    except Exception as e:
        logger.exception("virtual_tryon_failed")
        return fail("虚拟试衣失败，请稍后重试", {"error": str(e)})


@app.get("/api/virtual-tryon/task/{task_id}")
async def get_tryon_task_status(task_id: str):
    """查询试衣任务状态"""
    try:
        logger.info(f"Query task_id: {task_id}, existing keys: {list(_task_results.keys())}")
        result = _task_results.get(task_id)
        if not result:
            return fail("任务不存在", {"code": "TRYON_TASK_NOT_FOUND"})
        
        return ok(result, "查询成功")
    except Exception as e:
        logger.exception("get_tryon_task_status_failed")
        return fail(f"查询失败：{str(e)}")


@app.post("/api/virtual-tryon/task/{task_id}/cancel")
async def cancel_tryon_task(task_id: str):
    try:
        result = _task_results.get(task_id)
        if not result:
            return fail("任务不存在", {"code": "TRYON_TASK_NOT_FOUND"})
        status = str((result or {}).get("status") or "")
        if status in ("completed", "failed"):
            return ok({"status": status}, "任务已结束")
        _task_results[task_id] = {**(result or {}), "status": "canceled", "message": "任务已取消"}
        return ok({"status": "canceled"}, "已取消")
    except Exception as e:
        logger.exception("cancel_tryon_task_failed")
        return fail(f"取消失败：{str(e)}")


def _tryon_outfit_task_worker(task_id: str, person_url: str, garment_steps: List[Dict[str, str]]):
    """整套试衣任务工作函数"""
    try:
        # 执行整套试衣
        current_image_url = str(person_url)
        steps = []
        for s in garment_steps:
            try:
                st = (_task_results.get(task_id) or {}).get("status")
                if st == "canceled":
                    _task_results[task_id] = {"status": "canceled", "message": "任务已取消", "final_image_url": None, "steps": steps, "mode": "real"}
                    return
            except Exception:
                pass
            gurl = s["garment_image_url"]
            def _should_cancel():
                try:
                    return (_task_results.get(task_id) or {}).get("status") == "canceled"
                except Exception:
                    return False

            use_chain = str(os.getenv("TRYON_CHAIN_ENABLED") or "1") != "0"
            result = dashscope_tryon_chain(current_image_url, str(gurl), s["garment_type"], cancel_check=_should_cancel) if use_chain else dashscope_tryon(current_image_url, str(gurl), s["garment_type"], cancel_check=_should_cancel)
            if not result.get("success"):
                if result.get("canceled"):
                    _task_results[task_id] = {"status": "canceled", "message": "任务已取消", "final_image_url": None, "steps": steps, "mode": "real"}
                    return
                steps.append({**s, "status": "failed", "message": result.get("message") or "试衣失败"})
                _task_results[task_id] = {
                    "status": "failed",
                    "message": result.get("message") or "整套试衣失败",
                    "final_image_url": None,
                    "steps": steps,
                    "mode": "real"
                }
                return
            current_image_url = str(result.get("image_url") or "")
            steps.append({**s, "status": "success", "image_url": current_image_url, "trace_id": result.get("trace_id") or ""})
        
        _task_results[task_id] = {
            "status": "completed",
            "final_image_url": current_image_url,
            "steps": steps,
            "message": "整套试衣成功",
            "mode": "real"
        }
    except Exception as e:
        logger.exception(f"tryon_outfit_task_failed: {task_id}")
        _task_results[task_id] = {
            "status": "failed",
            "message": f"试衣失败：{str(e)}",
            "final_image_url": None,
            "steps": [],
            "mode": "real"
        }


@app.post("/api/virtual-tryon/outfit")
async def virtual_tryon_outfit(request: Request, body: Dict[str, Any]):
    """虚拟试衣（整套，异步任务模式）"""
    try:
        current_user_id = _get_request_user_id(request)

        person_url = body.get("person_image_url")
        if (not person_url) and body.get("person_image_base64"):
            pbytes = base64_to_bytes(body.get("person_image_base64"))
            # 压缩图片
            pbytes = _compress_image_for_tryon(pbytes)
            out = store_image(pbytes, "person.jpg")
            person_url = out["image_url"]

        items = body.get("items") or body.get("garments") or []
        if not isinstance(items, list):
            items = []

        garment_steps = []
        for it in items:
            if not isinstance(it, dict):
                continue
            gtype = str(it.get("garment_type") or "top")
            if gtype not in ("top", "bottom", "dress"):
                gtype = "top"
            gurl = it.get("garment_image_url")
            if (not gurl) and it.get("garment_image_base64"):
                gbytes = base64_to_bytes(it.get("garment_image_base64"))
                # 压缩图片
                gbytes = _compress_image_for_tryon(gbytes)
                out = store_image(gbytes, "garment.png")
                gurl = out["image_url"]
            if not gurl:
                continue
            garment_steps.append({"garment_type": gtype, "garment_image_url": gurl})

        if not person_url:
            return fail("缺少人物图片（URL/base64 至少提供一种）")
        if not garment_steps:
            return fail("缺少衣物列表（至少提供一件）")

        person_url = _normalize_tryon_input_url(person_url)

        logger.info("virtual_tryon_outfit request user_id=%s items=%s person_url=%s", current_user_id, len(garment_steps), str(person_url)[:120])

        if not _is_public_fetchable_url(str(person_url)):
            promoted = _promote_url_to_oss(str(person_url))
            if promoted:
                person_url = promoted
        if not _is_public_fetchable_url(str(person_url)):
            if str(os.getenv("TRYON_ALLOW_LOCAL_FALLBACK") or "0") != "0":
                normalized_steps = []
                for s in garment_steps:
                    gurl = _normalize_tryon_input_url(s.get("garment_image_url"))
                    normalized_steps.append({**s, "garment_image_url": gurl})
                out = _tryon_local_fallback(str(person_url), normalized_steps)
                url = out.get("final_image_url") or ""
                if url:
                    return ok({"task_id": "", "status": "completed", "final_image_url": url, "mode": out.get("mode") or "local", "steps": out.get("steps") or []}, "local_tryon_ok")
            return fail("真实整套试衣需要公网可访问的人物图片URL。请配置 OSS（OSS_* 环境变量）让系统自动上传。", {"mode": "real", "code": "TRYON_PUBLIC_URL_REQUIRED"})

        # 处理衣物URL
        processed_steps = []
        for s in garment_steps:
            gurl = _normalize_tryon_input_url(s.get("garment_image_url"))
            if not _is_public_fetchable_url(str(gurl)):
                promoted = _promote_url_to_oss(str(gurl))
                if promoted:
                    gurl = promoted
            if not _is_public_fetchable_url(str(gurl)):
                if str(os.getenv("TRYON_ALLOW_LOCAL_FALLBACK") or "0") != "0":
                    normalized_steps = []
                    for s2 in garment_steps:
                        g2 = _normalize_tryon_input_url(s2.get("garment_image_url"))
                        normalized_steps.append({**s2, "garment_image_url": g2})
                    out = _tryon_local_fallback(str(person_url), normalized_steps)
                    url = out.get("final_image_url") or ""
                    if url:
                        return ok({"task_id": "", "status": "completed", "final_image_url": url, "mode": out.get("mode") or "local", "steps": out.get("steps") or []}, "local_tryon_ok")
                return fail("真实整套试衣需要公网可访问的衣物图片URL。请配置 OSS（OSS_* 环境变量）让系统自动上传。", {"mode": "real", "code": "TRYON_PUBLIC_URL_REQUIRED"})
            processed_steps.append({**s, "garment_image_url": gurl})

        # 生成任务ID
        task_id = str(uuid.uuid4())
        
        # 初始化任务状态
        _task_results[task_id] = {
            "status": "pending",
            "message": "任务初始化",
            "mode": "real"
        }
        
        # 提交任务到线程池
        _task_executor.submit(_tryon_outfit_task_worker, task_id, person_url, processed_steps)
        
        # 立即返回任务ID
        return ok({
            "task_id": task_id,
            "status": "pending",
            "message": "任务已提交，正在处理",
            "mode": "real"
        }, "任务已提交")
    except Exception as e:
        logger.exception("virtual_tryon_outfit_failed")
        return fail("整套试衣失败，请稍后重试", {"error": str(e)})

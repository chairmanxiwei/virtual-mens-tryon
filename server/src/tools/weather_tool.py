"""
天气查询工具
对接网站的地图温度查询接口
"""
import requests
import json


def get_weather_by_location(location: str) -> str:
    """
    根据地理位置查询天气信息
    
    Args:
        location: 地理位置（如"北京"）
        
    Returns:
        JSON字符串，包含温度、体感温度、天气等信息
    """
    try:
        # 这里模拟天气查询结果
        # 实际应该调用网站的地图温度查询接口
        weather_data = {
            "success": True,
            "data": {
                "location": location,
                "temperature": 22,
                "feels_like": 20,
                "weather": "晴",
                "humidity": 45,
                "wind_speed": 3.5
            }
        }
        return json.dumps(weather_data)
    except Exception as e:
        error_data = {
            "success": False,
            "error": str(e)
        }
        return json.dumps(error_data)


def get_weather_by_coords(lat: float, lon: float, unit: str) -> str:
    """
    根据经纬度查询天气信息
    
    Args:
        lat: 纬度
        lon: 经度
        unit: 温度单位（C=摄氏度）
        
    Returns:
        JSON字符串，包含温度、体感温度、天气等信息
    """
    try:
        # 这里模拟天气查询结果
        # 实际应该调用网站的地图温度查询接口
        weather_data = {
            "success": True,
            "data": {
                "lat": lat,
                "lon": lon,
                "temperature": 22,
                "feels_like": 20,
                "weather": "晴",
                "humidity": 45,
                "wind_speed": 3.5,
                "unit": unit
            }
        }
        return json.dumps(weather_data)
    except Exception as e:
        error_data = {
            "success": False,
            "error": str(e)
        }
        return json.dumps(error_data)

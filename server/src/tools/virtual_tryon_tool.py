"""
虚拟试衣工具 - 基于阿里云百炼AI试衣API
支持单件上装、下装、上下装组合以及连衣裙试穿
"""
import os
import time
import requests
from typing import Optional, Dict, Any
from langchain.tools import tool, ToolRuntime
from coze_coding_utils.runtime_ctx.context import new_context
from dotenv import load_dotenv
import logging

# 加载环境变量
load_dotenv()

logger = logging.getLogger("virtual_tryon_tool")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
# API配置
DASHSCOPE_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis"
DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks"


def get_dashscope_api_key() -> str:
    """获取阿里云百炼API Key"""
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise ValueError(
            "未配置阿里云百炼API Key。请设置环境变量 DASHSCOPE_API_KEY。\n"
            "获取方式：\n"
            "1. 访问阿里云百炼平台：https://dashscope.console.aliyun.com/\n"
            "2. 开通服务并获取API Key\n"
            "3. 在环境变量中设置：export DASHSCOPE_API_KEY='your-api-key'"
        )
    return api_key


def create_tryon_task(
    person_image_url: str,
    top_garment_url: Optional[str] = None,
    bottom_garment_url: Optional[str] = None,
    resolution: int = -1,
    restore_face: bool = True
) -> str:
    """
    创建试衣任务
    
    Args:
        person_image_url: 人物正面全身照URL
        top_garment_url: 上装图片URL（可选）
        bottom_garment_url: 下装图片URL（可选）
        resolution: 输出分辨率，-1为保持原图，1024为576x1024，1280为720x1280
        restore_face: 是否保留原人脸，True为保留，False为随机生成新人脸
    
    Returns:
        task_id: 任务ID
    """
    if not top_garment_url and not bottom_garment_url:
        raise ValueError("top_garment_url 和 bottom_garment_url 至少需要提供一个")
    
    api_key = get_dashscope_api_key()
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "X-DashScope-Async": "enable"
    }
    
    data = {
        "model": "aitryon",
        "input": {
            "person_image_url": person_image_url
        },
        "parameters": {
            "resolution": resolution,
            "restore_face": restore_face
        }
    }
    
    if top_garment_url:
        data["input"]["top_garment_url"] = top_garment_url
    if bottom_garment_url:
        data["input"]["bottom_garment_url"] = bottom_garment_url
    
    try:
        response = requests.post(DASHSCOPE_API_URL, json=data, headers=headers, timeout=30)
    except Exception as e:
        raise ValueError(f"请求百炼失败：{str(e)}")

    if response.status_code < 200 or response.status_code >= 300:
        logid = response.headers.get("x-tt-logid") or response.headers.get("x-dashscope-request-id")
        raise ValueError(f"百炼返回HTTP{response.status_code}: {response.text[:1000]}{(' (logid: '+logid+')') if logid else ''}")
    
    try:
        result = response.json()
    except Exception:
        raise ValueError(f"百炼返回非JSON: {response.text[:1000]}")
    task_id = result.get("output", {}).get("task_id")
    
    if not task_id:
        raise ValueError(f"创建任务失败：{result}")
    
    return task_id


def query_task_result(task_id: str, max_wait_time: int = 60) -> Dict[str, Any]:
    """
    查询任务结果
    
    Args:
        task_id: 任务ID
        max_wait_time: 最大等待时间（秒），默认60秒
    
    Returns:
        任务结果字典
    """
    api_key = get_dashscope_api_key()
    
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    
    url = f"{DASHSCOPE_TASK_URL}/{task_id}"
    
    start_time = time.time()
    while True:
        # 检查是否超时
        if time.time() - start_time > max_wait_time:
            raise TimeoutError(f"任务执行超时（{max_wait_time}秒），task_id: {task_id}")
        
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code < 200 or response.status_code >= 300:
            logid = response.headers.get("x-tt-logid") or response.headers.get("x-dashscope-request-id")
            raise ValueError(f"查询任务HTTP{response.status_code}: {response.text[:1000]}{(' (logid: '+logid+')') if logid else ''}")
        
        try:
            result = response.json()
        except Exception:
            raise ValueError(f"查询任务返回非JSON: {response.text[:1000]}")
        status = result.get("output", {}).get("task_status", "UNKNOWN")
        
        # 任务成功
        if status == "SUCCEEDED":
            image_url = result.get("output", {}).get("image_url")
            if not image_url:
                raise ValueError(f"任务成功但未返回图片URL：{result}")
            return {
                "status": "success",
                "image_url": image_url,
                "task_id": task_id
            }
        
        # 任务失败
        elif status == "FAILED":
            error_code = result.get("output", {}).get("code", "Unknown")
            error_message = result.get("output", {}).get("message", "Unknown error")
            raise ValueError(f"任务执行失败：{error_code} - {error_message}")
        
        # 任务取消
        elif status == "CANCELED":
            raise ValueError("任务已被取消")
        
        # 任务不存在
        elif status == "UNKNOWN":
            raise ValueError("任务不存在或状态未知")
        
        # 任务还在处理中（PENDING, PRE-PROCESSING, RUNNING, POST-PROCESSING）
        else:
            # 等待3秒后再次查询
            time.sleep(3)


@tool
def virtual_tryon(
    person_image_url: str,
    garment_image_url: str,
    garment_type: str = "top",
    runtime: ToolRuntime = None
) -> str:
    """
    虚拟试衣工具：将衣服试穿到人物身上
    
    使用场景：用户上传人物图和衣服图，生成试穿效果图
    
    Args:
        person_image_url: 人物正面全身照的URL（必须是公网可访问的HTTP/HTTPS地址）
        garment_image_url: 衣服图片的URL（必须是公网可访问的HTTP/HTTPS地址）
        garment_type: 衣服类型，可选值：'top'(上装)、'bottom'(下装)、'dress'(连衣裙/连体衣)，默认为'top'
    
    Returns:
        生成的试衣效果图URL，或错误信息
    
    注意事项：
        1. 人物图要求：
           - 必须是全身正面照
           - 图片中有且仅有一个完整的人
           - 光照良好，手部展示完整
           - 文件大小：5KB～5MB
           - 分辨率：150px～4096px
           - 格式：JPG、JPEG、PNG、BMP、HEIC
        
        2. 衣服图要求：
           - 服饰平铺拍摄，仅含单件服装
           - 服饰舒展、平整，无褶皱或折叠遮挡
           - 背景简约干净，保持服饰主体清晰
           - 服饰画面占比尽可能大
           - 文件大小：5KB～5MB
           - 分辨率：150px～4096px
           - 格式：JPG、JPEG、PNG、BMP、HEIC
    
    示例：
        virtual_tryon(
            person_image_url="https://example.com/person.jpg",
            garment_image_url="https://example.com/shirt.jpg",
            garment_type="top"
        )
    """
    try:
        # 验证参数
        if garment_type not in ["top", "bottom", "dress"]:
            return "错误：garment_type 参数必须是 'top'、'bottom' 或 'dress'"
        
        # 根据衣服类型确定参数
        top_garment_url = garment_image_url if garment_type in ["top", "dress"] else None
        bottom_garment_url = garment_image_url if garment_type == "bottom" else None
        
        # 创建任务
        task_id = create_tryon_task(
            person_image_url=person_image_url,
            top_garment_url=top_garment_url,
            bottom_garment_url=bottom_garment_url,
            resolution=-1,  # 保持原图分辨率
            restore_face=True  # 保留原人脸
        )
        
        # 查询结果
        result = query_task_result(task_id, max_wait_time=60)
        
        return f"试衣成功！效果图URL：{result['image_url']}\n注意：图片URL有效期为24小时，请及时下载保存。"
    
    except ValueError as e:
        return f"参数错误：{str(e)}"
    except TimeoutError as e:
        return f"任务超时：{str(e)}"
    except requests.exceptions.RequestException as e:
        return f"网络请求失败：{str(e)}"
    except Exception as e:
        return f"虚拟试衣失败：{str(e)}"

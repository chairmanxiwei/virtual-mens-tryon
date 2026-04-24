"""
数据库连接工具
从MySQL数据库读取用户衣橱数据
"""
import os
from typing import List, Dict, Any, Optional
import pymysql
from pymysql.cursors import DictCursor


def query_user_wardrobe(
    user_id: int,
    db_host: Optional[str] = None,
    db_name: Optional[str] = None,
    db_user: Optional[str] = None,
    db_password: Optional[str] = None,
    db_port: int = 3306
) -> List[Dict[str, Any]]:
    """
    从MySQL数据库查询用户衣橱
    
    Args:
        user_id: 用户ID
        db_host: 数据库主机地址（可选，默认从环境变量读取）
        db_name: 数据库名称（可选，默认从环境变量读取）
        db_user: 数据库用户名（可选，默认从环境变量读取）
        db_password: 数据库密码（可选，默认从环境变量读取）
        db_port: 数据库端口（默认3306）
    
    Returns:
        用户衣橱数据列表
    
    示例：
        clothes = query_user_wardrobe(
            user_id=123,
            db_host='localhost',
            db_name='virtual_menswear',
            db_user='root',
            db_password='password'
        )
    """
    # 从环境变量或参数获取数据库配置
    db_host = db_host or os.getenv('DB_HOST', 'localhost')
    db_name = db_name or os.getenv('DB_NAME', 'virtual_menswear')
    db_user = db_user or os.getenv('DB_USER', 'root')
    db_password = db_password or os.getenv('DB_PASSWORD', '')
    
    try:
        # 连接数据库
        connection = pymysql.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name,
            cursorclass=DictCursor
        )
        
        with connection.cursor() as cursor:
            # 查询用户衣橱
            sql = """
            SELECT 
                id,
                name,
                type,
                color,
                style,
                season,
                pattern,
                material,
                image as image_url
            FROM clothes
            WHERE user_id = %s
            ORDER BY created_at DESC
            """
            
            cursor.execute(sql, (user_id,))
            results = cursor.fetchall()
            
            # 转换为标准格式
            clothes_list = []
            for row in results:
                clothes_list.append({
                    'id': row.get('id'),
                    'name': row.get('name'),
                    'type': row.get('type'),
                    'color': row.get('color'),
                    'style': row.get('style'),
                    'season': row.get('season'),
                    'pattern': row.get('pattern'),
                    'material': row.get('material'),
                    'image_url': row.get('image_url')
                })
            
            return clothes_list
            
    except pymysql.Error as e:
        raise Exception(f"数据库查询失败：{str(e)}")
    finally:
        if 'connection' in locals():
            connection.close()


def get_clothes_by_ids(
    clothes_ids: List[int],
    db_host: Optional[str] = None,
    db_name: Optional[str] = None,
    db_user: Optional[str] = None,
    db_password: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    根据衣服ID列表查询衣服详情
    
    Args:
        clothes_ids: 衣服ID列表
        db_host: 数据库主机地址
        db_name: 数据库名称
        db_user: 数据库用户名
        db_password: 数据库密码
    
    Returns:
        衣服详情列表
    """
    # 从环境变量或参数获取数据库配置
    db_host = db_host or os.getenv('DB_HOST', 'localhost')
    db_name = db_name or os.getenv('DB_NAME', 'virtual_menswear')
    db_user = db_user or os.getenv('DB_USER', 'root')
    db_password = db_password or os.getenv('DB_PASSWORD', '')
    
    if not clothes_ids:
        return []
    
    try:
        connection = pymysql.connect(
            host=db_host,
            user=db_user,
            password=db_password,
            database=db_name,
            cursorclass=DictCursor
        )
        
        with connection.cursor() as cursor:
            # 构建IN查询
            placeholders = ','.join(['%s'] * len(clothes_ids))
            sql = f"""
            SELECT 
                id,
                name,
                type,
                color,
                style,
                season,
                pattern,
                material,
                image as image_url
            FROM clothes
            WHERE id IN ({placeholders})
            """
            
            cursor.execute(sql, tuple(clothes_ids))
            results = cursor.fetchall()
            
            clothes_list = []
            for row in results:
                clothes_list.append({
                    'id': row.get('id'),
                    'name': row.get('name'),
                    'type': row.get('type'),
                    'color': row.get('color'),
                    'style': row.get('style'),
                    'season': row.get('season'),
                    'pattern': row.get('pattern'),
                    'material': row.get('material'),
                    'image_url': row.get('image_url')
                })
            
            return clothes_list
            
    except pymysql.Error as e:
        raise Exception(f"数据库查询失败：{str(e)}")
    finally:
        if 'connection' in locals():
            connection.close()


# 如果要作为工具使用，可以添加@tool装饰器
from langchain.tools import tool

@tool
def query_user_wardrobe_tool(user_id: int, db_config: Optional[Dict[str, str]] = None) -> str:
    """
    从数据库查询用户衣橱数据
    
    Args:
        user_id: 用户ID
        db_config: 数据库配置（可选），包含 host, name, user, password
    
    Returns:
        衣橱数据JSON字符串
    """
    import json
    
    if db_config:
        clothes = query_user_wardrobe(
            user_id=user_id,
            db_host=db_config.get('host'),
            db_name=db_config.get('name'),
            db_user=db_config.get('user'),
            db_password=db_config.get('password')
        )
    else:
        clothes = query_user_wardrobe(user_id=user_id)
    
    return json.dumps(clothes, ensure_ascii=False)

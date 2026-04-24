import os
import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
import logging
logger = logging.getLogger(__name__)
from decouple import config as env_config

MAX_RETRY_TIME = 20  # 连接最大重试时间（秒）
# Load environment variables from .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

def get_db_url() -> str:
    """Build database URL from environment."""
    # 优先使用 MySQL 配置
    db_host = str(env_config("DB_HOST", default=os.getenv("DB_HOST", "127.0.0.1"))).strip()
    db_port = str(env_config("DB_PORT", default=os.getenv("DB_PORT", "3306"))).strip()
    db_user = str(env_config("DB_USER", default=os.getenv("DB_USER", ""))).strip()
    db_pass = str(env_config("DB_PASS", default=os.getenv("DB_PASS", ""))).strip()
    db_name = str(env_config("DB_NAME", default=os.getenv("DB_NAME", ""))).strip()
    
    if db_user and db_pass and db_name:
        url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}?charset=utf8mb4"
        return url
    
    # 备用：尝试使用 PGDATABASE_URL
    url = os.getenv("PGDATABASE_URL") or ""
    if url:
        return url
    
    logger.error("Database configuration not found. Please set DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME in .env file.")
    raise ValueError("Database configuration not found")
_engine = None
_SessionLocal = None

def _create_engine_with_retry():
    url = get_db_url()
    if url is None or url == "":
        logger.error("PGDATABASE_URL is not set")
        raise ValueError("PGDATABASE_URL is not set")
    size = 100
    overflow = 100
    recycle = 1800
    timeout = 30
    engine = create_engine(
        url,
        pool_size=size,
        max_overflow=overflow,
        pool_pre_ping=True,
        pool_recycle=recycle,
        pool_timeout=timeout,
    )
    # 验证连接，带重试
    start_time = time.time()
    last_error = None
    while time.time() - start_time < MAX_RETRY_TIME:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return engine
        except OperationalError as e:
            last_error = e
            elapsed = time.time() - start_time
            logger.warning(f"Database connection failed, retrying... (elapsed: {elapsed:.1f}s)")
            time.sleep(min(1, MAX_RETRY_TIME - elapsed))
    logger.error(f"Database connection failed after {MAX_RETRY_TIME}s: {last_error}")
    raise last_error  # pyright: ignore [reportGeneralTypeIssues]

def get_engine():
    global _engine
    if _engine is None:
        _engine = _create_engine_with_retry()
    return _engine

def get_sessionmaker():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal

def get_session():
    return get_sessionmaker()()

__all__ = [
    "get_db_url",
    "get_engine",
    "get_sessionmaker",
    "get_session",
]

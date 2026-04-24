#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/root/虚拟男装"
ENV_FILE="${APP_ROOT}/.env.production"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

DOMAIN="${DOMAIN:-cls.troby.cn}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://cls.troby.cn}"
AI_BACKEND_BASE_URL="${AI_BACKEND_BASE_URL:-http://127.0.0.1:8000}"
TMP_KEY="health-check/$(date +%s)-$RANDOM.txt"
TMP_FILE="/tmp/virtual-man-health.txt"
echo "health-check-$(date -Iseconds)" > "${TMP_FILE}"

echo "[1/6] 检查 MySQL 连通性"
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "-p${DB_PASS}" -e "SELECT 1;" "${DB_NAME}" >/dev/null
echo "  OK"

echo "[2/6] 检查 OSS 读写"
python3 - <<PY
import os
import oss2
key = "${TMP_KEY}"
bucket = os.environ["OSS_BUCKET_NAME"]
endpoint = os.environ["OSS_ENDPOINT"]
ak = os.environ["OSS_ACCESS_KEY_ID"]
sk = os.environ["OSS_ACCESS_KEY_SECRET"]
auth = oss2.Auth(ak, sk)
b = oss2.Bucket(auth, endpoint, bucket)
with open("${TMP_FILE}", "rb") as f:
    b.put_object(key, f)
obj = b.get_object(key).read()
if not obj:
    raise SystemExit("OSS read empty")
b.delete_object(key)
print("  OK")
PY

echo "[3/6] 检查高德 API 200"
AMAP_HTTP="$(curl -sS -o /tmp/amap.json -w "%{http_code}" "https://restapi.amap.com/v3/weather/weatherInfo?city=310000&key=${AMAP_API_KEY}")"
if [[ "${AMAP_HTTP}" != "200" ]]; then
  echo "AMAP HTTP=${AMAP_HTTP}"
  exit 1
fi
echo "  OK"

echo "[4/6] 检查阿里云 DashScope Token"
DASH_HTTP="$(curl -sS -o /tmp/dashscope.json -w "%{http_code}" -H "Authorization: Bearer ${DASHSCOPE_LLM_API_KEY:-${DASHSCOPE_API_KEY}}" "https://dashscope.aliyuncs.com/api/v1/models")"
if [[ "${DASH_HTTP}" != "200" ]]; then
  echo "DashScope HTTP=${DASH_HTTP}"
  exit 1
fi
echo "  OK"

echo "[5/6] 检查首页与后端健康"
curl -fsS "${PUBLIC_BASE_URL}/" >/dev/null
curl -fsS "${AI_BACKEND_BASE_URL}/health" >/dev/null
echo "  OK"

echo "[6/6] 检查证书剩余天数 >= 30"
END_DATE="$(echo | openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)"
END_TS="$(date -d "${END_DATE}" +%s)"
NOW_TS="$(date +%s)"
DAYS_LEFT="$(( (END_TS - NOW_TS) / 86400 ))"
if (( DAYS_LEFT < 30 )); then
  echo "证书剩余天数不足：${DAYS_LEFT}"
  exit 1
fi
echo "  OK (${DAYS_LEFT} 天)"

echo "全部健康检查通过"

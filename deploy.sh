#!/usr/bin/env bash
set -euo pipefail

# 生产部署脚本（在服务器本机 root 执行）
# 固定根目录：/root/虚拟男装

APP_ROOT="/root/虚拟男装"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
REPO_URL="${REPO_URL:-git@github.com:your-org/virtual-man-fashion.git}"
BRANCH="${BRANCH:-main}"
TS="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="${RELEASES_DIR}/${TS}"
SERVICE_NAME="${SERVICE_NAME:-virtual-man-fashion.service}"

echo "[0/9] Linux 环境检查与依赖安装"
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "该脚本仅支持 Linux 服务器执行"
  exit 1
fi
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y git curl nginx openssl mysql-client python3 python3-venv python3-pip
fi
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "[1/9] 准备目录"
mkdir -p "${RELEASES_DIR}" "${APP_ROOT}/shared/logs"

echo "[2/9] 拉取代码 ${REPO_URL}#${BRANCH}"
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${RELEASE_DIR}"

echo "[3/9] 注入生产配置"
if [[ ! -f "${APP_ROOT}/.env.production" ]]; then
  echo "缺少 ${APP_ROOT}/.env.production"
  exit 1
fi
ln -sfn "${APP_ROOT}/.env.production" "${RELEASE_DIR}/.env.production"

echo "[4/9] 安装 Python 依赖"
python3 -m venv "${RELEASE_DIR}/.venv"
source "${RELEASE_DIR}/.venv/bin/activate"
python -m pip install --upgrade pip
pip install -r "${RELEASE_DIR}/requirements.txt"

echo "[5/9] 安装 Node 依赖并构建前端"
pushd "${RELEASE_DIR}/node-server" >/dev/null
npm ci
npm run build || true
popd >/dev/null

echo "[6/9] 数据库迁移/初始化"
if [[ -f "${RELEASE_DIR}/node-server/database_init.sql" ]]; then
  mysql -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "${DB_USER}" "-p${DB_PASS}" "${DB_NAME}" < "${RELEASE_DIR}/node-server/database_init.sql" || true
fi

echo "[7/9] 切换软链（原子发布）"
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

echo "[8/9] 安装 systemd 服务并重启"
install -m 644 "${CURRENT_LINK}/virtual-man-fashion.service" "/etc/systemd/system/${SERVICE_NAME}"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "[9/9] 启动/重启 PM2 前端并执行健康检查"
pm2 start "${CURRENT_LINK}/ecosystem.config.cjs" --env production --update-env || pm2 reload "${CURRENT_LINK}/ecosystem.config.cjs" --env production --update-env
pm2 save
bash "${CURRENT_LINK}/health-check.sh"

echo "部署完成: ${CURRENT_LINK}"

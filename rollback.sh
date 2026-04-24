#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/root/虚拟男装"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
SERVICE_NAME="${SERVICE_NAME:-virtual-man-fashion.service}"
BACKUP_DIR="/root/虚拟男装.bak"

echo "[1/4] 备份当前版本 -> ${BACKUP_DIR}"
rm -rf "${BACKUP_DIR}"
cp -a "${APP_ROOT}" "${BACKUP_DIR}"

echo "[2/4] 选择回滚版本"
TARGET_RELEASE="${1:-}"
if [[ -z "${TARGET_RELEASE}" ]]; then
  TARGET_RELEASE="$(ls -1 "${RELEASES_DIR}" | sort -r | sed -n '2p')"
fi
if [[ -z "${TARGET_RELEASE}" || ! -d "${RELEASES_DIR}/${TARGET_RELEASE}" ]]; then
  echo "未找到可回滚版本"
  exit 1
fi

echo "[3/4] 切换软链 -> ${TARGET_RELEASE}"
ln -sfn "${RELEASES_DIR}/${TARGET_RELEASE}" "${CURRENT_LINK}"

echo "[4/4] 重启服务"
systemctl restart "${SERVICE_NAME}"
systemctl is-active --quiet "${SERVICE_NAME}"

echo "回滚完成（目标版本: ${TARGET_RELEASE}）"

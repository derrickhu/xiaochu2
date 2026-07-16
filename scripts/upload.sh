#!/bin/bash
# 零参数 CDN 资源上传脚本 — 灵宠消消塔 2
# 用法: ./scripts/upload.sh              (增量上传)
#       ./scripts/upload.sh --force      (强制全量重传)
#       ./scripts/upload.sh --dry-run    (只对比不上传)
#       ./scripts/upload.sh --prune      (同步删除远端多余文件)
# 密钥：scripts/.cdn_secret（TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY）

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/upload_cdn.js" "$@"

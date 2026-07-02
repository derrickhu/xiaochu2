#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  xiaochu2 数值看板 - 服务管理
#  用法: ./tools/balance-dashboard/start.sh {start|stop|restart|status|log|install|uninstall}
#
#  请用本脚本启动，勿直接 npm run balance:dashboard 跑前台，
#  否则关闭终端后进程会被 SIGHUP 带走。本脚本 nohup 后台 + 可选 launchd 保活。
#  监听 0.0.0.0，局域网可访问。
# ═══════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="$ROOT_DIR/run"
LOG_DIR="$ROOT_DIR/logs"
VITE_CONFIG="$SCRIPT_DIR/vite.config.ts"
PORT="${BALANCE_DASHBOARD_PORT:-5174}"
SERVICE_NAME="balance-dashboard"
LAUNCHD_LABEL="com.dk.xiaochu2-balance-dashboard"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"

mkdir -p "$RUN_DIR" "$LOG_DIR"
cd "$ROOT_DIR"

export TZ="${TZ:-Asia/Shanghai}"

NODE_BIN="$(command -v node || true)"
VITE_BIN="$ROOT_DIR/node_modules/.bin/vite"
if [[ -z "$NODE_BIN" || ! -x "$VITE_BIN" ]]; then
  echo "未找到 Node 或依赖，请先在 xiaochu2 目录执行 npm install" >&2
  exit 1
fi
NODE_DIR="$(dirname "$NODE_BIN")"

get_lan_ip() {
  python3 -c "
import socket, re, subprocess
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(2)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    if ip.startswith('192.168.') and not ip.startswith('192.168.255.'):
        print(ip); raise SystemExit
    if ip.startswith('10.'):
        print(ip); raise SystemExit
except Exception:
    pass
try:
    out = subprocess.run(['/sbin/ifconfig'], capture_output=True, text=True, timeout=3).stdout
    for pat in [r'inet (192\.168\.(?!255)\d+\.\d+)', r'inet (10\.\d+\.\d+\.\d+)']:
        m = re.search(pat, out)
        if m:
            print(m.group(1)); raise SystemExit
except Exception:
    pass
print('127.0.0.1')
" 2>/dev/null
}

port_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  fi
}

pid_file() {
  echo "$RUN_DIR/${SERVICE_NAME}.pid"
}

log_file() {
  echo "$LOG_DIR/${SERVICE_NAME}.log"
}

write_pid_from_port() {
  local port="$1"
  local pids
  pids="$(port_pids "$port")"
  if [[ -n "$pids" ]]; then
    echo "$pids" | head -n 1 > "$(pid_file)"
    return 0
  fi
  return 1
}

is_running() {
  local pf
  pf="$(pid_file)"
  [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null
}

do_start() {
  local pf lf
  pf="$(pid_file)"
  lf="$(log_file)"

  if is_running; then
    echo "✅ 数值看板已在运行，PID: $(cat "$pf")"
    return 0
  fi

  if write_pid_from_port "$PORT"; then
    echo "✅ 端口 $PORT 已在监听，PID: $(cat "$pf")"
    return 0
  fi

  rm -f "$pf"
  echo "🚀 启动数值看板 (nohup 后台，0.0.0.0:$PORT) ..."
  nohup "$NODE_BIN" "$VITE_BIN" --config "$VITE_CONFIG" --host 0.0.0.0 --port "$PORT" --strictPort \
    >> "$lf" 2>&1 < /dev/null &
  local new_pid=$!
  disown "$new_pid" 2>/dev/null || true
  echo "$new_pid" > "$pf"

  local listen_ok=0
  for _ in 1 2 3 4 5 6 8 10; do
    sleep 0.5
    if write_pid_from_port "$PORT"; then
      listen_ok=1
      break
    fi
  done

  if [[ "$listen_ok" -ne 1 ]]; then
    echo "❌ 启动失败：端口 $PORT 未监听，请查看: $lf" >&2
    rm -f "$pf"
    return 1
  fi

  local lan_ip
  lan_ip="$(get_lan_ip)"
  echo "✅ 数值看板已启动，PID: $(cat "$pf")"
  echo "   本机:   http://127.0.0.1:${PORT}"
  if [[ -n "$lan_ip" && "$lan_ip" != "127.0.0.1" ]]; then
    echo "   局域网: http://${lan_ip}:${PORT}"
  fi
  echo "   注意: 勿用 192.168.255.x（多为 VPN/虚拟网卡，手机连不上）"
  echo "   日志:   $lf"
  echo ""
  echo "停止: ./tools/balance-dashboard/start.sh stop"
  echo "保活: ./tools/balance-dashboard/start.sh install"
}

do_stop() {
  local pf port_p
  pf="$(pid_file)"
  if [[ -f "$pf" ]]; then
    local pid
    pid="$(cat "$pf")"
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    rm -f "$pf"
  fi
  port_p="$(port_pids "$PORT")"
  if [[ -n "$port_p" ]]; then
    kill $port_p 2>/dev/null || true
  fi
  echo "✅ 数值看板已停止"
}

do_status() {
  local pf pids
  pf="$(pid_file)"
  pids="$(port_pids "$PORT")"
  echo ""
  echo "📊 xiaochu2 数值看板"
  echo "─────────────────────────────────────"
  if [[ -n "$pids" ]]; then
    echo "● 运行中 | 0.0.0.0:$PORT | PID ${pids//$'\n'/,}"
    echo "$pids" | head -n 1 > "$pf"
  else
    rm -f "$pf"
    echo "○ 未运行 | 端口 $PORT"
  fi
  echo "日志: $(log_file)"
  echo ""
}

do_log() {
  local lines="${1:-50}"
  local lf
  lf="$(log_file)"
  if [[ ! -f "$lf" ]]; then
    echo "日志不存在: $lf" >&2
    return 1
  fi
  echo "=== 数值看板最近 ${lines} 行 ($lf) ==="
  tail -n "$lines" "$lf"
}

launchd_path() {
  printf '%s:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' "$NODE_DIR"
}

do_install() {
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$LAUNCHD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${VITE_BIN}</string>
        <string>--config</string>
        <string>${VITE_CONFIG}</string>
        <string>--host</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>${PORT}</string>
        <string>--strictPort</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TZ</key>
        <string>Asia/Shanghai</string>
        <key>PATH</key>
        <string>$(launchd_path)</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$(log_file)</string>
    <key>StandardErrorPath</key>
    <string>$(log_file)</string>
</dict>
</plist>
EOF

  launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST"
  sleep 2
  echo "✅ 已安装 launchd 保活（登录自启 + 崩溃重启，0.0.0.0:${PORT}）"
  do_status
  local lan_ip
  lan_ip="$(get_lan_ip)"
  if [[ -n "$lan_ip" && "$lan_ip" != "127.0.0.1" ]]; then
    echo "局域网: http://${lan_ip}:${PORT}"
  fi
  echo "勿用 Vite 日志里的 192.168.255.x，手机/WiFi 请用上面局域网地址"
}

do_uninstall() {
  launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null || true
  rm -f "$LAUNCHD_PLIST"
  do_stop
  echo "✅ 已卸载 launchd 保活"
}

case "${1:-start}" in
  start) do_start ;;
  stop) do_stop ;;
  restart) do_stop; sleep 0.5; do_start ;;
  status|st) do_status ;;
  log) do_log "${2:-50}" ;;
  follow|tail) tail -f "$(log_file)" ;;
  install) do_install ;;
  uninstall) do_uninstall ;;
  *)
    echo "用法: $0 {start|stop|restart|status|log|follow|install|uninstall}" >&2
    exit 1
    ;;
esac

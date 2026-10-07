#!/bin/zsh
set -euo pipefail
readonly PROJECT_ROOT="${0:A:h:h}"
readonly ENV_DIR="$PROJECT_ROOT/host/pro-micro/build/venv"
if [[ ! -x "$ENV_DIR/bin/python" ]]; then
  python3 -m venv "$ENV_DIR"
fi
if ! "$ENV_DIR/bin/python" -c 'import aiohttp, serial' 2>/dev/null; then
  "$ENV_DIR/bin/python" -m pip install -r "$PROJECT_ROOT/host/pro-micro/requirements.txt"
fi
print 'Local controller page (default): http://127.0.0.1:8080/'
print 'For another Mac, use scripts/remote-tunnel.sh on that Mac.'
exec "$ENV_DIR/bin/python" "$PROJECT_ROOT/host/pro-micro/relay.py" "$@"

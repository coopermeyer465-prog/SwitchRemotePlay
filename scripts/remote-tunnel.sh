#!/bin/zsh
set -euo pipefail
if [[ $# != 1 || "$1" == -* || "$1" != *@* ]]; then
  print -u2 'Usage: zsh scripts/remote-tunnel.sh username@host-address'
  exit 1
fi
print 'Connecting controller tunnel. Keep this terminal open.'
print 'After SSH connects, open http://127.0.0.1:18080/ on this client Mac.'
exec ssh -N -T -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:18080:127.0.0.1:8080 "$1"

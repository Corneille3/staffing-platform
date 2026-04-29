#!/bin/bash
# Run this script periodically to reclaim disk space.
# Usage: ./cleanup.sh [--deep]
#   --deep: also cleans npm cache and trims journal logs (slower, more aggressive)

set -euo pipefail

DEEP=false
[[ "${1:-}" == "--deep" ]] && DEEP=true

echo "=== Disk before cleanup ==="
df -h /

echo ""
echo "=== Docker cleanup ==="
docker container prune -f
docker image prune -f
docker network prune -f
docker builder prune -f

if $DEEP; then
  echo "--- Deep: removing ALL unused images and volumes ---"
  docker image prune -af
  docker volume prune -f
fi

echo ""
echo "=== Snap: removing old disabled revisions ==="
snap list --all | awk '/disabled/{print $1, $3}' | \
  while read -r name rev; do
    sudo snap remove "$name" --revision="$rev"
  done

if $DEEP; then
  echo ""
  echo "=== Deep: npm cache ==="
  npm cache clean --force 2>/dev/null || true

  echo ""
  echo "=== Deep: journal logs (keep last 100M) ==="
  sudo journalctl --vacuum-size=100M

  echo ""
  echo "=== Deep: apt cache ==="
  sudo apt-get clean
  sudo apt-get autoremove -y
fi

echo ""
echo "=== Disk after cleanup ==="
df -h /

echo ""
echo "=== Docker space usage ==="
docker system df

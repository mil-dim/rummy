#!/bin/sh
set -eu

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  echo "Usage: sh scripts/announce-restart.sh [MINUTES] [MESSAGE]"
  exit 0
fi

minutes=${1:-10}
if [ "$#" -gt 0 ]; then shift; fi
message=${*:-Server update planned}

case "$minutes" in
  ''|*[!0-9]*)
    echo "announce-restart: MINUTES must be a whole number from 0 to 1440" >&2
    exit 2
    ;;
esac
[ "$minutes" -le 1440 ] || { echo "announce-restart: MINUTES must be from 0 to 1440" >&2; exit 2; }

docker compose exec -T tabletop node scripts/admin.mjs announce "$minutes" "$message"


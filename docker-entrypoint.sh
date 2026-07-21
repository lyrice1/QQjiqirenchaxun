#!/bin/sh
set -e

mkdir -p /data
ln -sf /data/data.db /app/server/data.db 2>/dev/null || true

node /app/server/index.js &

exec nginx -g "daemon off;"

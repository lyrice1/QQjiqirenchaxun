#!/bin/sh
# Persist project data to a mounted volume (/data) so it survives container recreation.
mkdir -p /data
export DATA_DIR=/data
export PORT=3002

# Boot the API server in the background, nginx (static + /api proxy) in foreground.
node /app/server/index.js &
exec nginx -g "daemon off;"

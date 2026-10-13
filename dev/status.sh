#!/usr/bin/env bash
source "$(dirname "$0")/env.sh"
docker ps -a --filter "label=$DEV_LABEL" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
log "config dir: $DEV_CONFIG_DIR"

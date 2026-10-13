#!/usr/bin/env bash
# Stops and removes the dev containers and network. Keeps the config and editor data
# (delete $DEV_STATE by hand to reset).
source "$(dirname "$0")/env.sh"
ids="$(docker ps -aq --filter "label=$DEV_LABEL")"
# shellcheck disable=SC2086
[[ -n "$ids" ]] && docker rm -f $ids >/dev/null
docker network rm "$DEV_NETWORK" >/dev/null 2>&1 || true
log "dev environment stopped; state kept in $DEV_STATE"

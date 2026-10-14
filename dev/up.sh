#!/usr/bin/env bash
# Starts (or updates) the LAN dev environment: a dev Glance, plus the editor once an image exists.
# Idempotent: it recreates the dev containers but never touches the config dir if it already has a glance.yml.
source "$(dirname "$0")/env.sh"

mkdir -p "$DEV_CONFIG_DIR" "$DEV_EDITOR_DATA" "$DEV_PREVIEW_DIR"
if [[ ! -f "$DEV_CONFIG_DIR/glance.yml" ]]; then
  cp "$DEV_ROOT/test/fixtures/valid/sample.yml" "$DEV_CONFIG_DIR/glance.yml"
  log "seeded $DEV_CONFIG_DIR/glance.yml from test/fixtures/valid/sample.yml"
fi

docker network inspect "$DEV_NETWORK" >/dev/null 2>&1 || \
  docker network create --label "$DEV_LABEL" "$DEV_NETWORK" >/dev/null

# Validate before (re)starting: Glance exits with code 0 on a bad startup config (docs/lessons.md).
docker run --rm --network none -v "$DEV_CONFIG_DIR:/app/config:ro" "$GLANCE_IMAGE" config:validate \
  || { log "glance.yml in $DEV_CONFIG_DIR is invalid; not starting"; exit 1; }

docker rm -f "$DEV_GLANCE" >/dev/null 2>&1 || true
# The Docker socket is mounted read-only to mirror a standard Glance install (the live Glance keeps its own socket
# mount, ADR-0005). It lets the docker-containers widget show this host's containers.
docker run -d --name "$DEV_GLANCE" --label "$DEV_LABEL" --network "$DEV_NETWORK" \
  --restart unless-stopped \
  -p "$DEV_BIND:$DEV_GLANCE_PORT:8080" \
  -v "$DEV_CONFIG_DIR:/app/config" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  "$GLANCE_IMAGE" >/dev/null
log "dev Glance:  http://<this-host>:$DEV_GLANCE_PORT/  ($GLANCE_VERSION)"

# The preview Glance (ADR-0019, handoff §4b): same pinned image and the same read-only socket as the dev Glance, its own
# config dir, no published port. Its config needs a file before it starts (Glance exits on a missing one); this is the
# same seed the editor writes (packages/server previewSeed). After that, only the editor writes it.
if [[ ! -f "$DEV_PREVIEW_DIR/glance.yml" ]]; then
  printf '%s\n' "server:" "  port: 8080" "  base-url: /preview" "pages:" "  - name: Preview" "    columns:" \
    "      - size: full" "        widgets: []" > "$DEV_PREVIEW_DIR/glance.yml"
fi
docker rm -f "$DEV_PREVIEW" >/dev/null 2>&1 || true
docker run -d --name "$DEV_PREVIEW" --label "$DEV_LABEL" --network "$DEV_NETWORK" \
  --restart unless-stopped \
  -v "$DEV_PREVIEW_DIR:/app/config" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  "$GLANCE_IMAGE" >/dev/null
log "dev preview Glance: internal only, served by the editor under /preview"

# The editor's Docker connection (ADR-0005): the pinned read-only socket proxy, on the dev network only. The editor
# never gets the socket itself.
docker rm -f "$DEV_DOCKER_PROXY" >/dev/null 2>&1 || true
mapfile -t proxy_env < <(for kv in $DOCKER_PROXY_ENV; do printf '%s\n' -e "$kv"; done)
docker run -d --name "$DEV_DOCKER_PROXY" --label "$DEV_LABEL" --network "$DEV_NETWORK" \
  --restart unless-stopped "${proxy_env[@]}" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  "$DOCKER_PROXY_IMAGE" >/dev/null
log "dev Docker proxy: internal only, read-only ($DOCKER_PROXY_VERSION)"

# Editor slot. There is no editor image until Phase 1, so it is skipped until one exists.
EDITOR_IMAGE="${EDITOR_IMAGE:-glance-editor:dev}"
if docker image inspect "$EDITOR_IMAGE" >/dev/null 2>&1; then
  docker rm -f "$DEV_EDITOR" >/dev/null 2>&1 || true
  docker run -d --name "$DEV_EDITOR" --label "$DEV_LABEL" --network "$DEV_NETWORK" \
    --restart unless-stopped \
    -p "$DEV_BIND:$DEV_EDITOR_PORT:3000" \
    -v "$DEV_CONFIG_DIR:/glance-config" \
    -v "$DEV_EDITOR_DATA:/data" \
    -v "$DEV_PREVIEW_DIR:/preview-config" \
    -e GLANCE_URL="http://$DEV_GLANCE:8080/" \
    -e PREVIEW_CONFIG=/preview-config/glance.yml \
    -e PREVIEW_GLANCE_URL="http://$DEV_PREVIEW:8080/" \
    -e DOCKER_PROXY_URL="tcp://$DEV_DOCKER_PROXY:2375" \
    "$EDITOR_IMAGE" >/dev/null
  log "dev editor:  http://<this-host>:$DEV_EDITOR_PORT/"
else
  log "dev editor:  skipped (no image '$EDITOR_IMAGE' yet; it arrives with Phase 1)"
fi

for _ in $(seq 1 40); do
  curl -fsS -o /dev/null "http://127.0.0.1:$DEV_GLANCE_PORT/api/healthz" && { log "dev Glance healthy"; exit 0; }
  sleep 0.5
done
docker logs "$DEV_GLANCE" >&2; log "dev Glance did not become healthy"; exit 1

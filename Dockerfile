# Glance Editor image. Build with scripts/build-editor-image.sh (it passes the pinned Glance image from /glance.version).
ARG GLANCE_IMAGE
ARG NODE_IMAGE=node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${GLANCE_IMAGE} AS glance

FROM ${NODE_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/model/package.json packages/model/
COPY packages/generator/package.json packages/generator/
COPY packages/glance/package.json packages/glance/
COPY apps/editor/package.json apps/editor/
RUN npm ci --no-audit --no-fund
COPY glance.version tsconfig.base.json ./
COPY packages packages
COPY apps/editor apps/editor
RUN npm -w apps/editor run build

FROM ${NODE_IMAGE}
ARG GLANCE_COMMIT
ARG GLANCE_VERSION
LABEL org.opencontainers.image.title="Glance Editor" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      org.glance-editor.glance-commit="${GLANCE_COMMIT}"
# Unmodified glance binary (AGPL-3.0, source: github.com/glanceapp/glance at the commit above), used only for
# `config:validate` (ADR-0001, ADR-0013).
COPY --from=glance /app/glance /usr/local/bin/glance
WORKDIR /app
COPY --from=build /src/apps/editor/build build
RUN echo '{"type":"module"}' > package.json
ENV NODE_ENV=production PORT=3000 GLANCE_BIN=/usr/local/bin/glance GLANCE_VERSION=${GLANCE_VERSION} \
    GLANCE_CONFIG=/glance-config/glance.yml EDITOR_DATA_DIR=/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "build"]

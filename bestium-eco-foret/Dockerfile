FROM node:24.19.0-bookworm-slim AS runtime

WORKDIR /app

COPY package.json /app/package.json
COPY src/capture.ts /app/src/capture.ts
COPY src/settings.ts /app/src/settings.ts
COPY src/m2.ts /app/src/m2.ts
COPY src/protocol-debug.ts /app/src/protocol-debug.ts

COPY src/capture-store.ts /app/src/capture-store.ts
COPY src/ui.ts /app/src/ui.ts

LABEL io.hass.version="0.2.5"
LABEL io.hass.type="app"
LABEL io.hass.arch="aarch64|amd64"

CMD ["node", "src/m2.ts"]

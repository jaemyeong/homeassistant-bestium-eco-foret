FROM node:24.19.0-bookworm-slim AS runtime

WORKDIR /app

COPY package.json /app/package.json
COPY src/capture.ts /app/src/capture.ts
COPY src/settings.ts /app/src/settings.ts
COPY src/m2.ts /app/src/m2.ts

LABEL io.hass.version="0.1.0"
LABEL io.hass.type="app"
LABEL io.hass.arch="aarch64|amd64"

USER node

CMD ["node", "src/m2.ts"]

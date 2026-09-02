FROM node:24.19.0-bookworm-slim AS runtime

WORKDIR /app

COPY package.json /app/package.json

# Every module the entry point can reach, and nothing else.
#
# The list is deliberate — `.dockerignore` denies by default and this re-includes — but a list
# has to be edited every time a module is added, and twice it was not. `tx-queue.ts` was absent
# from the image from the day it was written and `ha-design-system.ts` from the day after, and
# 0.3.0's first deploy died at import with `Cannot find module`. `test/addon-image.test.ts`
# now derives the closure from the imports and fails when this list falls behind it.
COPY src/capture.ts /app/src/capture.ts
COPY src/settings.ts /app/src/settings.ts
COPY src/m2.ts /app/src/m2.ts
COPY src/protocol-debug.ts /app/src/protocol-debug.ts
COPY src/mqtt.ts /app/src/mqtt.ts
COPY src/capture-store.ts /app/src/capture-store.ts
COPY src/tx-queue.ts /app/src/tx-queue.ts
COPY src/ha-design-system.ts /app/src/ha-design-system.ts
COPY src/ui.ts /app/src/ui.ts

LABEL io.hass.version="0.5.9"
LABEL io.hass.type="app"
LABEL io.hass.arch="aarch64|amd64"

CMD ["node", "src/m2.ts"]

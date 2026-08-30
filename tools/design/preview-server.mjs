// Serves the real page against a synthetic status, so the client script actually runs.
// No gateway, no sockets: the point is to find a ReferenceError before an operator does.
import { createServer } from "node:http";
import { renderAppHtml } from "/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret/bestium-eco-foret/src/ui.ts";

const html = renderAppHtml();
let recording = "off";
let started = 0;

const status = () => ({
  serverNowMs: Date.now(),
  generation: 3,
  lastRxByteAtMs: Date.now() - 400,
  lastValidFrameAtMs: Date.now() - 400,
  phase: "running",
  state: recording === "open" ? "running" : "stopped",
  startedAtMs: started,
  elapsedMs: recording === "open" ? Date.now() - started : 0,
  limitMs: 86_400_000,
  byteCount: recording === "open" ? 13_002_342 : 0,
  recordCount: recording === "open" ? 8_412 : 0,
  file: recording === "off" && started > 0 ? { name: "capture.ndjson", sizeBytes: 12, finalized: true } : null,
  csrfToken: "preview",
  tx: {
    enabled: true, authorized: true, connected: true, link: "up", recording,
    inFlight: false, quarantined: false, pendingAppend: false, quiet: true,
    currentGenerationRx: true, fresh: true, sevenFProof: false, observationTimeoutMs: 4600,
  },
  debug: {
    generation: 3,
    devices: {
      lights: { 1: { state: "on" }, 2: { state: "off" }, 3: { state: "off" } },
      heating: {
        1: { state: "on", currentC: 24, targetC: 23 },
        2: { state: "off", currentC: 23, targetC: 23 },
        3: { state: "off", currentC: 25, targetC: 23 },
        4: { state: "off", currentC: 22, targetC: 23 },
      },
      gas: { state: "open" },
      batchOff: { state: "off" },
      elevator: { call: "up", floorLabel: "B1" },
      entrances: { household: { doorOpenAtMs: Date.now() - 90_000, doorOpenCount: 1 } },
    },
  },
});

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(status()));
    return;
  }
  if (path === "/api/capture") { recording = "open"; started = Date.now(); res.writeHead(200); res.end("{}"); return; }
  if (path === "/api/stop") { recording = "off"; res.writeHead(200); res.end("{}"); return; }
  if (path === "/api/action") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      process.stdout.write("ACTION " + body + "\n");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ outcome: "confirmed", confirmed: true, deviceConfirmed: true }));
    });
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(8123, "127.0.0.1", () => process.stdout.write("preview on http://127.0.0.1:8123/\n"));

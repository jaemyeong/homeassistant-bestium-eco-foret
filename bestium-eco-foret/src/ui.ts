export function renderAppHtml(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light dark">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BESTIUM Eco-Foret capture</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; background: #f5f7fb; color: #172033; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 18rem; background: #f5f7fb; line-height: 1.45; }
    main { width: min(70rem, 100% - 2rem); margin: 0 auto; padding: 2rem 0 3rem; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(1.55rem, 3vw, 2.25rem); letter-spacing: -.03em; }
    .eyebrow { color: #4269d0; font-size: .76rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .lede { margin-top: .4rem; color: #56627a; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .card { border: 1px solid #d8deea; border-radius: 1rem; background: rgba(255,255,255,.86); padding: 1.1rem; box-shadow: 0 .5rem 1.5rem rgba(31,43,74,.07); }
    .card h2 { display: flex; align-items: center; gap: .55rem; font-size: 1rem; }
    .card h2 svg { width: 1.25rem; height: 1.25rem; color: #4269d0; }
    .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; margin-top: 1rem; }
    .metric { padding: .8rem; border-radius: .75rem; background: #edf1fa; }
    .metric small { display: block; color: #56627a; font-size: .75rem; }
    .metric strong { display: block; margin-top: .2rem; font-size: 1.15rem; overflow-wrap: anywhere; }
    .bounds { grid-column: 1 / -1; }
    .bound-list { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .7rem; margin: 1rem 0 0; }
    .bound-list div { min-width: 0; padding: .75rem; border-radius: .75rem; background: #edf1fa; }
    .bound-list dt { color: #56627a; font-size: .74rem; }
    .bound-list dd { margin: .2rem 0 0; font-weight: 750; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 1rem; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: .45rem; min-height: 2.7rem; border: 0; border-radius: .7rem; padding: .65rem 1rem; color: white; background: #4269d0; font: inherit; font-weight: 700; cursor: pointer; }
    button.secondary { background: #56627a; }
    button:disabled { cursor: not-allowed; opacity: .45; }
    button:focus-visible { outline: .2rem solid #f0a43b; outline-offset: .2rem; }
    button svg { width: 1.1rem; height: 1.1rem; }
    .preview { grid-column: 1 / -1; }
    .preview-list { display: grid; gap: .45rem; margin: .9rem 0 0; max-height: 24rem; overflow: auto; padding: 0; list-style: none; }
    .record { display: grid; grid-template-columns: 4rem 1fr auto; gap: .7rem; align-items: center; padding: .6rem .7rem; border-radius: .6rem; background: #edf1fa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
    .record time { color: #56627a; }
    .empty { color: #56627a; padding: .7rem 0; }
    .status { display: inline-flex; align-items: center; gap: .4rem; color: #56627a; font-weight: 700; }
    .status::before { content: ""; width: .65rem; height: .65rem; border-radius: 50%; background: #8993a8; }
    .status.running::before { background: #3ca36b; box-shadow: 0 0 .5rem #3ca36b; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @media (max-width: 54rem) { .bound-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 42rem) { main { width: min(100% - 1rem, 70rem); padding-top: 1rem; } header { display: block; } .grid { grid-template-columns: 1fr; } .bounds, .preview { grid-column: auto; } .bound-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (prefers-color-scheme: dark) { :root { background: #101522; color: #eef2ff; } body { background: #101522; } .lede, .metric small, .bound-list dt, .empty, .status, .record time { color: #a9b4cc; } .card { border-color: #2d3850; background: #171e2d; box-shadow: none; } .metric, .bound-list div, .record { background: #202a3d; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; } }
  </style>
</head>
<body>
  <svg aria-hidden="true" width="0" height="0" class="sr-only">
    <symbol id="icon-wave" viewBox="0 0 24 24"><path fill="currentColor" d="M3 12h3l2-7 4 14 2-7h7v2h-8l-1 3-4-14-1 11H3z"/></symbol>
    <symbol id="icon-play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></symbol>
    <symbol id="icon-stop" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h12v12H6z"/></symbol>
    <symbol id="icon-download" viewBox="0 0 24 24"><path fill="currentColor" d="M11 3h2v10l3-3 1.4 1.4L12 17.8l-5.4-6.4L8 10l3 3zM4 19h16v2H4z"/></symbol>
  </svg>
  <main>
    <header>
      <div>
        <p class="eyebrow">RX-only capture</p>
        <h1>BESTIUM Eco-Foret capture</h1>
        <p class="lede">Bounded RX-only EW11 data capture</p>
      </div>
      <p id="status" class="status" role="status" aria-live="polite" aria-label="Capture state">Loading</p>
    </header>
    <section class="grid" aria-label="Capture dashboard">
      <article class="card">
        <h2><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-wave"></use></svg>Capture status</h2>
        <div class="metrics">
          <div class="metric"><small>Elapsed</small><strong id="elapsed">0 ms</strong></div>
          <div class="metric"><small>Limit</small><strong id="limit">0 ms</strong></div>
          <div class="metric"><small>Bytes</small><strong id="bytes">0</strong></div>
          <div class="metric"><small>Records</small><strong id="count">0</strong></div>
        </div>
        <div class="actions">
          <button id="start" type="button" aria-label="Start bounded capture"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-play"></use></svg><span>Start</span></button>
          <button id="stop" class="secondary" type="button" aria-label="Stop capture and finalize file" disabled><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-stop"></use></svg><span>Stop</span></button>
          <button id="download" type="button" aria-label="Download finalized capture" disabled><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-download"></use></svg><span>Download</span></button>
        </div>
        <p id="message" class="lede" role="status" aria-live="polite"></p>
      </article>
      <article class="card bounds">
        <h2><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-wave"></use></svg>Configured bounds</h2>
        <dl class="bound-list">
          <div><dt>EW11 endpoint</dt><dd id="endpoint">—</dd></div>
          <div><dt>Connect timeout</dt><dd id="connect-timeout">—</dd></div>
          <div><dt>Idle timeout</dt><dd id="idle-timeout">—</dd></div>
          <div><dt>Duration cap</dt><dd id="duration-cap">—</dd></div>
          <div><dt>Byte cap</dt><dd id="byte-cap">—</dd></div>
          <div><dt>Record cap</dt><dd id="record-cap">—</dd></div>
        </dl>
      </article>
      <article class="card">
        <h2><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-wave"></use></svg>Last bounded result</h2>
        <div class="metrics">
          <div class="metric"><small>Reason</small><strong id="reason">None</strong></div>
          <div class="metric"><small>File</small><strong id="file">None</strong></div>
          <div class="metric"><small>Started</small><strong id="started">None</strong></div>
          <div class="metric"><small>Finished</small><strong id="finished">None</strong></div>
        </div>
      </article>
      <article class="card preview">
        <h2><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#icon-wave"></use></svg>Recent preview <span class="sr-only">(up to 20 records)</span></h2>
        <ol id="preview" class="preview-list" aria-label="Recent capture preview"><li class="empty">No records captured yet.</li></ol>
      </article>
    </section>
  </main>
  <script>
    const statusText = document.getElementById("status");
    const startButton = document.getElementById("start");
    const stopButton = document.getElementById("stop");
    const downloadButton = document.getElementById("download");
    const preview = document.getElementById("preview");
    const message = document.getElementById("message");
    const text = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
    const number = (value, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
    const formatNumber = (value) => number(value).toLocaleString();
    const formatMs = (value) => formatNumber(value) + " ms";
    const formatDate = (value) => { const timestamp = number(value, NaN); return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString() : "—"; };
    const formatBound = (value, suffix = "") => value === undefined || value === null ? "—" : formatNumber(value) + suffix;
    function draw(payload) {
      const source = payload && typeof payload === "object" ? payload : {};
      const result = source.lastResult && typeof source.lastResult === "object" ? source.lastResult : source;
      const configured = source.bounds || source.settings || result.bounds || source;
      const endpointHost = typeof configured.ew11_host === "string" ? configured.ew11_host : "";
      const endpointPort = configured.ew11_port;
      text("endpoint", endpointHost && endpointPort !== undefined ? endpointHost + ":" + formatNumber(endpointPort) : "—");
      text("connect-timeout", formatBound(configured.connect_timeout_ms, " ms"));
      text("idle-timeout", formatBound(configured.idle_timeout_ms, " ms"));
      text("duration-cap", formatBound(configured.capture_duration_ms, " ms"));
      text("byte-cap", formatBound(configured.maximum_bytes, " B"));
      text("record-cap", formatBound(configured.maximum_records));
      const phase = ["starting", "running", "finalizing", "stopped"].includes(source.phase)
        ? source.phase
        : "stopped";
      const phaseLabels = {
        starting: "Starting",
        running: "Running",
        finalizing: "Finalizing",
        stopped: "Stopped",
      };
      statusText.textContent = phaseLabels[phase];
      statusText.classList.toggle("running", phase === "running");
      text("elapsed", formatMs(result.elapsedMs));
      text("limit", formatMs(result.limitMs));
      text("bytes", Number(result.byteCount || 0).toLocaleString());
      text("count", Number(result.recordCount || 0).toLocaleString());
      text("reason", source.lastResult ? (result.reason || "None") : "None");
      text("file", result.file && result.file.name ? result.file.name : "None");
      text("started", formatDate(result.startedAtMs));
      text("finished", formatDate(result.stoppedAtMs));
      if (!actionBusy) {
        startButton.disabled = phase !== "stopped";
        stopButton.disabled = phase !== "running";
      }
      downloadButton.disabled = !(result.file && result.file.finalized === true);
      preview.replaceChildren();
      const items = Array.isArray(result.preview) ? result.preview.slice(-20) : [];
      if (items.length === 0) { const empty = document.createElement("li"); empty.className = "empty"; empty.textContent = "No records captured yet."; preview.append(empty); return; }
      for (const record of items) {
        const row = document.createElement("li"); row.className = "record";
        const sequence = document.createElement("span"); sequence.textContent = "#" + record.sequence;
        const hex = document.createElement("code");
        const rawHex = typeof record.hex === "string" ? record.hex : "";
        hex.textContent = rawHex.length > 96 ? rawHex.slice(0, 96) + "…" : rawHex;
        const length = document.createElement("time"); length.textContent = formatNumber(record.byteLength) + " B";
        row.append(sequence, hex, length); preview.append(row);
      }
    }
    let refreshInFlight = false;
    let actionBusy = false;
    async function refresh() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try { const response = await fetch("./api/status", { cache: "no-store" }); if (!response.ok) throw new Error("status"); draw(await response.json()); }
      catch { statusText.textContent = "Unavailable"; statusText.classList.remove("running"); if (message) message.textContent = "Status is temporarily unavailable."; }
      finally { refreshInFlight = false; }
    }
    async function action(endpoint) {
      if (actionBusy) return;
      actionBusy = true;
      startButton.disabled = true;
      stopButton.disabled = true;
      if (message) message.textContent = "Updating capture…";
      try { const response = await fetch(endpoint, { method: "POST" }); if (!response.ok) throw new Error("action"); await refresh(); }
      catch { if (message) message.textContent = "The capture action failed."; }
      finally { actionBusy = false; await refresh(); }
    }
    startButton.addEventListener("click", () => { void action("./api/capture"); });
    stopButton.addEventListener("click", () => { void action("./api/stop"); });
    downloadButton.addEventListener("click", () => { window.location.href = "./api/download"; });
    void refresh();
    window.setInterval(() => { void refresh(); }, 2000);
  </script>
</body>
</html>`;
}

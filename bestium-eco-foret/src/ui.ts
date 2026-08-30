export function renderAppHtml(): string {
  return String.raw`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>BESTIUM Eco-Foret Protocol Debug · 프로토콜 디버그</title>
  <style>
    /* Home Assistant design system, mirrored. An Ingress iframe inherits neither
       the HA theme variables nor its ha-* components, and the add-on page takes on
       no external asset dependency, so the tokens and component geometry the design
       uses are restated here from tokens/{core,theme,typography}.css and
       components/ha-components.css. */
    :root {
      --ha-font-family-body: Roboto, "Noto Sans KR", Noto, system-ui, sans-serif;
      --ha-font-family-code: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --ha-font-size-xs:10px; --ha-font-size-s:12px; --ha-font-size-m:14px; --ha-font-size-l:16px;
      --ha-font-size-xl:20px; --ha-font-size-2xl:24px; --ha-font-size-3xl:28px; --ha-font-size-4xl:32px;
      --ha-line-height-condensed:1.2; --ha-line-height-normal:1.6;
      --ha-space-1:4px; --ha-space-2:8px; --ha-space-3:12px; --ha-space-4:16px; --ha-space-5:20px; --ha-space-6:24px; --ha-space-8:32px;
      --ha-radius-sm:4px; --ha-radius-md:8px; --ha-radius-lg:12px; --ha-radius-pill:9999px;
      --ha-control-transition:180ms ease-in-out;
      --header-height:56px; --min-touch-target:44px;
      --primary-text-color:#212121; --secondary-text-color:#727272; --disabled-text-color:#bdbdbd;
      --primary-color:#009ac7; --dark-primary-color:#0288d1; --accent-color:#ff9800;
      --divider-color:rgba(0,0,0,.12); --outline-color:rgba(0,0,0,.12); --outline-hover-color:rgba(0,0,0,.24);
      --error-color:#db4437; --warning-color:#ffa600; --success-color:#43a047; --info-color:#039be5;
      --card-background-color:#fff; --primary-background-color:#fafafa; --secondary-background-color:#e5e5e5;
      --input-fill-color:rgb(245,245,245); --disabled-color:#bdbdbd; --white-color:#fff;
      --state-light-active-color:#ffc107; --state-climate-heat-color:#ff6f22;
      --focus: var(--primary-color);
    }
    @media (prefers-color-scheme:dark) { :root {
      --primary-text-color:#e1e1e1; --secondary-text-color:#9b9b9b; --disabled-text-color:#6f6f6f;
      --divider-color:rgba(225,225,225,.12); --outline-color:rgba(225,225,225,.12); --outline-hover-color:rgba(225,225,225,.24);
      --card-background-color:#1c1c1c; --primary-background-color:#111; --secondary-background-color:#282828;
      --input-fill-color:rgba(255,255,255,.05); --disabled-color:#464646;
    } }
    @media (prefers-reduced-motion:reduce) { :root { --ha-control-transition:1ms; } *,*::before,*::after { transition-duration:.01ms !important; animation-duration:.01ms !important; scroll-behavior:auto !important; } }

    *, *::before, *::after { box-sizing:border-box; }
    html { font-size:14px; }
    body { margin:0; background:var(--primary-background-color); color:var(--primary-text-color);
      font-family:var(--ha-font-family-body); font-size:var(--ha-font-size-m); line-height:var(--ha-line-height-normal);
      -webkit-font-smoothing:antialiased; }
    h1,h2,h3,p { margin:0; }

    /* header + tab row */
    main > header { display:flex; align-items:center; gap:var(--ha-space-3); min-height:var(--header-height);
      padding:var(--ha-space-2) var(--ha-space-4); background:var(--card-background-color); border-bottom:1px solid var(--divider-color); }
    main > header > div { flex:1; min-width:0; }
    main > header h1 { font-size:var(--ha-font-size-l); font-weight:500; line-height:1.25; }
    main > header p { font-size:var(--ha-font-size-s); line-height:1.3; }
    .status { display:inline-flex; align-items:center; gap:var(--ha-space-2); height:36px; padding:0 var(--ha-space-3);
      border:1px solid var(--divider-color); border-radius:var(--ha-radius-pill);
      font-size:var(--ha-font-size-s); font-weight:500; white-space:nowrap; }
    .app-tabs { display:flex; gap:var(--ha-space-1); padding:0 var(--ha-space-4);
      background:var(--card-background-color); border-bottom:1px solid var(--divider-color); }
    .ha-tab { display:flex; align-items:center; gap:var(--ha-space-2); height:48px; padding:0 var(--ha-space-4);
      border:none; border-bottom:2px solid transparent; background:none; color:var(--secondary-text-color);
      font:inherit; font-weight:500; cursor:pointer; white-space:nowrap;
      transition:color var(--ha-control-transition), border-color var(--ha-control-transition); }
    .ha-tab { width:auto; border-radius:0; }
    .ha-tab::before { content:none; }
    .ha-tab:hover { color:var(--primary-text-color); }
    .ha-tab[aria-selected="true"] { color:var(--primary-color); border-bottom-color:var(--primary-color); }
    #surface[data-tab="control"] [data-surface="debug"], #surface[data-tab="debug"] [data-surface="control"] { display:none; }

    .surface { max-width:1200px; margin:0 auto; padding:var(--ha-space-4) var(--ha-space-6) var(--ha-space-8);
      display:flex; flex-direction:column; gap:var(--ha-space-6); }
    .grid { display:grid; width:100%; grid-template-columns:repeat(auto-fit,minmax(20rem,1fr)); gap:var(--ha-space-5); align-items:start; }
    .wide { grid-column:1/-1; }

    /* ha-card */
    .card { position:relative; background:var(--card-background-color); color:var(--primary-text-color);
      border:1px solid var(--divider-color); border-radius:var(--ha-radius-lg); box-shadow:none;
      padding:var(--ha-space-5) var(--ha-space-6); }
    .card h2 { font-size:var(--ha-font-size-xl); font-weight:500; }
    .muted { color:var(--secondary-text-color); font-size:var(--ha-font-size-s); }

    /* ha-badge / assist chip */
    .pill { display:inline-flex; align-items:center; gap:var(--ha-space-2); height:32px; padding:0 var(--ha-space-4);
      border:1px solid var(--outline-color); border-radius:var(--ha-radius-pill); background:transparent;
      font-size:var(--ha-font-size-s); font-weight:500; line-height:1; }
    .pill.yes { border-color:transparent; background:color-mix(in srgb,var(--success-color) 14%,transparent); color:var(--success-color); }
    .pill.no { border-color:transparent; background:color-mix(in srgb,var(--error-color) 12%,transparent); color:var(--error-color); }
    .pill.warn { border-color:transparent; background:color-mix(in srgb,var(--warning-color) 16%,transparent); color:#8a5a00; }
    /* A sentence-length notice keeps the badge tint but has to wrap, so it drops the
       badge's fixed height and pill geometry rather than overflowing it. */
    .pill.block { display:block; height:auto; min-height:32px; border-radius:var(--ha-radius-md);
      padding:var(--ha-space-2) var(--ha-space-4); line-height:var(--ha-line-height-normal); font-weight:400; }
    @media (prefers-color-scheme:dark) { .pill.warn { color:var(--warning-color); } }

    /* ha-control-button geometry: the two-activation review flow keeps discrete
       buttons rather than the design's one-tap switch, so the segmented look is
       applied to the existing ON/OFF pair instead. */
    .controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(11rem,1fr)); gap:var(--ha-space-2); margin-top:var(--ha-space-3); }
    button, input { font:inherit; }
    button { position:relative; display:block; width:100%; text-align:center;
      min-height:var(--min-touch-target); padding:var(--ha-space-2) var(--ha-space-4); border:none; border-radius:var(--ha-radius-md);
      background:none; color:var(--primary-text-color); font-weight:500; cursor:pointer; overflow:hidden; z-index:0;
      transition:box-shadow var(--ha-control-transition), color var(--ha-control-transition); -webkit-tap-highlight-color:transparent; }
    button::before { content:""; position:absolute; inset:0; z-index:-1; background:var(--primary-color); opacity:.16; pointer-events:none;
      transition:opacity var(--ha-control-transition); }
    button:hover::before { opacity:.26; } button:active::before { opacity:.34; }
    button.secondary::before { background:var(--disabled-color); opacity:.2; }
    button.warning { color:var(--white-color); } button.warning::before { background:var(--warning-color); opacity:1; }
    button:disabled { cursor:not-allowed; color:var(--disabled-text-color); }
    button:disabled::before { background:var(--disabled-color); opacity:.2; }
    button:focus-visible, input:focus-visible { outline:none; box-shadow:0 0 0 2px var(--focus); }
    input { width:100%; min-height:var(--min-touch-target); border:1px solid var(--outline-color); border-radius:var(--ha-radius-md);
      padding:0 var(--ha-space-3); background:var(--input-fill-color); color:inherit; }
    input[aria-invalid="true"] { border-color:var(--error-color); }
    label { display:grid; gap:var(--ha-space-1); font-size:var(--ha-font-size-s); color:var(--secondary-text-color); }
    .error { color:var(--error-color); min-height:1.4rem; font-size:var(--ha-font-size-s); }

    /* ha-tile rows */
    .monitor { display:grid; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr)); gap:var(--ha-space-2); margin-top:var(--ha-space-3); }
    .monitor-row { display:flex; flex-direction:column; justify-content:center; gap:2px; min-height:56px;
      padding:var(--ha-space-2) var(--ha-space-3); border:1px solid var(--divider-color); border-radius:var(--ha-radius-md);
      background:var(--card-background-color); overflow-wrap:anywhere; min-width:0; }
    .monitor-row strong { display:block; font-size:var(--ha-font-size-m); font-weight:500; letter-spacing:.1px; }
    .monitor-row span, .monitor-row p { display:block; font-size:var(--ha-font-size-s); line-height:var(--ha-line-height-condensed);
      letter-spacing:.4px; color:var(--secondary-text-color); }
    .kv { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--ha-space-3); margin-top:var(--ha-space-3); }
    .kv div { display:flex; flex-direction:column; gap:2px; padding:var(--ha-space-3);
      background:var(--input-fill-color); border-radius:var(--ha-radius-md);
      overflow-wrap:anywhere; min-width:0; font-size:var(--ha-font-size-s); }
    .kv small { color:var(--secondary-text-color); }
    .kv strong { font-size:var(--ha-font-size-l); font-weight:500; }
    .age { font-family:var(--ha-font-family-code); font-size:var(--ha-font-size-s); color:var(--secondary-text-color); }
    ol { padding-left:1.5rem; } ol li { font-family:var(--ha-font-family-code); font-size:var(--ha-font-size-s); }
    .actions { display:flex; flex-wrap:wrap; gap:var(--ha-space-2); margin-top:var(--ha-space-3); }
    /* The confirmation phrase is 41 characters. Sharing a flex row with two buttons left
       it showing about half of that, so the operator could not check what they typed. */
    .actions > label { flex:1 1 100%; min-width:0; }
    /* 41 monospace characters have to fit, so the type shrinks with the viewport rather
       than letting the operator verify half a phrase. */
    .actions > label input { width:100%; font-family:var(--ha-font-family-code);
      font-size:clamp(10px, 2.6vw, var(--ha-font-size-m)); letter-spacing:0; }
    /* Shown only once a write leaves the device state unknown. */
    .unlock { display:none; margin-top:var(--ha-space-3); padding:var(--ha-space-3) var(--ha-space-4);
      border:1px solid var(--warning-color); border-radius:var(--ha-radius-md); }
    .unlock[data-active="true"] { display:block; }
    .unlock button { margin-top:var(--ha-space-2); }
    .actions button { width:auto; }

    /* ha-card head + ha-tile + ha-control-select, from components/ha-components.css */
    .card-head { display:flex; align-items:baseline; justify-content:space-between; gap:var(--ha-space-3); flex-wrap:wrap; }
    .badge { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 var(--ha-space-2);
      white-space:nowrap; flex:none;
      border-radius:var(--ha-radius-pill); font-size:var(--ha-font-size-s); font-weight:500; }
    .badge.warn { background:color-mix(in srgb,var(--warning-color) 16%,transparent); color:#8a5a00; }
    @media (prefers-color-scheme:dark) { .badge.warn { color:var(--warning-color); } }
    .tiles { display:grid; gap:var(--ha-space-2); margin-top:var(--ha-space-3); }
    .tile { display:flex; flex-wrap:wrap; align-items:center; gap:var(--ha-space-3); min-height:56px;
      padding:10px var(--ha-space-3); border:1px solid var(--divider-color); border-radius:var(--ha-radius-md);
      background:var(--card-background-color); }
    .tile-icon { position:relative; display:flex; align-items:center; justify-content:center; flex:none;
      width:36px; height:36px; border-radius:var(--ha-radius-pill); overflow:hidden; color:var(--tile-color,var(--secondary-text-color)); }
    .tile-icon::before { content:""; position:absolute; inset:0; background:var(--tile-color,var(--disabled-color)); opacity:.2; }
    .tile-icon-glyph { position:relative; }
    .tile-info { display:flex; flex-direction:column; justify-content:center; flex:1 1 9rem; min-width:9rem; }
    .tile-info strong { font-size:var(--ha-font-size-m); font-weight:500; letter-spacing:.1px; }
    .tile-info span { font-size:var(--ha-font-size-s); line-height:var(--ha-line-height-condensed);
      color:var(--secondary-text-color); overflow-wrap:anywhere; }
    .seg { position:relative; display:flex; flex:none; gap:var(--ha-space-1); padding:var(--ha-space-1);
      border-radius:10px; background:color-mix(in srgb,var(--disabled-color) 20%,transparent); }
    .seg button { width:auto; min-height:32px; padding:0 var(--ha-space-3); border-radius:6px;
      font-size:var(--ha-font-size-s); }
    .seg button::before { opacity:0; }
    .seg button:hover::before { opacity:.2; }
    .card > .seg { margin-top:var(--ha-space-3); }

    /* heating zones: a measurement first, then its controls */
    .group-label { display:flex; align-items:center; gap:var(--ha-space-2); margin-top:var(--ha-space-4);
      font-size:var(--ha-font-size-s); color:var(--secondary-text-color); }
    .group-label.warn { color:var(--warning-color); }
    .badge.ok { background:color-mix(in srgb,var(--success-color) 16%,transparent); color:var(--success-color); }
    .zones { display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,20rem)); gap:var(--ha-space-3); margin-top:var(--ha-space-2); }
    .zone { display:flex; flex-direction:column; gap:var(--ha-space-3); padding:var(--ha-space-4);
      border:1px solid var(--divider-color); border-radius:var(--ha-radius-md); background:var(--card-background-color); }
    .zone-head { display:flex; align-items:center; gap:var(--ha-space-2); flex-wrap:wrap; }
    .zone-head .tile-info { flex:1 1 6rem; min-width:6rem; }
    .zone-temp { display:flex; align-items:baseline; gap:6px; }
    .temp-value { font-size:44px; font-weight:700; line-height:1; letter-spacing:-.02em; color:var(--primary-text-color); }
    .temp-unit { font-size:var(--ha-font-size-xl); font-weight:500; color:var(--secondary-text-color); }
    .temp-label { font-size:var(--ha-font-size-s); color:var(--secondary-text-color); }
    .zone-target { display:flex; align-items:center; flex-wrap:wrap; gap:var(--ha-space-2); }
    .zone-target strong { font-size:var(--ha-font-size-l); font-weight:500; }
    .zone-set { display:flex; align-items:center; gap:var(--ha-space-2); flex:1 1 10rem; min-width:0; margin-left:auto; }
    .zone-set input { flex:0 1 4.5rem; min-width:3.5rem; }
    .zone-set button { width:auto; min-height:36px; padding:0 var(--ha-space-3); font-size:var(--ha-font-size-s); white-space:nowrap; }
    .sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }

    /* debug surface: frame table, step rail, inline warning */
    .table-wrap { overflow-x:auto; margin-top:var(--ha-space-3); }
    table.frames { width:100%; border-collapse:collapse; font-size:var(--ha-font-size-s); }
    table.frames th { text-align:left; font-weight:500; color:var(--secondary-text-color);
      padding:var(--ha-space-2) var(--ha-space-3); border-bottom:1px solid var(--divider-color); white-space:nowrap; }
    table.frames td { padding:var(--ha-space-2) var(--ha-space-3); border-bottom:1px solid var(--divider-color); vertical-align:top; }
    table.frames td:nth-child(2) { font-family:var(--ha-font-family-code); overflow-wrap:anywhere; }
    table.frames td:nth-child(1) { white-space:nowrap; font-weight:500; color:var(--primary-text-color); }
    table.frames td:nth-child(4) { white-space:nowrap; color:var(--secondary-text-color); }
    .alert-line { display:flex; align-items:flex-start; gap:var(--ha-space-2); margin-top:var(--ha-space-3);
      padding:var(--ha-space-3); border-radius:var(--ha-radius-md);
      background:color-mix(in srgb,var(--warning-color) 12%,transparent); color:var(--primary-text-color); }
    .alert-line svg { flex:none; color:var(--warning-color); }
    .steps { display:flex; flex-wrap:wrap; gap:var(--ha-space-4); list-style:none; margin:var(--ha-space-3) 0 0; padding:0;
      font-size:var(--ha-font-size-s); color:var(--secondary-text-color); }
    .steps li { display:flex; align-items:center; gap:var(--ha-space-2); }
    .step-n { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px;
      border-radius:var(--ha-radius-pill); background:var(--secondary-background-color);
      font-size:var(--ha-font-size-xs); font-weight:500; color:var(--primary-text-color); }

    /* send banner */
    .banner { position:relative; overflow:hidden; border:1px solid var(--divider-color); border-radius:var(--ha-radius-lg);
      padding:var(--ha-space-4); margin-top:var(--ha-space-3); background:var(--card-background-color); --ha-tint:transparent; }
    .banner::before { content:""; position:absolute; inset:0; background:var(--ha-tint); opacity:.12; pointer-events:none; }
    .banner > * { position:relative; }
    .banner-title { font-size:var(--ha-font-size-xl); font-weight:500; line-height:1.3; }
    .banner-lede { margin-top:var(--ha-space-2); color:var(--secondary-text-color); }
    .banner-reasons { margin:var(--ha-space-2) 0 0; padding:0; list-style:none; display:grid; gap:6px; }
    .banner-reasons li { display:flex; gap:var(--ha-space-2); }
    .banner-reasons li::before { content:"·"; color:var(--ha-accent,var(--warning-color)); flex:none; line-height:1.6; }
    .banner-fix { margin-top:var(--ha-space-3); color:var(--secondary-text-color); font-size:var(--ha-font-size-s); }
    .banner[data-state="off"], .banner[data-state="quiet"], .banner[data-state="blocked"] { --ha-tint:var(--warning-color); }
    .banner[data-state="ready"] { --ha-tint:var(--success-color); --ha-accent:var(--success-color); }
    .banner[data-state="sending"] { --ha-tint:var(--info-color); --ha-accent:var(--info-color); }
    .banner[data-state="confirmed"] { --ha-tint:var(--success-color); --ha-accent:var(--success-color); }
    .banner[data-state="unconfirmed"], .banner[data-state="awaiting"] { --ha-tint:var(--warning-color); }
    .banner[data-state="doorbell"] { --ha-tint:var(--error-color); border-color:var(--error-color); }
    .banner[data-state="doorbell"] .banner-title { font-size:var(--ha-font-size-3xl); }
    .banner .actions { display:none; } .banner[data-state="doorbell"] .actions { display:flex; }
    #review[data-active="false"] { display:none; }

    @media (max-width:52rem) { .grid { grid-template-columns:1fr; } .wide { grid-column:auto; } .surface { padding:var(--ha-space-3); } }
  </style>
</head>
<body>
  <main>
    <header><div><h1>BESTIUM 월패드</h1><p class="muted">백양산 베스티움 에코포레 · RS485 · <span lang="en">Protocol Debug</span> · 프로토콜 디버그 · <span lang="en">Korean-primary RX monitor</span></p></div><p id="status" class="status" role="status" aria-live="polite">idle · 대기</p></header>
    <nav class="app-tabs" aria-label="화면 전환 · Surfaces"><button id="tab-control" class="ha-tab" type="button" role="tab" aria-selected="true" aria-controls="surface-control">제어 · <span lang="en">Control</span></button><button id="tab-debug" class="ha-tab" type="button" role="tab" aria-selected="false" aria-controls="surface-debug">디버그 · <span lang="en">Debug</span></button></nav>
    <div class="surface" id="surface" data-tab="control">
    <svg aria-hidden="true" width="0" height="0"><symbol id="debug-frame-icon" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"></path></symbol></svg>
    <section class="card wide" aria-labelledby="gate-title" data-surface="control"><h2 id="gate-title">전송 게이트 · <span lang="en">Transmission gate</span></h2><div id="gate-banner" class="banner" data-state="unknown" role="status" aria-live="polite"><p id="gate-banner-title" class="banner-title">상태를 확인하는 중입니다 · <span lang="en">Checking status</span></p><p id="gate-banner-lede" class="banner-lede"></p><ul id="gate-banner-reasons" class="banner-reasons"></ul><p id="gate-banner-fix" class="banner-fix"></p><div class="actions"><button id="doorbell-dismiss" class="secondary" type="button">알람 지우기 · <span lang="en">Clear alarm</span></button></div></div><p id="trust-message" class="muted">미리보기는 연결 없이 가능합니다. <span lang="en">Preview only; live commit requires an authorized, connected, quiet current transport.</span></p><div class="actions" aria-label="Capture actions · 캡처 동작"><button id="capture-start" type="button" disabled>캡처 시작 · <span lang="en">Start capture</span></button><button id="capture-stop" class="secondary" type="button" disabled>중지 · <span lang="en">Stop</span></button><button id="capture-download" class="secondary" type="button" disabled>다운로드 · <span lang="en">Download</span></button></div></section><section id="review" data-surface="control" data-active="false" class="card wide" aria-labelledby="review-title" aria-busy="false"><h2 id="review-title">검토 및 확인 · <span lang="en">Review and confirmation</span></h2><p id="review-phase">idle · 대기</p><p id="review-summary" class="muted">검토된 동작 없음 · <span lang="en">No reviewed action</span></p><p id="review-frames" class="muted"></p><div class="actions"><button id="review-cancel" class="secondary" type="button">취소 · <span lang="en">Cancel</span></button><label for="confirmation-phrase">후보 확인 문구 · <span lang="en">Typed confirmation</span><input id="confirmation-phrase" autocomplete="off" spellcheck="false" placeholder="I UNDERSTAND THIS IS AN INFERRED CANDIDATE" aria-invalid="false" aria-describedby="confirmation-help"></label><p id="confirmation-help" class="muted">후보 프레임과 evidence를 검토한 뒤 정확한 문구를 입력하세요. <span lang="en">Review the exact candidate frame before confirming.</span></p><button id="issue-challenge" class="warning" type="button" disabled>후보 챌린지 발급 · <span lang="en">Issue challenge</span></button><button id="review-commit" type="button" disabled>검토한 동작 전송 · <span lang="en">Transmit reviewed action</span></button></div><p id="countdown" class="age"></p><p id="outcome" role="status" aria-live="polite"></p><p id="tx-queue" class="muted" aria-live="polite">전송 대기 없음</p><p id="alert" role="alert" aria-live="assertive"></p><div id="tx-unlock" class="unlock" data-active="false"><p class="muted">전송 결과를 알 수 없어 잠갔습니다. 기기 상태를 직접 확인한 뒤 해제하세요. <span lang="en">Locked because the write outcome is unknown; check the device, then release.</span></p><button id="tx-unlock-ack" class="secondary" type="button">확인했습니다 · 잠금 해제</button></div></section>
    <section class="grid" aria-label="Protocol debug monitor · 프로토콜 디버그 모니터">
      <article class="card" data-surface="control"><div class="card-head"><h2>조명 · <span lang="en">Lights</span></h2><span class="muted">관측 확인 3개 · 상태 프레임 0x19</span></div><div class="tiles"><div class="tile"><span class="tile-icon" style="--tile-color:var(--state-light-active-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z"></path></svg></span><div class="tile-info"><strong>조명 1</strong><span id="light-state-1">unknown · stale</span></div><div class="seg" role="group" aria-label="조명 1 제어"><button id="light-1-on" type="button" aria-label="조명 1 켜기 · Light 1 ON">켜기 · <span lang="en">ON</span></button><button id="light-1-off" type="button" aria-label="조명 1 끄기 · Light 1 OFF">끄기 · <span lang="en">OFF</span></button></div></div><div class="tile"><span class="tile-icon" style="--tile-color:var(--state-light-active-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z"></path></svg></span><div class="tile-info"><strong>조명 2</strong><span id="light-state-2">unknown · stale</span></div><div class="seg" role="group" aria-label="조명 2 제어"><button id="light-2-on" type="button" aria-label="조명 2 켜기 · Light 2 ON">켜기 · <span lang="en">ON</span></button><button id="light-2-off" type="button" aria-label="조명 2 끄기 · Light 2 OFF">끄기 · <span lang="en">OFF</span></button></div></div><div class="tile"><span class="tile-icon" style="--tile-color:var(--state-light-active-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z"></path></svg></span><div class="tile-info"><strong>조명 3</strong><span id="light-state-3">unknown · stale</span></div><div class="seg" role="group" aria-label="조명 3 제어"><button id="light-3-on" type="button" aria-label="조명 3 켜기 · Light 3 ON">켜기 · <span lang="en">ON</span></button><button id="light-3-off" type="button" aria-label="조명 3 끄기 · Light 3 OFF">끄기 · <span lang="en">OFF</span></button></div></div></div></article>
      <article class="card" data-surface="control"><div class="card-head"><h2>가스 · <span lang="en">Gas</span></h2><span class="muted">0x1b · 밸브 · 닫기 전용 · 관측 확인</span></div><div class="tile"><span class="tile-icon" style="--tile-color:var(--state-climate-heat-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16"></path></svg></span><div class="tile-info"><strong>가스 상태 · <span lang="en">Gas state</span></strong><span id="gas-state">unknown · stale</span></div></div><div class="actions"><button id="gas-close" type="button">가스 닫기 · <span lang="en">Gas close</span></button></div><p class="muted">가스 열기 제어는 없습니다. 밸브를 여는 프레임은 관측하지 못했고 원격으로 열 계획도 없습니다. <span lang="en">Gas open is monitored but never offered.</span></p></article>
      <article class="card wide" data-surface="control"><div class="card-head"><h2>난방 · <span lang="en">Heating</span></h2><span class="muted">5–40°C · 네 구역 모두 관측 확인 · <span lang="en">Every zone was driven from this page on the live bus.</span></span></div><p class="group-label"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z"></path></svg>관측 확인 — 월패드가 보내는 프레임과 같고, 이 페이지에서 보내 실제로 난방이 움직이는 것을 확인했습니다</p><div class="zones"><div class="zone"><div class="zone-head"><span class="tile-icon" style="--tile-color:var(--state-climate-heat-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z"></path></svg></span><div class="tile-info"><strong>Zone 1</strong><span>0x18 · 존 1</span></div><span class="badge ok"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z"></path></svg>프레임 확인</span></div><div class="zone-temp"><span id="heating-current-1" class="temp-value">—</span><span class="temp-unit">°C</span><span class="temp-label">현재</span></div><div class="zone-target"><span class="temp-label">목표</span><strong id="heating-target-1">—</strong><span class="temp-label">°C</span><label class="zone-set" for="heat-temp-1"><span class="sr">Zone 1 설정 온도 · <span lang="en">Zone 1 temperature</span></span><input id="heat-temp-1" type="number" min="5" max="40" step="1" value="20" required aria-invalid="false" aria-describedby="heat-temp-1-error" inputmode="numeric"><button id="heat-temp-1-send" type="button" aria-label="Zone 1 설정 온도 적용 · Set Zone 1 temperature">설정</button></label></div><p id="heat-temp-1-error" class="error" aria-live="polite"></p><div class="seg" role="group" aria-label="Zone 1 난방"><button id="heat-zone-1-on" type="button" aria-label="1번 난방 켜기 · Zone 1 ON">켜기 · <span lang="en">ON</span></button><button id="heat-zone-1-off" type="button" aria-label="1번 난방 끄기 · Zone 1 OFF">끄기 · <span lang="en">OFF</span></button></div><p id="heat-state-1" class="muted">unknown · stale</p></div></div><p class="group-label"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z"></path></svg>같은 프레임, 같은 근거 — Zone 1과 완전히 같은 형식이며 zone 번호만 다릅니다.</p><div class="zones"><div class="zone"><div class="zone-head"><span class="tile-icon" style="--tile-color:var(--state-climate-heat-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z"></path></svg></span><div class="tile-info"><strong>Zone 2</strong><span>0x18 · 존 2</span></div><span class="badge ok"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z"></path></svg>관측 확인</span></div><div class="zone-temp"><span id="heating-current-2" class="temp-value">—</span><span class="temp-unit">°C</span><span class="temp-label">현재</span></div><div class="zone-target"><span class="temp-label">목표</span><strong id="heating-target-2">—</strong><span class="temp-label">°C</span><label class="zone-set" for="heat-temp-2"><span class="sr">Zone 2 설정 온도 · <span lang="en">Zone 2 temperature</span></span><input id="heat-temp-2" type="number" min="5" max="40" step="1" value="20" required aria-invalid="false" aria-describedby="heat-temp-2-error" inputmode="numeric"><button id="heat-temp-2-send" type="button" aria-label="Zone 2 설정 온도 적용 · Set Zone 2 temperature">설정</button></label></div><p id="heat-temp-2-error" class="error" aria-live="polite"></p><div class="seg" role="group" aria-label="Zone 2 난방"><button id="heat-zone-2-on" type="button" aria-label="2번 난방 켜기 · Zone 2 ON">켜기 · <span lang="en">ON</span></button><button id="heat-zone-2-off" type="button" aria-label="2번 난방 끄기 · Zone 2 OFF">끄기 · <span lang="en">OFF</span></button></div><p id="heat-state-2" class="muted">unknown · stale</p></div><div class="zone"><div class="zone-head"><span class="tile-icon" style="--tile-color:var(--state-climate-heat-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z"></path></svg></span><div class="tile-info"><strong>Zone 3</strong><span>0x18 · 존 3</span></div><span class="badge ok"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z"></path></svg>관측 확인</span></div><div class="zone-temp"><span id="heating-current-3" class="temp-value">—</span><span class="temp-unit">°C</span><span class="temp-label">현재</span></div><div class="zone-target"><span class="temp-label">목표</span><strong id="heating-target-3">—</strong><span class="temp-label">°C</span><label class="zone-set" for="heat-temp-3"><span class="sr">Zone 3 설정 온도 · <span lang="en">Zone 3 temperature</span></span><input id="heat-temp-3" type="number" min="5" max="40" step="1" value="20" required aria-invalid="false" aria-describedby="heat-temp-3-error" inputmode="numeric"><button id="heat-temp-3-send" type="button" aria-label="Zone 3 설정 온도 적용 · Set Zone 3 temperature">설정</button></label></div><p id="heat-temp-3-error" class="error" aria-live="polite"></p><div class="seg" role="group" aria-label="Zone 3 난방"><button id="heat-zone-3-on" type="button" aria-label="3번 난방 켜기 · Zone 3 ON">켜기 · <span lang="en">ON</span></button><button id="heat-zone-3-off" type="button" aria-label="3번 난방 끄기 · Zone 3 OFF">끄기 · <span lang="en">OFF</span></button></div><p id="heat-state-3" class="muted">unknown · stale</p></div><div class="zone"><div class="zone-head"><span class="tile-icon" style="--tile-color:var(--state-climate-heat-color)"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z"></path></svg></span><div class="tile-info"><strong>Zone 4</strong><span>0x18 · 존 4</span></div><span class="badge ok"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z"></path></svg>관측 확인</span></div><div class="zone-temp"><span id="heating-current-4" class="temp-value">—</span><span class="temp-unit">°C</span><span class="temp-label">현재</span></div><div class="zone-target"><span class="temp-label">목표</span><strong id="heating-target-4">—</strong><span class="temp-label">°C</span><label class="zone-set" for="heat-temp-4"><span class="sr">Zone 4 설정 온도 · <span lang="en">Zone 4 temperature</span></span><input id="heat-temp-4" type="number" min="5" max="40" step="1" value="20" required aria-invalid="false" aria-describedby="heat-temp-4-error" inputmode="numeric"><button id="heat-temp-4-send" type="button" aria-label="Zone 4 설정 온도 적용 · Set Zone 4 temperature">설정</button></label></div><p id="heat-temp-4-error" class="error" aria-live="polite"></p><div class="seg" role="group" aria-label="Zone 4 난방"><button id="heat-zone-4-on" type="button" aria-label="4번 난방 켜기 · Zone 4 ON">켜기 · <span lang="en">ON</span></button><button id="heat-zone-4-off" type="button" aria-label="4번 난방 끄기 · Zone 4 OFF">끄기 · <span lang="en">OFF</span></button></div><p id="heat-state-4" class="muted">unknown · stale</p></div></div><div class="actions"><button id="heat-all-off" type="button">전체 난방 끄기 · <span lang="en">All zones OFF</span></button></div><p class="pill block">5–40°C · 네 구역 모두 observed · 보낸 뒤 월패드의 응답에서 요청한 값을 확인할 때까지 다시 보냅니다</p></article>
      <article class="card" data-surface="control"><div class="card-head"><h2>승강기 · <span lang="en">Elevator</span></h2><span class="badge warn"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z"></path></svg>추측 후보</span></div><p class="muted">0x34 · 운행과 호출을 따로 읽습니다. 지하는 B1처럼 표시하고, 차가 멎으면 버스가 층을 0으로 보내므로 그때는 미보고로 둡니다. <span lang="en">Motion and the standing call are decoded separately; the bus reports floor 0 once the car settles.</span></p><div class="kv"><div><small>현재 층 · <span lang="en">current floor</span></small><strong id="elevator-floor">unknown · stale</strong></div><div><small>운행 · <span lang="en">motion</span></small><strong id="elevator-direction">unknown · stale</strong></div><div><small>호출 · <span lang="en">standing call</span></small><strong id="elevator-call">unknown · stale</strong></div></div><div class="seg" role="group" aria-label="승강기 호출"><button id="elevator-up" class="warning" type="button" aria-label="상행 호출 · 레거시가 미지원으로 표시한 값 · Up call, marked unsupported by the legacy">상행 호출 · 미지원 표시</button><button id="elevator-down" class="warning" type="button" aria-label="하행 호출 · 레거시 기본값 · Down call, the legacy default">하행 호출</button></div><p class="pill warn block">월패드의 호출 버튼을 누른 캡처에서 <strong>0x34 설정 명령이 한 개도 나오지 않았고</strong>, 그 순간 다른 어떤 기기도 새 바이트를 내지 않았습니다. 이 프레임은 레거시 설정에서 가져온 추측입니다. 한 번 눌러 위 호출 값이 요청한 방향으로 바뀌는지 보면 판정이 납니다.</p></article>
      <article class="card" data-surface="control"><div class="card-head"><h2>출입구 · <span lang="en">Entrances</span></h2><span class="badge warn"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16"></path></svg>0x7F 매크로</span></div><p class="muted">상태 0x1e · <strong>제어는 문을 여는 0x7F 매크로입니다.</strong> 계열이 달라 보낸 결과를 상태로 대조할 수 없습니다. 세대 줄의 값은 <strong>월패드에서 문열기를 조작한 것을 관측했다는 뜻</strong>이며, 바깥에서 벨을 누른 것과는 무관합니다.</p><div class="monitor"><div class="monitor-row"><strong>세대 현관</strong><span id="household-entrance">세대 현관 · household entrance · unknown / unsafe_candidate</span></div><div class="monitor-row"><strong>공동 현관</strong><span id="common-entrance">공동 현관 · common entrance · unknown / unsafe_candidate</span></div></div><div class="controls"><button id="household-inactive" class="warning" type="button" aria-label="세대 현관문 열기 · 호출이 없을 때 · Open the household door with no call in progress">세대 현관문 열기 · 호출 없음</button><button id="household-ringing" class="warning" type="button" aria-label="세대 현관문 열기 · 초인종이 울리는 중 · Open the household door while the bell is ringing">세대 현관문 열기 · 호출 중</button><button id="communal-ringing" class="warning" type="button" aria-label="공동 현관문 열기 · 호출 중 · Open the communal door while the call is in progress">공동 현관문 열기 · 호출 중</button></div><p class="muted">각 버튼은 <strong>문을 여는 3프레임 시퀀스</strong>를 200 ms 간격으로 보냅니다. 영상 우회 시작 → 도어락 해제 → 우회 종료이고, 어느 우회 헤더를 쓰는지가 호출 상태에 따라 갈립니다. <span lang="en">Each button sends a fixed three-frame macro that opens a door: bypass on, lock release, bypass off, 200 ms apart.</span></p><p class="pill warn block">서버의 0x7F 증적 게이트는 <strong>방금 45초 안에 이 회선에서 바로 이 세 프레임 시퀀스가 오가는 것을 보았을 것</strong>을 요구합니다. 같은 전송 세대여야 하고, 동작 이름과 세 프레임이 바이트까지 일치해야 합니다. 0x7F에는 XOR도 길이 필드도 없어 잘못된 회선에 쓰면 검사할 방법이 없기 때문입니다. 이 버스에서 0x7F는 718.9초 동안 한 개도 관측되지 않았고, 레거시는 서브폰을 <strong>별도 RS485 회선</strong>으로 둡니다. 그 회선이 붙기 전까지 세 버튼은 눌러도 전송되지 않습니다.</p></article>
      <article class="card wide" data-surface="debug"><div class="card-head"><h2>패킷 수집 · <span lang="en">Packet capture</span></h2><span class="muted">수집 제어는 제어 탭의 전송 게이트 카드에 있습니다</span></div><div class="kv"><div><small>수집 시간</small><strong id="capture-elapsed">—</strong></div><div><small>기록</small><strong id="capture-records">—</strong></div><div><small>수신 바이트</small><strong id="capture-bytes">—</strong></div><div><small>저장 파일</small><strong id="capture-bytes-file">—</strong></div></div><p id="capture-filename" class="muted">아직 저장된 파일이 없습니다.</p></article><article class="card" data-surface="debug"><div class="card-head"><h2>조회 전용 · <span lang="en">Query-only</span></h2></div><div class="tiles"><div class="tile"><span class="tile-icon"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13"></path></svg></span><div class="tile-info"><strong>콘센트 · <span lang="en">outlet</span></strong><span id="outlet-query-state">outlet query · unknown / stale</span></div><div class="seg"><button id="outlet-query" type="button">조회 · <span lang="en">Query</span></button></div></div><div class="tile"><span class="tile-icon"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z"></path></svg></span><div class="tile-info"><strong>환기 · <span lang="en">ventilation</span></strong><span id="ventilation-query-state">ventilation query · unknown / stale</span></div><div class="seg"><button id="ventilation-query" type="button">조회 · <span lang="en">Query</span></button></div></div></div><p class="muted">조회 응답만 관측했습니다. 제어 코드는 아직 관측하지 못해 제어 탭에 올리지 않았습니다.</p></article>
      <article class="card" data-surface="debug"><div class="card-head"><h2>미확인 · 모호 프레임 · <span lang="en">Batch / unknown</span></h2></div><p>batch/unknown frames are inspection-only · 배치/미지 프레임은 관찰 전용</p><div class="monitor"><div class="monitor-row"><strong>차량</strong><span id="vehicle-unidentified">차량 미식별 · <span lang="en">vehicle unidentified</span> · monitor only</span></div><div class="monitor-row"><strong>CCTV</strong><p id="cctv-observation">CCTV unknown · stale · CCTV 미확인 · <span lang="en">unknown / stale until a current inspected frame is accepted</span></p></div><div class="monitor-row"><strong>미확인 묶음</strong><span id="unknown-clusters">unknown clusters · unknown / stale</span></div><div class="monitor-row"><strong>모호 묶음</strong><span id="ambiguous-lab">ambiguous clusters · unknown / stale</span></div></div><p class="muted">미확인은 어느 계열인지 정하지 못한 프레임, 모호는 해석이 둘 이상 남은 프레임입니다. 둘 다 제어에 쓰지 않습니다.</p></article>
      <article class="card wide" data-surface="debug"><div class="card-head"><h2>임의 전송 실험실 · <span lang="en">Raw single-burst lab</span></h2><span class="muted">1–256바이트 · 짝수 자리 16진수 · 한 번만 내보냅니다</span></div><p class="alert-line"><svg class="tile-icon-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16"></path></svg>관측되지 않은 바이트를 버스로 내보냅니다. 되돌릴 수 없고, 월패드가 어떻게 반응할지 알 수 없습니다.</p><ol class="steps"><li><span class="step-n">1</span>미리보기 · <span lang="en">preview</span></li><li><span class="step-n">2</span>확인 · <span lang="en">challenge</span></li><li><span class="step-n">3</span>전송 · <span lang="en">commit</span></li></ol><label for="raw-burst">보낼 바이트 · <span lang="en">Single-burst hex (unsafe candidate)</span><input id="raw-burst" type="text" required maxlength="512" spellcheck="false" autocapitalize="off" inputmode="text" aria-invalid="false" aria-describedby="raw-warning raw-error" placeholder="hex, 1–256 bytes"></label><p id="raw-warning" class="muted">current F7 transport unverified · 현재 F7 transport 미검증. Preview → challenge → commit only.</p><p id="raw-error" class="error" aria-live="polite"></p><div class="actions"><button id="raw-preview" class="secondary" type="button">미리보기 · <span lang="en">Preview only</span></button></div></article>
      <article class="card wide" data-surface="debug"><div class="card-head"><h2>수신 프레임 로그 · <span lang="en">Frames and freshness</span></h2><span class="muted">프레임 구조 f7 · 길이 · 01 · 계열 · 데이터 · XOR · ee</span></div><p id="freshness" class="age">unknown · stale · age —</p><p id="idle-timeout" class="age">Idle timeout · idle_timeout_ms: —</p><div class="table-wrap"><table class="frames" aria-label="Recent F7 frames · 최근 F7 프레임"><thead><tr><th>계열</th><th>16진수 <span lang="en">(hex)</span></th><th>해석</th><th>경과</th></tr></thead><tbody id="frame-lab"></tbody></table></div><p id="unknown-lab" class="age"></p></article>
    </section>

    </div>
  </main>
  <script>
    (() => {
      "use strict";
      let csrfToken = ""; let queuedInFlight = 0; let pollTimer = null; let pollDeadlineTimer = null; let pollController = null; let pollEpoch = 0; let polling = false; let pollPromise = null; let pollResolve = null; let pollResolveEpoch = 0; let reviewBusy = false; let captureBusy = false; let mutationLocked = false; let mutationEpoch = 0; let mutationDeadlineTimer = null; let mutationController = null; let capturePhase = null; let phase = "idle"; let reviewedAction = null; let reviewPreview = null; let pendingChallenge = null; let latestStatusPayload = null; let downloadReady = false; let challengeBarrier = Promise.resolve(true); let challengeBarrierPending = false; let cancelInFlight = false; let focusReturn = null; let countdownTimer = null; let reviewEpoch = 0; let requestEpoch = 0; let previewController = null; let challengeController = null; let commitInFlight = false; let txRetryLocked = false; let statusRevision = ""; let statusInvalid = true; let sendResult = null; let sendLabel = ""; let doorbell = null; let doorbellDismissed = ""; const entranceWas = {};
      let appliedPollEpoch = 0; let previewPollEpoch = -1;
      const $ = (id) => document.getElementById(id); const statusText = $("status"); const startButton = $("capture-start"); const stopButton = $("capture-stop"); const review = $("review");
      const phaseLabels = { idle:"idle · 대기", previewing:"previewing · 미리보기 중", reviewed:"reviewed · 검토됨", challenged:"challenged · 챌린지 발급됨", committing:"committing · 전송 중", starting:"starting · 시작 중", running:"running · 실행 중", finalizing:"finalizing · 마무리 중", stopped:"stopped · 중지됨" };
      const actionCatalog = { "light-1-on": () => ({ kind:"light", target:1, state:"on" }), "light-1-off": () => ({ kind:"light", target:1, state:"off" }), "light-2-on": () => ({ kind:"light", target:2, state:"on" }), "light-2-off": () => ({ kind:"light", target:2, state:"off" }), "light-3-on": () => ({ kind:"light", target:3, state:"on" }), "light-3-off": () => ({ kind:"light", target:3, state:"off" }), "gas-close": () => ({ kind:"gas", state:"close" }), "heat-zone-1-on": () => ({ kind:"heat", zone:1, state:"on" }), "heat-zone-1-off": () => ({ kind:"heat", zone:1, state:"off" }), "heat-zone-2-on": () => ({ kind:"heat", zone:2, state:"on" }), "heat-zone-2-off": () => ({ kind:"heat", zone:2, state:"off" }), "heat-zone-3-on": () => ({ kind:"heat", zone:3, state:"on" }), "heat-zone-3-off": () => ({ kind:"heat", zone:3, state:"off" }), "heat-zone-4-on": () => ({ kind:"heat", zone:4, state:"on" }), "heat-zone-4-off": () => ({ kind:"heat", zone:4, state:"off" }), "heat-all-off": () => ({ kind:"heat", target:"all", state:"off" }), "elevator-up": () => ({ kind:"elevator", direction:"up" }), "elevator-down": () => ({ kind:"elevator", direction:"down" }), "outlet-query": () => ({ kind:"outlet", action:"query" }), "ventilation-query": () => ({ kind:"ventilation", action:"query" }), "household-inactive": () => ({ kind:"entrance", target:"household", state:"inactive" }), "household-ringing": () => ({ kind:"entrance", target:"household", state:"ringing" }), "communal-ringing": () => ({ kind:"entrance", target:"communal", state:"ringing" }) };
      const OFF_CONSEQUENCES = [
        "EW11 게이트웨이로 TCP 소켓을 열지 않아 보낼 곳이 없습니다",
        "기기 주소를 관측하지 못해 보낼 프레임을 만들 수 없습니다",
        "버스가 비어 있는지 알 수 없어 충돌을 피할 수 없습니다",
        "보낸 뒤 요청한 상태를 확인할 방법이 없습니다",
      ];
      /* The server's readiness reasons reach the page verbatim. The banner already words the
      status flags as "한국어 (english)", so these follow it rather than inventing a second style.
      An unmapped reason passes through unchanged: a raw English string beats a missing one. */
      const REASON_KO = {
        "master TX disabled": "전송이 꺼져 있습니다",
        "speculative TX disabled": "추측 후보 전송이 꺼져 있습니다",
        "unsafe TX disabled": "위험 후보 전송이 꺼져 있습니다",
        "authorized user mismatch": "전송 권한이 없습니다",
        "gateway link is not up": "게이트웨이에 연결되지 않았습니다",
        "one in-flight write only": "다른 전송이 진행 중입니다",
        "transport generation quarantined": "직전 연결 세대가 격리되었습니다",
        "transport not connected": "통신 경로가 연결되어 있지 않습니다",
        "capture append pending": "수집 데이터 저장이 진행 중입니다",
        "no current-generation valid RX frame": "현재 연결에서 받은 유효 프레임이 없습니다",
        "no current valid RX frame": "아직 유효한 수신 프레임이 없습니다",
        "current RX frame stale": "마지막 수신 프레임이 오래되었습니다",
        "line busy: quiet interval not met": "버스가 사용 중입니다",
        "TX cooldown active": "연속 전송 대기 시간이 남아 있습니다",
        "empty action frame": "보낼 프레임이 만들어지지 않았습니다",
        "recognized frame boundary collision": "다른 프레임 경계와 충돌합니다",
        "current-generation 7F compatibility proof required": "현재 연결에서 0x7F 호환 증적을 아직 관측하지 못했습니다",
      };
      const reasonKo = (reason) => { const text = String(reason ?? "").trim(); if (!text) return ""; const known = REASON_KO[text]; return known ? known + " (" + text + ")" : text; };
      const reasonsKo = (reasons) => Array.isArray(reasons) && reasons.length ? reasons.map(reasonKo).filter(Boolean).join(", ") : "";
      const gateBlockers = (tx) => {
        const out = [];
        if (statusInvalid) out.push("상태를 아직 확인하지 못했습니다 (status unavailable)");
        if (tx.enabled !== true) out.push("전송이 꺼져 있습니다 (TX disabled)");
        if (tx.authorized !== true) out.push("전송 권한이 없습니다 (authorized user mismatch)");
        if (tx.connected !== true) out.push("통신 경로가 연결되어 있지 않습니다 (transport not connected)");
        if (tx.quarantined === true) out.push("직전 연결 세대가 격리되었습니다 (transport generation quarantined)");
        if (tx.pendingAppend === true) out.push("수집 데이터 저장이 진행 중입니다 (capture append pending)");
        if (tx.currentGenerationRx !== true) out.push("현재 연결에서 받은 유효 프레임이 없습니다 (no current-generation valid RX frame)");
        if (tx.fresh !== true) out.push("마지막 수신 프레임이 오래되었습니다 (current RX frame stale)");
        /* A busy line is not a blocker: the server waits for the window, which opens in
        about 20 ms. Listing it here made the banner announce a wait as a refusal. */
        if (tx.inFlight === true) out.push("다른 전송이 진행 중입니다 (one in-flight write only)");
        return out;
      };
      let gateBannerSignature = null;
      const renderGateBanner = (tx, runtimePhase) => {
        const blockers = gateBlockers(tx);
        const state = doorbell !== null ? "doorbell"
          : queuedInFlight > 0 ? "sending"
          : reviewedAction && reviewPreview && reviewPreview.evidence !== "observed" ? "awaiting"
          : sendResult !== null ? sendResult
          : runtimePhase !== "running" ? "off"
          : blockers.length === 0 ? "ready"
          : blockers.length === 1 && tx.fresh !== true ? "quiet"
          : "blocked";
        const lines = state === "off" ? OFF_CONSEQUENCES : state === "blocked" ? blockers : [];
        const signature = state + "\u0000" + sendLabel + "\u0000" + (doorbell ? doorbell.key : "") + "\u0000" + lines.join("\u0000");
        if (signature === gateBannerSignature) return;
        gateBannerSignature = signature;
        $("gate-banner")?.setAttribute("data-state", state);
        setText("gate-banner-title",
          state === "doorbell" ? "현관 호출"
          : state === "sending" ? "보내고 응답을 기다리고 있습니다"
          : state === "awaiting" ? "확인이 필요합니다"
          : state === "confirmed" ? "요청한 상태를 확인했습니다"
          : state === "unconfirmed" ? "소켓으로 보냈지만 요청한 상태는 관측하지 못했습니다"
          : state === "off" ? "수집이 꺼져 있어 제어할 수 없습니다"
          : state === "quiet" ? "버스가 조용해 송신을 보류합니다"
          : state === "ready" ? "제어 준비됨"
          : "지금은 기기를 제어할 수 없습니다");
        setText("gate-banner-lede",
          state === "doorbell" ? doorbell.which + "에서 호출 프레임을 관측했습니다."
          : state === "sending" ? (sendLabel ? sendLabel + " · 요청한 상태가 관측될 때까지 서버가 지켜봅니다." : "요청한 상태가 관측될 때까지 서버가 지켜봅니다.")
          : state === "awaiting" ? sendLabel + " · 관측으로 확인하지 못한 제어입니다. 확인 문구를 입력해야 보낼 수 있습니다."
          : state === "confirmed" ? sendLabel + " · 상태 프레임으로 확인했습니다."
          : state === "unconfirmed" ? sendLabel + " · 월패드가 반영하지 않았을 수도, 상태 프레임만 못 보았을 수도 있습니다. 실패로 기록하지 않습니다."
          : state === "off" ? "제어 프레임은 관측한 값에서만 만들 수 있습니다. 수집이 꺼진 동안 막혀 있는 것은 다음 네 가지입니다."
          : state === "quiet" ? "수집은 켜져 있습니다. 월패드가 절전 중일 수도, 배선이 끊겼을 수도 있습니다. 지금 보내면 결과를 확인할 수 없어 보내지 않습니다."
          : state === "ready" ? "상태 프레임을 관측하고 있습니다. 전송은 한 번만 나가며 재시도하지 않습니다."
          : "다음 조건이 해소되어야 제어가 열립니다.");
        const list = $("gate-banner-reasons");
        if (list) {
          while (list.firstChild) list.removeChild(list.firstChild);
          for (const line of lines) { const item = document.createElement("li"); item.textContent = line; list.appendChild(item); }
        }
        setText("gate-banner-fix",
          state === "doorbell" ? "열기는 제공하지 않습니다. 문을 여는 프레임은 관측하지 못했습니다."
          : state === "sending" ? "다른 제어는 계속 쓸 수 있습니다. 같은 제어를 다시 누르면 마지막 요청만 남습니다."
          : state === "confirmed" || state === "unconfirmed" ? "전송은 한 번만 나갔고 재시도하지 않았습니다."
          : state === "off" ? "아래 캡처 시작을 누르면 수집 시작하고 제어 열기가 진행됩니다. 관측된 기기부터 제어가 열립니다."
          : state === "awaiting" ? "아래 확인 문구를 정확히 입력하고 후보 챌린지 발급을 누르세요."
          : state === "quiet" ? "월패드를 한 번 조작하면 프레임을 관측할 수 있습니다."
          : state === "ready" ? ""
          : "");
      };
      const onOff = (state) => state === "on" ? "켜기" : state === "off" ? "끄기" : String(state ?? "");
      const sentLabel = (action) => {
        if (!action) return "";
        if (action.kind === "light") return "조명 " + action.target + " · " + onOff(action.state);
        if (action.kind === "gas") return "가스 · 닫기";
        if (action.kind === "heat") return "Zone " + action.zone + (action.temperatureC !== undefined ? " · 목표 " + action.temperatureC + "°C" : " · " + onOff(action.state));
        if (action.kind === "elevator") return "승강기 · " + (action.direction === "up" ? "상행" : "하행") + " 호출";
        if (action.kind === "entrance") return (action.target === "household" ? "세대" : "공동") + " 현관 열기";
        if (action.kind === "raw") return "임의 전송 · " + String(action.hex || "").slice(0, 24);
        return readable(action);
      };
      const SERIES = { "19":["조명","조명 상태 프레임 · 채널 1–3"], "18":["난방","난방 상태 프레임 · 존"], "1b":["가스","가스 상태 프레임"],
        "34":["승강기","승강기 상태 프레임 · 층·방향"], "1f":["콘센트","조회 응답 · 해석 없음"], "2b":["환기","조회 응답 · 해석 없음"],
        "2a":["모호","해석이 둘 이상"], "1e":["출입구","출입구 상태 프레임"] };
      const seriesOf = (hex) => { const s = String(hex || "").toLowerCase(); const code = s.slice(6, 8);
        const known = SERIES[code]; return { code, name: known ? known[0] + " 0x" + code : "미확인" + (code ? " 0x" + code : ""), decoded: known ? known[1] : "어느 계열인지 정하지 못했습니다" }; };
      const nf = (value) => Number.isFinite(value) ? Number(value).toLocaleString("ko-KR") : "—";
      const setText = (id, value) => { const node = $(id); if (node) node.textContent = String(value); }; const setGate = (id, yes, good, bad) => { const node = $(id); if (!node) return; node.textContent = yes ? good : bad; node.classList.toggle("yes", yes); node.classList.toggle("no", !yes); };
      const txState = () => window.__bestiumTx || {}; const validRevision = (value) => (typeof value === "string" && value.length > 0 && value.length <= 256) || Number.isSafeInteger(value); const previewRevision = (preview) => preview?.readinessRevision ?? preview?.readiness?.readinessRevision; const readyForAction = (preview) => { const tx = txState(); const observedPreview = preview?.evidence === "observed"; const previewReady = preview?.ready !== false && !(preview?.readiness && preview.readiness.ready === false); /* The readiness revision hashes rxByteEpoch, readEpoch, validFrameEpoch and tailHash, so on a live bus it moves between the preview and the next poll. Comparing it here left every candidate control permanently disabled. The server re-evaluates each gate on the live request and names its own refusal; what stays client-side is the fail-closed status check and the gates the banner shows. */ if (!preview || statusInvalid || !previewReady || tx.enabled !== true || tx.authorized !== true || tx.connected !== true || tx.inFlight === true || tx.quarantined === true || tx.pendingAppend === true || tx.currentGenerationRx !== true || tx.fresh !== true) return false; if (preview.evidence === "inferred_candidate" && tx.speculativeEnabled !== true) return false; if (preview.evidence === "unsafe_candidate" && tx.unsafeEnabled !== true) return false; if (preview.evidence === "unsafe_candidate" && preview.action?.kind === "entrance" && tx.sevenFProof !== true) return false; return true; };
      /* A pending observation watches one light. Locking every send control made the whole page wait out the observation window, and on a live bus that wait is the delay the operator feels. Only the watched light is leased; the review and capture controls stay page-wide because they are single-instance. */
      const sendControlIds = () => Object.keys(actionCatalog).concat([1,2,3,4].map((zone) => "heat-temp-" + zone + "-send"), ["raw-preview"]);
      const setDownloadControl = () => { const download = $("capture-download"); if (download) download.disabled = !downloadReady; };
      const showReview = () => $("review")?.setAttribute("data-active", reviewedAction && reviewPreview && reviewPreview.evidence !== "observed" ? "true" : "false");
      const setReviewBusy = (value) => { reviewBusy = value; showReview(); review?.setAttribute("aria-busy", value ? "true" : "false"); const issue = $("issue-challenge"); const commit = $("review-commit"); const cancel = $("review-cancel"); const reviewLocked = value || captureBusy || mutationLocked || txRetryLocked; if (cancel) cancel.disabled = captureBusy || mutationLocked || txRetryLocked || cancelInFlight || commitInFlight || phase === "committing"; if (issue) issue.disabled = reviewLocked || cancelInFlight || !reviewedAction || !reviewPreview || reviewPreview.evidence === "observed" || !readyForAction(reviewPreview); if (commit) commit.disabled = reviewLocked || cancelInFlight || !reviewedAction || (reviewPreview && reviewPreview.evidence !== "observed" && !pendingChallenge) || !readyForAction(reviewPreview); setCaptureControls(); };
      const validCapturePhase = (value) => value === "starting" || value === "running" || value === "finalizing" || value === "stopped";
      const setCaptureControls = () => { const unknown = !validCapturePhase(capturePhase); const locked = unknown || captureBusy || mutationLocked || txRetryLocked; if (startButton) startButton.disabled = locked || capturePhase !== "stopped"; if (stopButton) stopButton.disabled = locked || capturePhase !== "running"; setDownloadControl(); }; setCaptureControls();
      const setCaptureBusy = (value) => { captureBusy = value; startButton?.setAttribute("aria-busy", value ? "true" : "false"); stopButton?.setAttribute("aria-busy", value ? "true" : "false"); setCaptureControls(); setReviewBusy(reviewBusy); };
      const makeController = () => typeof AbortController === "function" ? new AbortController() : { signal: undefined, abort() {} };
      const readable = (action) => action ? [action.kind, action.target || action.zone || action.direction || action.action || "", action.state || (action.temperatureC !== undefined ? action.temperatureC + "°C" : "")].filter(Boolean).join(" · ") : "";
      const describePreview = (action, preview) => { const reasons = Array.isArray(preview.reasons) ? " · reasons: " + preview.reasons.join(", ") : ""; setText("review-summary", "검토: " + readable(action) + " · evidence: " + String(preview.evidence || "unknown") + " · transport: " + String(preview.transportEvidence || "observed") + " · readinessRevision: " + String(preview.readinessRevision || preview.readiness?.readinessRevision || "—") + reasons); const frames = Array.isArray(preview.framesHex) ? preview.framesHex : preview.frameHex ? [preview.frameHex] : []; setText("review-frames", "frameHex: " + String(preview.frameHex || "—") + " · framesHex: " + frames.join(", ") + (preview.evidence === "unsafe_candidate" || preview.evidence === "inferred_candidate" ? " · 관측으로 확인하지 않은 제어입니다 · 다른 기기가 반응하거나 아무 반응이 없을 수 있습니다" : "")); };
      const postAction = async (action, mode, extra = {}, signal) => { const body = { ...action, mode, ...extra }; const response = await fetch("./api/action", { method:"POST", headers:{ "content-type":"application/json", "x-csrf-token":csrfToken }, body:JSON.stringify(body), signal }); if (!response.ok) throw new Error("semantic action rejected"); return response.json(); };
      const postCancel = async (id) => { if (!id) return false; const response = await fetch("./api/action", { method:"POST", headers:{ "content-type":"application/json", "x-csrf-token":csrfToken }, body:JSON.stringify({ mode:"cancel", challengeId:id }) }); return response.ok; };
      const lockIndeterminate = (message) => { txRetryLocked = true; pendingChallenge = null; phase = "idle"; setText("review-phase", phaseLabels[phase]); setText("outcome", "indeterminate · " + message + " · device not confirmed"); setText("alert", "reconciliation required · 재확인 필요 · do not retry"); setReviewBusy(false); setCaptureBusy(captureBusy); $("tx-unlock")?.setAttribute("data-active", "true"); };
      /* The lock is right: after a partial write the device state is genuinely unknown.
      What was missing is any way out of it. Only the operator can say they reconciled,
      so this is an acknowledgement, never an automatic clear on reconnect. */
      const clearIndeterminate = () => { txRetryLocked = false; $("tx-unlock")?.setAttribute("data-active", "false"); setText("outcome", "잠금을 해제했습니다 · 기기 상태를 직접 확인한 뒤 다시 시도하세요"); setText("alert", ""); clearReviewState(); setReviewBusy(false); setCaptureControls(); void poll(true); }; const lockMutation = (message) => { mutationLocked = true; mutationEpoch += 1; if (mutationDeadlineTimer !== null) { clearTimeout(mutationDeadlineTimer); mutationDeadlineTimer = null; } mutationController = null; setCaptureBusy(false); setText("outcome", "indeterminate · " + message + " · device not confirmed"); setText("alert", "mutation indeterminate · status reconciliation required · 재확인 필요 · do not retry"); void poll(true); };
      const cancelChallenge = async (id) => { try { const ok = await postCancel(id); if (!ok) { lockIndeterminate("challenge cancellation failed"); return false; } return true; } catch { lockIndeterminate("challenge cancellation unavailable"); return false; } };
      const clearPoll = () => { if (pollResolve) { const resolve = pollResolve; pollResolve = null; pollPromise = null; pollResolveEpoch = 0; resolve(false); } pollEpoch += 1; if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; } if (pollDeadlineTimer !== null) { clearTimeout(pollDeadlineTimer); pollDeadlineTimer = null; } if (pollController) { pollController.abort(); pollController = null; } polling = false; };
      const clearReviewState = () => { reviewEpoch += 1; requestEpoch += 1; if (countdownTimer !== null) { clearTimeout(countdownTimer); countdownTimer = null; } if (previewController) previewController.abort(); if (challengeController) challengeController.abort(); reviewedAction = null; reviewPreview = null; previewPollEpoch = -1; pendingChallenge = null; $("confirmation-phrase").value = ""; $("confirmation-phrase").setAttribute("aria-invalid", "false"); setText("review-frames", ""); setText("review-summary", "검토된 동작 없음 · No reviewed action"); };
      const cancelReview = async () => { if (captureBusy || mutationLocked || cancelInFlight || commitInFlight || phase === "committing") return; cancelInFlight = true; try { const barrier = challengeBarrier; const waitingForIssue = challengeBarrierPending; const id = pendingChallenge?.id; clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]); setText("countdown", ""); if (waitingForIssue) { setText("outcome", "Canceling challenge · 챌린지 취소 중"); setReviewBusy(true); const canceled = await barrier; if (canceled && !txRetryLocked) setText("outcome", "Challenge canceled · 챌린지 취소됨"); if (!txRetryLocked) setReviewBusy(false); } else if (id) { setText("outcome", "Canceling challenge · 챌린지 취소 중"); challengeBarrierPending = true; challengeBarrier = cancelChallenge(id); setReviewBusy(true); const canceled = await challengeBarrier; challengeBarrierPending = false; if (canceled && !txRetryLocked) { setText("outcome", "Challenge canceled · 챌린지 취소됨"); setReviewBusy(false); } } else { if (!txRetryLocked) setText("outcome", "Review canceled · 검토 취소됨"); setReviewBusy(false); } focusReturn?.focus?.(); } finally { cancelInFlight = false; setReviewBusy(reviewBusy); } };
      const showCandidateExpiry = () => { if (!pendingChallenge) return; const remaining = Math.max(0, Number(pendingChallenge.expiresAtMs || 0) - Date.now()); setText("countdown", remaining > 0 ? "challenge expires in " + Math.ceil(remaining / 1000) + "s · 만료까지 " + Math.ceil(remaining / 1000) + "초" : "challenge expired · 챌린지 만료"); if (remaining <= 0) { pendingChallenge = null; phase = "reviewed"; setText("review-phase", phaseLabels[phase]); setText("alert", "challenge expired · 챌린지 만료"); setReviewBusy(false); return; } countdownTimer = window.setTimeout(showCandidateExpiry, 500); };
      const beginPreview = async (action, trigger) => { if (reviewBusy || captureBusy || txRetryLocked) return; clearReviewState(); const epoch = ++reviewEpoch; focusReturn = trigger; phase = "previewing"; setText("review-phase", phaseLabels[phase]); setReviewBusy(true); previewController = makeController(); try { const preview = await postAction(action, "preview", {}, previewController.signal); if (epoch !== reviewEpoch) return; reviewedAction = action; reviewPreview = { ...preview, action }; previewPollEpoch = pollEpoch; phase = "reviewed"; setText("review-phase", phaseLabels[phase]); describePreview(action, preview); setText("outcome", "Preview only · 미리보기만 수행됨"); setReviewBusy(false); } catch { if (epoch !== reviewEpoch) return; clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]); setText("alert", "Preview rejected · 미리보기 거부"); setReviewBusy(false); } };
      const issueChallenge = async () => {
        if (reviewBusy || captureBusy || mutationLocked || cancelInFlight || pendingChallenge || txRetryLocked || !reviewedAction || !reviewPreview || reviewPreview.evidence === "observed") return;
        const phrase = String($("confirmation-phrase").value || "");
        if (phrase !== "I UNDERSTAND THIS IS AN INFERRED CANDIDATE") {
          $("confirmation-phrase").setAttribute("aria-invalid", "true");
          setText("alert", "후보 확인 문구를 정확히 입력하세요 · Type the exact confirmation phrase");
          $("confirmation-phrase").focus();
          return;
        }
        const epoch = ++requestEpoch;
        let resolveBarrier;
        challengeBarrierPending = true;
        challengeBarrier = new Promise((resolve) => { resolveBarrier = resolve; });
        const finishBarrier = (ok) => { challengeBarrierPending = false; resolveBarrier(ok); };
        setReviewBusy(true);
        setText("outcome", "Issuing challenge · 챌린지 발급 중");
        challengeController = makeController();
        try {
          const issued = await postAction(reviewedAction, "challenge", { confirmationPhrase:phrase, schedule:"immediate" }, challengeController.signal);
          if (epoch !== requestEpoch) {
            const canceled = typeof issued?.id === "string" ? await cancelChallenge(issued.id) : false;
            finishBarrier(canceled);
            if (!canceled) lockIndeterminate("late challenge cancellation failed");
            return;
          }
          const issueCompletedAtMs = Date.now();
          const validId = typeof issued?.id === "string" && /^[A-Za-z0-9_-]{32}$/.test(issued.id);
          const validExpiry = Number.isSafeInteger(issued?.expiresAtMs)
            && issued.expiresAtMs > issueCompletedAtMs
            && issued.expiresAtMs <= issueCompletedAtMs + 30_000;
          const revisionMatches = validRevision(issued?.readinessRevision)
            && String(issued.readinessRevision) === String(previewRevision(reviewPreview))
            && String(issued.readinessRevision) === String(statusRevision);
          if (!validId || !validExpiry || !revisionMatches) {
            if (validId) void cancelChallenge(issued.id);
            finishBarrier(false);
            lockIndeterminate(validId && !revisionMatches ? "challenge readiness changed" : "challenge response invalid");
            return;
          }
          pendingChallenge = issued;
          setText("outcome", "Challenge issued · 챌린지 발급됨");
          phase = "challenged";
          setText("review-phase", phaseLabels[phase]);
          setText("review-frames", "frameHex: " + String(issued.frameHex || "—") + " · framesHex: " + (issued.framesHex || []).join(", ") + " · inferred_candidate / unverified · readinessRevision: " + String(issued.readinessRevision));
          finishBarrier(true);
          showCandidateExpiry();
          setReviewBusy(false);
        } catch {
          finishBarrier(false);
          lockIndeterminate(epoch === requestEpoch ? "challenge issuance failed; state unknown" : "challenge request aborted before issuance");
        }
      };
      const CANDIDATE_PHRASE = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
      const commitObserved = async (action, challengeId) => {
        phase = "committing"; setText("review-phase", phaseLabels[phase]);
        commitInFlight = true; setReviewBusy(true);
        try {
          const result = await postAction(action, "commit", challengeId ? { challengeId, confirmationPhrase: CANDIDATE_PHRASE, schedule: "immediate" } : { schedule: "immediate" });
          if (result.outcome === "partial_indeterminate") {
            txRetryLocked = true;
            const quarantine = result.quarantined === true ? "true" : result.quarantined === false ? "false" : "unknown/unavailable";
            setText("outcome", "partial_indeterminate · framesWritten: " + String(result.framesWritten ?? 0) + " · quarantined: " + quarantine + " · reconciliation required · do not retry");
            setText("alert", "partial_indeterminate · reconciliation required · 재확인 필요 · do not retry");
            setCaptureBusy(captureBusy);
            phase = "reviewed"; setText("review-phase", phaseLabels[phase]);
          } else if (result.outcome === "confirmed") {
            // The server watched the addressed device reach the value that was asked for,
            // in an observation stamped after the write.
            setText("outcome", "확인됨 · " + sendLabel + " · 전송 " + String(result.attempts ?? 1) + "회");
            setText("alert", "");
            clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          } else if (result.outcome === "superseded") {
            setText("outcome", "대체됨 · 같은 제어에 더 나중 요청이 들어와 이 요청은 보내지 않았습니다");
            setText("alert", "");
            clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          } else if (result.outcome === "unconfirmed") {
            setText("outcome", "미확인 · " + String(result.attempts ?? 1) + "회 보냈으나 요청한 상태를 관측하지 못했습니다");
            setText("alert", "미확인 · 기기 상태를 직접 확인하세요");
            clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          } else if (result.outcome === "socket_written_unconfirmed") {
            // Only the entrance macro and raw reach this: they have no reply on this line,
            // so the socket write is the whole of what can be reported.
            setText("outcome", "소켓 전송됨 · 이 회선에는 확인할 응답이 없습니다");
            clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          } else {
            const why = reasonsKo(result.reasons) || reasonKo(result.reason) || String(result.outcome || "rejected");
            setText("outcome", "보내지 못했습니다 · " + why);
            setText("alert", "전송 거부 · " + why);
            clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          }
        } catch {
          txRetryLocked = true;
          setText("outcome", "indeterminate · socket result unknown; device not confirmed");
          setText("alert", "indeterminate · status/journal reconciliation required · 상태/저널 재확인 필요");
          setCaptureBusy(captureBusy);
          void poll(true);
        } finally {
          commitInFlight = false; setReviewBusy(false);
        }
      };
      /* Mirrors intentKey on the server: these are the controls the send queue owns. They
        must not be routed through the review card, because that card is single-instance for
        the whole document and holding it refuses the second press of the same control before
        it can reach the queue that exists to coalesce it. The elevator is queued server-side
        too but stays on the review path, because a candidate needs its challenge issued. */
      const queuedControl = (action) => {
        if (!action || typeof action !== "object") return false;
        if (action.kind === "light") return [1,2,3].includes(action.target) && (action.state === "on" || action.state === "off");
        if (action.kind === "heat") {
          if (action.target === "all") return action.state === "off";
          if (![1,2,3,4].includes(action.zone)) return false;
          return action.temperatureC !== undefined || action.state === "on" || action.state === "off";
        }
        if (action.kind === "gas") return action.state === "close";
        if (action.kind === "outlet" || action.kind === "ventilation") return action.action === "query";
        return false;
      };
      const describeQueuedOutcome = (result, label) => {
        const attempts = String(result.attempts ?? 1);
        const written = String(result.framesWritten ?? 0);
        if (result.outcome === "confirmed") {
          setText("outcome", "확인됨 · " + label + " · 전송 " + attempts + "회" + (result.alreadyHeld === true ? " · 이미 그 상태였습니다" : ""));
          setText("alert", "");
          sendResult = "confirmed";
        } else if (result.outcome === "partial") {
          setText("outcome", "일부만 확인됨 · " + String(result.reason ?? "") + " · 버스로 나간 프레임 " + written + "개");
          setText("alert", "일부만 확인됨 · 기기 상태를 직접 확인하세요");
          sendResult = "unconfirmed";
        } else if (result.outcome === "superseded") {
          setText("outcome", "대체됨 · 같은 제어에 더 나중 요청이 들어와 이 요청은 보내지 않았습니다");
          setText("alert", "");
          sendResult = null;
        } else if (result.outcome === "unconfirmed") {
          setText("outcome", "미확인 · " + attempts + "회 시도, 버스로 나간 프레임 " + written + "개 · 요청한 상태를 관측하지 못했습니다");
          setText("alert", "미확인 · 기기 상태를 직접 확인하세요");
          sendResult = "unconfirmed";
        } else {
          const why = reasonsKo(result.reasons) || reasonKo(result.reason) || String(result.outcome || "rejected");
          setText("outcome", "보내지 못했습니다 · " + why);
          setText("alert", "전송 거부 · " + why);
          sendResult = "unconfirmed";
        }
        if (latestStatusPayload) draw(latestStatusPayload);
      };
      const commitQueued = async (action, trigger) => {
        focusReturn = trigger;
        sendResult = null;
        const label = sentLabel(action);
        sendLabel = label;
        queuedInFlight += 1;
        setText("outcome", "보내는 중 · " + label);
        setText("alert", "");
        if (latestStatusPayload) draw(latestStatusPayload);
        try {
          describeQueuedOutcome(await postAction(action, "commit", { schedule: "immediate" }), label);
        } catch {
          txRetryLocked = true;
          setText("outcome", "indeterminate · socket result unknown; device not confirmed");
          setText("alert", "indeterminate · status/journal reconciliation required · 상태/저널 재확인 필요");
          setCaptureBusy(captureBusy);
          void poll(true);
        } finally {
          queuedInFlight -= 1;
          if (latestStatusPayload) draw(latestStatusPayload);
        }
      };
      const oneTapSend = async (action, trigger) => {
        // A tap that does nothing and says nothing is what the operator read as a dead
        // button. Every refusal names itself now.
        const queued = queuedControl(action);
        const blocked = txRetryLocked ? "이전 전송이 미확정으로 끝나 잠겨 있습니다 · 잠금 해제를 누른 뒤 다시 시도하세요"
          : mutationLocked ? "설정 변경이 진행 중입니다"
          : captureBusy ? "캡처 조작이 진행 중입니다"
          : !queued && (reviewBusy || commitInFlight || cancelInFlight) ? "직전 요청을 아직 처리하고 있습니다"
          : "";
        if (blocked) { setText("outcome", "보내지 못했습니다 · " + blocked); setText("alert", blocked); return; }
        // Fail closed: if the last status could not be trusted, do not put a frame on the bus.
        if (statusInvalid) { setText("outcome", "보내지 못했습니다 · 상태를 아직 확인하지 못했습니다"); setText("alert", "상태 확인 실패 · 재확인 필요"); return; }
        if (queued) { await commitQueued(action, trigger); return; }
        // Fail closed: if the last status could not be trusted, do not put a frame on the bus.
        if (statusInvalid) { setText("outcome", "보내지 못했습니다 · 상태를 아직 확인하지 못했습니다"); setText("alert", "상태 확인 실패 · 재확인 필요"); return; }
        sendResult = null;
        sendLabel = sentLabel(action);
        clearReviewState();
        const epoch = ++reviewEpoch;
        focusReturn = trigger;
        phase = "previewing"; setText("review-phase", phaseLabels[phase]);
        setReviewBusy(true);
        previewController = makeController();
        let preview;
        try {
          preview = await postAction(action, "preview", {}, previewController.signal);
        } catch {
          if (epoch !== reviewEpoch) return;
          clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          setText("alert", "전송 거부 · Preview rejected"); setReviewBusy(false); return;
        }
        if (epoch !== reviewEpoch) return;
        reviewedAction = action;
        reviewPreview = { ...preview, action };
        previewPollEpoch = pollEpoch;
        describePreview(action, preview);
        if (preview.ready === false) {
          const why = reasonsKo(preview.reasons) || "준비되지 않음";
          setText("outcome", "보내지 못했습니다 · " + why);
          clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          setReviewBusy(false); return;
        }
        setReviewBusy(false);
        if (preview.evidence === "observed") { await commitObserved(action); return; }
        // A candidate still needs the server's confirmation phrase. One activation supplies
        // it, so the operator taps once and the page narrates the rest.
        let challenge;
        try {
          challenge = await postAction(action, "challenge", { confirmationPhrase: CANDIDATE_PHRASE, schedule: "immediate" });
        } catch {
          setText("outcome", "보내지 못했습니다 · 후보 확인을 발급하지 못했습니다");
          setText("alert", "전송 거부 · 후보 확인 실패");
          clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          return;
        }
        if (!challenge || typeof challenge.id !== "string") {
          setText("outcome", "보내지 못했습니다 · " + (reasonKo(challenge?.reason) || "후보 확인을 발급하지 못했습니다"));
          clearReviewState(); phase = "idle"; setText("review-phase", phaseLabels[phase]);
          return;
        }
        await commitObserved(action, challenge.id);
      };
      const commitReviewed = async () => {
        if (reviewBusy || captureBusy || mutationLocked || cancelInFlight || txRetryLocked || !reviewedAction || !reviewPreview || !readyForAction(reviewPreview) || (reviewPreview.evidence !== "observed" && !pendingChallenge)) return;
        phase = "committing";
        setText("review-phase", phaseLabels[phase]);
        commitInFlight = true;
        setReviewBusy(true);
        const challengeId = pendingChallenge?.id;
        pendingChallenge = null;
        try {
          const extra = reviewPreview.evidence === "observed" ? { schedule:"immediate" } : { challengeId, confirmationPhrase:String($("confirmation-phrase").value || ""), schedule:"immediate" };
          const result = await postAction(reviewedAction, "commit", extra);
          if (result.outcome === "partial_indeterminate") {
            txRetryLocked = true;
            const quarantine = result.quarantined === true ? "true" : result.quarantined === false ? "false" : "unknown/unavailable";
            setText("outcome", "partial_indeterminate · framesWritten: " + String(result.framesWritten ?? 0) + " · quarantined: " + quarantine + " · reconciliation required · do not retry");
            setText("alert", "partial_indeterminate · reconciliation required · 재확인 필요 · do not retry");
            setCaptureBusy(captureBusy);
            phase = "reviewed";
            setText("review-phase", phaseLabels[phase]);
          } else {
            if (result.outcome === "socket_written_unconfirmed") setText("outcome", "socket_written_unconfirmed · device not confirmed · 장치 확인 안 됨");
            else setText("outcome", "device-not-confirmed · " + String(result.reason || result.outcome || "rejected"));
            clearReviewState();
            phase = "idle";
            setText("review-phase", phaseLabels[phase]);
          }
        } catch {
          txRetryLocked = true;
          setText("outcome", "indeterminate · socket result unknown; device not confirmed");
          setText("alert", "indeterminate · status/journal reconciliation required · 상태/저널 재확인 필요");
          setCaptureBusy(captureBusy);
          void poll(true);
        } finally {
          commitInFlight = false;
          setReviewBusy(false);
        }
      };
      const validateRaw = (focusOnError) => { const input = $("raw-burst"); const value = String(input.value || "").trim(); const valid = /^[0-9a-f]+$/i.test(value) && value.length >= 2 && value.length <= 512 && value.length % 2 === 0; input.setAttribute("aria-invalid", valid ? "false" : "true"); setText("raw-error", valid ? "" : "짝수 길이 16진수 1–256바이트를 입력하세요 · Enter 1–256 bytes of even hexadecimal"); if (!valid && focusOnError) input.focus(); return valid ? { kind:"raw", hex:value } : null; };
      const validateTemp = (zone, focusOnError) => { const input = $("heat-temp-" + zone); const value = Number(input?.value); const valid = Number.isInteger(value) && value >= 5 && value <= 40; input?.setAttribute("aria-invalid", valid ? "false" : "true"); setText("heat-temp-" + zone + "-error", valid ? "" : "5–40°C · 유효한 온도를 입력하세요"); if (!valid && focusOnError) input?.focus(); return valid ? value : null; };
      const byOne = (collection, index) => collection?.[index] ?? collection?.[String(index)] ?? collection?.[index - 1] ?? collection?.[String(index - 1)];
      const safeGeneration = (value) => Number.isSafeInteger(value) && value >= 0; const displayGeneration = (value) => safeGeneration(value) ? String(value) : "—"; const ageFor = (entry, serverNow, currentGeneration, runtimePhase, staleAfterMs, lastValidFrameAtMs, lastValidFrameGeneration) => { if (runtimePhase !== "running" || !Number.isSafeInteger(serverNow) || serverNow < 0 || !safeGeneration(currentGeneration) || !Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0 || !Number.isSafeInteger(lastValidFrameAtMs) || lastValidFrameAtMs <= 0 || !safeGeneration(lastValidFrameGeneration) || lastValidFrameGeneration !== currentGeneration) return null; const globalAge = serverNow - lastValidFrameAtMs; if (globalAge < 0 || globalAge > staleAfterMs) return null; const at = entry?.lastSeenAtMs ?? entry?.atMs; const entryGeneration = entry?.generation; if (entry?.stale !== false || !Number.isSafeInteger(at) || at <= 0 || !safeGeneration(entryGeneration) || entryGeneration !== currentGeneration) return null; const age = serverNow - at; return age >= 0 && age <= staleAfterMs ? age : null; };
      const draw = (payload) => {
        const source = payload && typeof payload === "object" ? payload : {};
        latestStatusPayload = source;
        const configured = source.bounds || {};
        const runtimePhase = Object.prototype.hasOwnProperty.call(phaseLabels, source.phase) ? source.phase : "stopped";
        const serverNow = source.serverNowMs;
        const currentGeneration = source.generation;
        statusText.textContent = phaseLabels[runtimePhase];
        const mutationDisabled = captureBusy || mutationLocked || txRetryLocked;
        startButton.disabled = mutationDisabled || runtimePhase === "running" || runtimePhase === "starting" || runtimePhase === "finalizing";
        stopButton.disabled = mutationDisabled || runtimePhase !== "running";
        setText("capture-elapsed", Number.isFinite(source.elapsedMs) ? (source.elapsedMs / 1000).toFixed(1) + "초" : "—");
        setText("capture-records", Number.isFinite(source.recordCount) ? nf(source.recordCount) + "개" : "—");
        setText("capture-bytes", Number.isFinite(source.byteCount) ? nf(source.byteCount) + "바이트" : "—");
        const capturedFile = source.file || source.lastResult?.file || null;
        setText("capture-bytes-file", Number.isFinite(capturedFile?.sizeBytes) ? nf(capturedFile.sizeBytes) + "바이트" : "—");
        setText("capture-filename", capturedFile?.name ? String(capturedFile.name) + (capturedFile.finalized ? " · 마무리됨" : " · 기록 중") : "아직 저장된 파일이 없습니다.");
        downloadReady = Boolean(source.file?.finalized || source.lastResult?.file?.finalized);
        setDownloadControl();
        csrfToken = typeof source.csrfToken === "string" ? source.csrfToken : csrfToken;
        const tx = source.tx && typeof source.tx === "object" ? source.tx : {};
        statusInvalid = !validRevision(tx.readinessRevision);
        statusRevision = statusInvalid ? "" : String(tx.readinessRevision);
        window.__bestiumTx = tx;
        const debug = source.debug && typeof source.debug === "object" ? source.debug : {};
        const staleAfterMs = debug.staleAfterMs ?? source.staleAfterMs;
        const devices = debug.devices || {};
        const queries = debug.queries || {};
        const frames = Array.isArray(debug.frames) ? debug.frames : [];
        const unknown = Array.isArray(debug.unknown) ? debug.unknown : [];
        const ambiguous = Array.isArray(debug.ambiguous) ? debug.ambiguous : [];
        const row = (id, value, entry, label, unit) => {
          const age = ageFor(entry, serverNow, currentGeneration, runtimePhase, staleAfterMs, source.lastValidFrameAtMs, source.lastValidFrameGeneration);
          const freshness = age === null ? "stale" : "age " + age + " ms · fresh";
          const evidence = entry?.evidence ? " · evidence " + entry.evidence : "";
          const shown = value === undefined || value === null ? "unknown" : String(value) + (unit ?? "");
          const labelled = label ? label + " " + shown : shown;
          setText(id, labelled + " · " + freshness + evidence + " · generation " + displayGeneration(entry?.generation ?? source.generation));
        };
        const detail = (entry) => {
          const raw = String(entry?.rawHex || entry?.frameHex || "unknown");
          const clipped = raw.slice(0, 128) + (raw.length > 128 ? "…" : "");
          const age = ageFor(entry, serverNow, currentGeneration, runtimePhase, staleAfterMs, source.lastValidFrameAtMs, source.lastValidFrameGeneration);
          const freshness = age === null ? "stale" : "age " + age + " ms · fresh";
          return String(entry?.cluster || "unknown") + " · " + clipped + " · " + freshness + " · generation " + displayGeneration(entry?.generation ?? source.generation);
        };
        const light = (zone) => byOne(devices.lights, zone);
        const heat = (zone) => byOne(devices.heating, zone);
        // A call is an event, not a condition: announce the transition into ringing, and
        // let the first status after load establish the baseline without announcing.
        const ringingAt = (which, slot, entry) => {
          const state = entry?.state ?? entry?.call;
          const previous = entranceWas[slot];
          entranceWas[slot] = state;
          if (state !== "ringing" || previous === undefined || previous === "ringing") return null;
          const callAge = ageFor(entry, serverNow, currentGeneration, runtimePhase, staleAfterMs, source.lastValidFrameAtMs, source.lastValidFrameGeneration);
          if (callAge === null) return null;
          return { which, key: which + ":" + String(entry.lastSeenAtMs) };
        };
        const communalCall = ringingAt("공동 현관", "communal", devices.entrances?.communal);
        const householdCall = ringingAt("세대 현관", "household", devices.entrances?.household);
        doorbell = communalCall || householdCall || doorbell;
        if (doorbell && doorbell.key === doorbellDismissed) doorbell = null;
        renderGateBanner(tx, runtimePhase);
        for (const zone of [1,2,3]) row("light-state-" + zone, light(zone)?.state, light(zone));
        row("gas-state", devices.gas?.state, devices.gas);
        for (const zone of [1,2,3,4]) {
          const entry = heat(zone);
          row("heat-state-" + zone, entry?.state, entry);
          setText("heating-current-" + zone, entry?.currentC ?? "—");
          setText("heating-target-" + zone, entry?.targetC ?? "—");
        }
        // The raw floor byte rendered a basement car as 177; the label is what the page shows.
        const queued = Array.isArray(source.tx?.queue) ? source.tx.queue : [];
        setText("tx-queue", queued.length === 0
          ? "전송 대기 없음"
          : "전송 대기 " + queued.length + "건 · " + queued.map((entry) => String(entry?.key ?? "?")).join(", "));
        row("elevator-floor", devices.elevator?.floorLabel, devices.elevator);
        row("elevator-direction", devices.elevator?.motion, devices.elevator);
        row("elevator-call", devices.elevator?.call, devices.elevator);
        row("household-entrance", devices.entrances?.household?.doorOpenObserved === true ? "월패드 문열기 조작 관측" : "조작 관측 없음", devices.entrances?.household);
        row("common-entrance", "이 회선에서 관측되지 않음", devices.entrances?.communal);
        row("outlet-query-state", queries.outlet, devices.outlet, "조회", "회");
        row("ventilation-query-state", queries.ventilation, devices.ventilation, "조회", "회");
        const vehicle = devices.vehicle || {};
        row("vehicle-unidentified", vehicle.evidence || "unidentified", vehicle, "관찰 전용");
        const cctv = devices.cctv || {};
        const cctvAge = ageFor(cctv, serverNow, currentGeneration, runtimePhase, staleAfterMs, source.lastValidFrameAtMs, source.lastValidFrameGeneration);
        const cctvEvidence = cctv.evidence;
        const cctvAccepted = cctvAge !== null && (cctvEvidence === "observed" || cctvEvidence === "not_observed_this_generation" || cctvEvidence === "not_observed_current_protocol_frame");
        setText("cctv-observation", cctvAccepted ? (cctvEvidence === "observed" ? "CCTV observed in the inspected current protocol frame/generation · 검사한 현재 프로토콜 프레임/세대에서 CCTV 관측" : "CCTV not observed in the inspected current protocol frame/generation · 검사한 현재 프로토콜 프레임/세대에서 CCTV 미관측") : "CCTV unknown · stale · evidence unavailable · CCTV 근거 없음");
        const unknownCurrent = unknown.length > 0 && unknown.every((entry) => ageFor(entry, serverNow, currentGeneration, runtimePhase, staleAfterMs, source.lastValidFrameAtMs, source.lastValidFrameGeneration) !== null);
        setText("unknown-clusters", unknown.length + " unknown clusters · " + (unknownCurrent ? "generation " + displayGeneration(currentGeneration) : "generation unknown/stale"));
        const unknownDetails = unknown.slice(-8).map(detail).join(" | ");
        const ambiguousDetails = ambiguous.slice(-8).map(detail).join(" | ");
        setText("unknown-lab", ("unknown frames " + unknown.length + " · " + unknownDetails + " · ambiguous " + ambiguousDetails).slice(0, 1100));
        setText("ambiguous-lab", ("ambiguous clusters " + ambiguous.length + " · " + ambiguousDetails).slice(0, 900));
        const seen = source.lastValidFrameAtMs;
        const freshnessAge = ageFor({ lastSeenAtMs: seen, generation: currentGeneration, stale: false }, serverNow, currentGeneration, runtimePhase, staleAfterMs, seen, source.lastValidFrameGeneration);
        setText("freshness", freshnessAge === null || tx.fresh !== true ? "unknown · stale · age —" : "age " + freshnessAge + " ms · fresh · generation " + displayGeneration(currentGeneration));
        setText("idle-timeout", "Idle timeout · idle_timeout_ms: " + String(configured.idle_timeout_ms ?? "—"));
        const list = $("frame-lab");
        while (list.firstChild) list.removeChild(list.firstChild);
        for (const entry of frames.slice(-32)) {
          const item = document.createElement("tr");
          const age = ageFor(entry, serverNow, currentGeneration, runtimePhase, staleAfterMs, source.lastValidFrameAtMs, source.lastValidFrameGeneration);
          const hex = String(entry.rawHex || entry.frameHex || "unknown");
          const series = seriesOf(hex);
          for (const value of [series.name, hex, series.decoded, (age === null ? "stale" : "age " + age + " ms · fresh") + " · generation " + displayGeneration(entry?.generation ?? source.generation)]) {
            const cell = document.createElement("td");
            cell.textContent = value;
            item.appendChild(cell);
          }
          list.appendChild(item);
        }
        if (!mutationLocked && !txRetryLocked && statusInvalid) setText("alert", "status readiness revision missing or malformed · stale · 재검토 필요");
        else if (!mutationLocked && !txRetryLocked && reviewPreview?.evidence === "observed" && readyForAction(reviewPreview)) setText("alert", "");
        else if (!mutationLocked && !txRetryLocked && reviewPreview && String(previewRevision(reviewPreview)) !== statusRevision) setText("alert", "readiness revision changed · stale · 재검토 필요");
        setReviewBusy(reviewBusy);
      };
      const markPollFailure = () => { capturePhase = null; statusInvalid = true; statusRevision = ""; window.__bestiumTx = { ...txState(), readinessRevision: "" }; statusText.textContent = "Poll failed · stale · 폴링 실패"; setText("freshness", "stale · poll failed · 폴링 실패"); if (!mutationLocked && !txRetryLocked) setText("alert", "poll/status failed · stale · 재검토 필요"); setCaptureControls(); setReviewBusy(reviewBusy); };
      const poll = (immediate = false) => { if (immediate) clearPoll(); if (polling && pollPromise) return pollPromise; const epoch = ++pollEpoch; polling = true; const controller = makeController(); pollController = controller; let settled = false; let resolvePromise = null; const promise = new Promise((resolve) => { resolvePromise = resolve; }); pollPromise = promise; pollResolve = resolvePromise; pollResolveEpoch = epoch; const complete = (value) => { if (pollResolveEpoch !== epoch || !pollResolve) return; const resolve = pollResolve; pollResolve = null; pollPromise = null; pollResolveEpoch = 0; resolve(value); }; const retry = () => { if (epoch !== pollEpoch) return; pollTimer = window.setTimeout(() => { pollTimer = null; void poll(); }, 1000); }; const finish = (failed, payload, retryNow = false) => { if (settled || epoch !== pollEpoch) return; settled = true; polling = false; if (pollController === controller) pollController = null; const valid = !failed && payload && typeof payload === "object" && validCapturePhase(payload.phase); if (valid) { capturePhase = payload.phase; appliedPollEpoch = epoch; draw(payload); } else { markPollFailure(); if (retryNow) retry(); } complete(valid); }; pollDeadlineTimer = window.setTimeout(() => { pollTimer = null; pollDeadlineTimer = null; if (settled) { void poll(); return; } controller.abort(); finish(true, null, true); }, 5000); pollTimer = pollDeadlineTimer; fetch("./api/status", { cache:"no-store", signal:controller.signal }).then((response) => { if (!response.ok) throw new Error("poll failed"); return response.json(); }).then((payload) => finish(false, payload), () => finish(true, null)); return promise; };
      const capture = async (endpoint) => {
        const expectedPhase = endpoint === "./api/capture" ? "stopped" : endpoint === "./api/stop" ? "running" : null;
        const reconciledPhase = endpoint === "./api/capture" ? "running" : endpoint === "./api/stop" ? "stopped" : null;
        const endpointAllowed = () => expectedPhase !== null && capturePhase === expectedPhase;
        if (!endpointAllowed()) return;
        if (mutationLocked || txRetryLocked) return;
        if (captureBusy || commitInFlight || phase === "previewing" || phase === "committing") {
          setText("alert", "Capture blocked while review/challenge is busy · 검토/챌린지 중 캡처 차단");
          return;
        }
        if (challengeBarrierPending) {
          setCaptureBusy(true);
          try {
            if (!(await challengeBarrier) || txRetryLocked || !endpointAllowed()) return;
          } finally {
            setCaptureBusy(false);
          }
        }
        if (!endpointAllowed()) return;
        if (reviewBusy) {
          setText("alert", "Capture blocked while review/challenge is busy · 검토/챌린지 중 캡처 차단");
          return;
        }
        const challengeId = pendingChallenge?.id;
        if (challengeId) {
          setCaptureBusy(true);
          try {
            if (!(await cancelChallenge(challengeId)) || !endpointAllowed()) return;
            pendingChallenge = null;
            phase = "reviewed";
            setText("review-phase", phaseLabels[phase]);
          } finally {
            setCaptureBusy(false);
          }
        }
        if (!endpointAllowed() || mutationLocked || txRetryLocked) return;
        setCaptureBusy(true);
        const epoch = ++mutationEpoch;
        const controller = makeController();
        mutationController = controller;
        let settled = false;
        const deadline = window.setTimeout(() => {
          if (settled || epoch !== mutationEpoch) return;
          settled = true;
          mutationDeadlineTimer = null;
          controller.abort();
          mutationController = null;
          lockMutation("capture/stop deadline exceeded");
        }, 5_000);
        mutationDeadlineTimer = deadline;
        try {
          const response = await fetch(endpoint, { method:"POST", headers:{ "x-csrf-token":csrfToken }, signal:controller.signal });
          if (epoch !== mutationEpoch) return;
          if (!response || response.ok !== true) throw new Error("capture rejected");
          settled = true;
          if (mutationDeadlineTimer === deadline) {
            clearTimeout(deadline);
            mutationDeadlineTimer = null;
          }
          if (mutationController === controller) mutationController = null;
          statusText.textContent = "Reconciling · 상태 확인 중";
          if (!(await poll(true)) || capturePhase !== reconciledPhase) {
            lockMutation("capture/stop reconciliation failed");
            return;
          }
        } catch {
          if (epoch !== mutationEpoch) return;
          lockMutation("capture/stop failed");
        } finally {
          if (epoch === mutationEpoch) {
            if (mutationDeadlineTimer === deadline) {
              clearTimeout(deadline);
              mutationDeadlineTimer = null;
            }
            if (mutationController === controller) mutationController = null;
            setCaptureBusy(false);
          }
        }
      };
      $("tx-unlock-ack")?.addEventListener("click", () => { clearIndeterminate(); });
      for (const [id, factory] of Object.entries(actionCatalog)) $(id)?.addEventListener("click", (event) => { void oneTapSend(factory(), event.currentTarget); }); for (const zone of [1,2,3,4]) $("heat-temp-" + zone + "-send")?.addEventListener("click", (event) => { const value = validateTemp(zone, true); if (value !== null) void oneTapSend({ kind:"heat", zone, temperatureC:value }, event.currentTarget); }); for (const zone of [1,2,3,4]) $("heat-temp-" + zone)?.addEventListener("input", () => { validateTemp(zone, false); });
      $("raw-preview")?.addEventListener("click", (event) => { const action = validateRaw(true); if (action) void beginPreview(action, event.currentTarget); }); $("raw-burst")?.addEventListener("blur", () => { validateRaw(false); }); $("raw-burst")?.addEventListener("input", () => { $("raw-burst").setAttribute("aria-invalid", "false"); setText("raw-error", ""); }); $("issue-challenge")?.addEventListener("click", () => { void issueChallenge(); }); $("review-commit")?.addEventListener("click", () => { void commitReviewed(); }); $("review-cancel")?.addEventListener("click", cancelReview); $("capture-start")?.addEventListener("click", () => { void capture("./api/capture"); }); $("capture-stop")?.addEventListener("click", () => { void capture("./api/stop"); }); $("capture-download")?.addEventListener("click", () => { window.location.assign("./api/download"); }); const selectTab = (name) => { $("surface")?.setAttribute("data-tab", name); for (const id of ["tab-control", "tab-debug"]) $(id)?.setAttribute("aria-selected", id === "tab-" + name ? "true" : "false"); }; $("doorbell-dismiss")?.addEventListener("click", () => { if (doorbell) { doorbellDismissed = doorbell.key; doorbell = null; if (latestStatusPayload) draw(latestStatusPayload); } }); $("tab-control")?.addEventListener("click", () => selectTab("control")); $("tab-debug")?.addEventListener("click", () => selectTab("debug")); void poll(true);
    })();
    /* semantic modes: mode: "preview" · mode: "challenge" · mode: "commit"; payload.debug.devices payload.debug.queries payload.debug.frames payload.debug.unknown; device-not-confirmed */
  </script>
</body>
</html>`;
}

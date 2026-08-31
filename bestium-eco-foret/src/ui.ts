import { HA_DESIGN_SYSTEM_CSS } from "./ha-design-system.ts";

// The page an operator opens every day.
//
// It offers the eight write paths measurement confirmed and the six device families it
// decodes, and nothing else: no frame log, no query-only panel, no arbitrary-send lab, no
// candidate tier. Everything here has been sent on the live bus and watched to take.
//
// Two rules shape the wording. A direct reply says nothing about the effect — the gas valve
// answers byte-identically whether or not the state changed — so this page only ever claims
// what a state frame showed. And a write that left the socket without a matching frame coming
// back is 미관측, never 실패: the wallpad may well have acted on it.

/** Single-path MDI glyphs. The design system forbids emoji, and these are what it ships. */
const ICON = {
  lightOn: "M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21Z",
  lightOff: "M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z",
  radiator: "M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z",
  valve: "M4 22H2V2H4M22 2H20V22H22M17.24 5.34L13.24 9.34A3 3 0 0 0 9.24 13.34L5.24 17.34L6.66 18.76L10.66 14.76A3 3 0 0 0 14.66 10.76L18.66 6.76Z",
  elevator: "M7,2L11,6H8V10H6V6H3L7,2M17,10L13,6H16V2H18V6H21L17,10M7,12H17A2,2 0 0,1 19,14V20A2,2 0 0,1 17,22H7A2,2 0 0,1 5,20V14A2,2 0 0,1 7,12M7,14V20H17V14H7Z",
  door: "M12,3C10.89,3 10,3.89 10,5H3V19H2V21H22V19H21V5C21,3.89 20.11,3 19,3H12M12,5H19V19H12V5M5,11H7V13H5V11Z",
  arrowUp: "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",
  arrowDown: "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",
  alert: "M13,14H11V9H13M13,18H11V16H13M1,21H23L12,2L1,21Z",
  check: "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z",
  eye: "M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z",
  eyeOff: "M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.74,7.13 11.35,7 12,7Z",
  clock: "M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z",
  refresh: "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z",
  play: "M8,5.14V19.14L19,12.14L8,5.14Z",
  stop: "M18,18H6V6H18V18Z",
  download: "M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",
} as const;

const svg = (path: string, size = 24): string =>
  `<svg class="ha-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`;

/** What the design system does not cover: this page's own layout and its two danger controls. */
const PAGE_CSS = String.raw`
*{box-sizing:border-box}
html{font-size:14px}
body{margin:0;background:var(--primary-background-color);color:var(--primary-text-color);
  font-family:var(--ha-font-family-body);font-size:var(--ha-font-size-m);
  line-height:var(--ha-line-height-normal);-webkit-font-smoothing:antialiased}
.app{display:flex;flex-direction:column;min-height:100vh}
.app-header{display:flex;align-items:center;gap:var(--ha-space-3);height:var(--header-height);
  padding:0 var(--ha-space-4);background:var(--app-header-background-color);
  border-bottom:1px solid var(--divider-color);position:sticky;top:0;z-index:2}
.app-header__mark{display:flex;color:var(--primary-color)}
.app-header__title{flex:1;min-width:0}
.app-header__title strong{display:block;font-size:var(--ha-font-size-l);font-weight:500;line-height:1.25}
.app-header__title span{display:block;font-size:var(--ha-font-size-s);color:var(--secondary-text-color);line-height:1.3}
.link-chip{display:flex;align-items:center;gap:var(--ha-space-2);height:36px;padding:0 var(--ha-space-3);
  border:1px solid var(--divider-color);border-radius:18px;font-size:var(--ha-font-size-s);
  font-weight:500;white-space:nowrap}
.link-chip__dot{width:8px;height:8px;border-radius:50%;background:var(--state-inactive-color)}
.link-chip[data-link="up"] .link-chip__dot{background:var(--success-color)}
.link-chip[data-link="connecting"] .link-chip__dot{background:var(--warning-color)}
.link-chip[data-link="down"] .link-chip__dot{background:var(--error-color)}
main{flex:1;padding:var(--ha-space-4);display:flex;justify-content:center}
.stack{width:100%;max-width:1200px;display:flex;flex-direction:column;gap:var(--ha-space-6)}
.card{padding:var(--ha-space-4);display:flex;flex-direction:column;gap:var(--ha-space-3)}
.card__head{display:flex;align-items:baseline;gap:var(--ha-space-2);flex-wrap:wrap}
.card__head h2{margin:0;font-size:var(--ha-font-size-xl);font-weight:500}
.card__note{font-size:var(--ha-font-size-s);color:var(--secondary-text-color)}
.grid{display:grid;gap:var(--ha-space-2)}
.grid--lights{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.grid--zones{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.grid--common{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.tile{display:flex;align-items:center;gap:var(--ha-space-3);padding:var(--ha-space-2) var(--ha-space-3);
  border-radius:var(--ha-border-radius-md);background:var(--secondary-background-color)}
.tile--stacked{flex-direction:column;align-items:stretch;gap:10px;padding:var(--ha-space-3)}
.tile__head{display:flex;align-items:center;gap:var(--ha-space-2)}
.tile__name{font-size:var(--ha-font-size-m);font-weight:500;letter-spacing:0.1px}
.tile__sub{font-size:var(--ha-font-size-s);color:var(--secondary-text-color)}
.tile__grow{flex:1;min-width:0}
.pair{display:flex;gap:var(--ha-space-2)}
.pair > *{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--ha-space-2);
  min-height:var(--min-touch-target);padding:0 var(--ha-space-4);border:none;
  border-radius:var(--ha-border-radius-md);background:var(--ha-color-fill-neutral-quiet-resting);
  color:var(--primary-text-color);font-family:var(--ha-font-family-body);
  font-size:var(--ha-font-size-m);font-weight:500;cursor:pointer;
  transition:background-color var(--ha-control-transition),color var(--ha-control-transition)}
.btn:hover:not(:disabled){background:var(--ha-color-fill-neutral-quiet-hover)}
.btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--primary-color)}
.btn:disabled{cursor:not-allowed;color:var(--disabled-text-color)}
/* An active control tints itself. "off" is a state, not an emphasis: it takes the inactive
   grey rather than the brand colour, which read as though off were the thing being done. */
.btn[aria-pressed="true"]{background:var(--state-inactive-color);color:var(--white-color)}
.btn--light[aria-pressed="true"]{background:var(--state-light-active-color);color:var(--black-color)}
.btn--heat[aria-pressed="true"]{background:var(--state-climate-heat-color);color:var(--white-color)}
.btn--danger{background:none;border:1px solid var(--error-color);color:var(--error-color)}
.btn--danger:hover:not(:disabled){background:color-mix(in srgb,var(--error-color) 12%,transparent)}
.btn--quiet{background:none;border:1px solid var(--outline-color)}
.btn--quiet:hover:not(:disabled){background:var(--ha-color-fill-neutral-quiet-hover)}
.stepper{display:flex;align-items:center;justify-content:space-between;gap:var(--ha-space-2);
  min-height:var(--min-touch-target);padding:0 var(--ha-space-2);
  border-radius:var(--ha-border-radius-md);background:var(--ha-color-fill-neutral-quiet-resting)}
.stepper__value{font-size:var(--ha-font-size-m);font-weight:500;font-variant-numeric:tabular-nums}
.stepper__btn{display:flex;align-items:center;justify-content:center;
  width:var(--min-touch-target);min-height:var(--min-touch-target);
  border:none;background:none;color:inherit;font-size:var(--ha-font-size-xl);cursor:pointer;
  border-radius:var(--ha-border-radius-sm)}
.stepper__btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--primary-color)}
.stepper__btn:disabled{color:var(--disabled-text-color);cursor:not-allowed}
.hint{font-size:var(--ha-font-size-s);color:var(--secondary-text-color);text-wrap:pretty}
.danger-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ha-space-3)}
.danger-row__text{flex:1;min-width:200px;display:flex;flex-direction:column;gap:2px}
.danger-row__title{display:flex;align-items:center;gap:6px;font-size:var(--ha-font-size-m);font-weight:500}
.danger-row__title .ha-icon{color:var(--error-color)}
.badge{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:12px;
  font-size:var(--ha-font-size-s);font-weight:500}
.badge--closed{background:color-mix(in srgb,var(--success-color) 16%,transparent);color:var(--success-color)}
.badge--open{background:color-mix(in srgb,var(--warning-color) 16%,transparent);color:var(--warning-color)}
.badge--unknown{background:var(--ha-color-fill-neutral-quiet-resting);color:var(--secondary-text-color)}
.event{font-size:var(--ha-font-size-2xl);font-weight:500;line-height:1.2}
.event__at{font-size:var(--ha-font-size-s);color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
.unavailable{color:var(--state-unavailable-color)}
.banner{position:relative;overflow:hidden;border-radius:var(--ha-border-radius-lg);
  border:1px solid var(--divider-color);background:var(--card-background-color)}
.banner__wash{position:absolute;inset:0;opacity:0.12;pointer-events:none;background:var(--state-inactive-color)}
.banner[data-state="ready"] .banner__wash,.banner[data-state="confirmed"] .banner__wash{background:var(--success-color)}
.banner[data-state="disconnected"] .banner__wash{background:var(--error-color)}
.banner[data-state="quiet"] .banner__wash,.banner[data-state="unconfirmed"] .banner__wash{background:var(--warning-color)}
.banner[data-state="sending"] .banner__wash{background:var(--info-color)}
.banner__body{position:relative;display:flex;gap:var(--ha-space-3);padding:var(--ha-space-4)}
.banner__icon{flex:none;display:flex;padding-top:2px;color:var(--secondary-text-color)}
.banner[data-state="ready"] .banner__icon,.banner[data-state="confirmed"] .banner__icon{color:var(--success-color)}
.banner[data-state="disconnected"] .banner__icon{color:var(--error-color)}
.banner[data-state="quiet"] .banner__icon,.banner[data-state="unconfirmed"] .banner__icon{color:var(--warning-color)}
.banner[data-state="sending"] .banner__icon{color:var(--info-color);animation:ha-pulse 1.2s ease-in-out infinite}
.banner__text{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--ha-space-2)}
.banner__title{font-size:var(--ha-font-size-xl);font-weight:500;line-height:1.3}
.banner__detail{font-size:var(--ha-font-size-m);color:var(--secondary-text-color);text-wrap:pretty}
.banner__meter{width:100%;height:12px;border-radius:var(--ha-border-radius-sm);overflow:hidden;
  background:var(--secondary-background-color)}
.banner__meter span{display:block;height:100%;background:var(--info-color);transition:width 120ms linear}
.banner__foot{display:flex;justify-content:space-between;gap:var(--ha-space-3);
  font-size:var(--ha-font-size-s);color:var(--secondary-text-color)}
/* display:flex beats the hidden attribute's UA rule, so a hidden row kept rendering. */
[hidden]{display:none !important}
.banner__foot span:last-child{font-variant-numeric:tabular-nums}
.rule{height:1px;background:var(--divider-color);margin-top:var(--ha-space-2)}
.capture h2{font-size:var(--ha-font-size-l);font-weight:400;color:var(--secondary-text-color)}
.capture__status{display:flex;align-items:center;gap:var(--ha-space-2);
  font-size:var(--ha-font-size-m);font-variant-numeric:tabular-nums}
.capture__dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--disabled-color)}
.capture__dot[data-recording="open"]{background:var(--primary-color)}
.capture__buttons{display:flex;flex-wrap:wrap;gap:var(--ha-space-2)}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}
@keyframes ha-pulse{0%{opacity:1}50%{opacity:.45}100%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition-duration:.01ms !important;animation-duration:.01ms !important}
}
`;

// String concatenation rather than template literals throughout: this whole file is one
// `String.raw` literal, and a backtick here would close it.
const CLIENT_SCRIPT = String.raw`
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var setText = function (id, value) { var el = $(id); if (el) el.textContent = value; };
  var csrfToken = "";
  var latest = null;

  // What the banner is showing, and why. "sending" through "unconfirmed" are ours; the rest
  // are read off the link every poll.
  var send = { state: "idle", label: "", startedAtMs: 0, windowMs: 4600, last: null };
  var OBSERVED_WRITES = 8;

  // Each state's glyph, so the banner does not sit on a warning triangle while it says the
  // controls are ready. The paths are the same MDI singles the page renders elsewhere.
  var BANNER_ICON = {
    disconnected: "M13,14H11V9H13M13,18H11V16H13M1,21H23L12,2L1,21Z",
    quiet: "M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z",
    ready: "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z",
    sending: "M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z",
    confirmed: "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z",
    unconfirmed: "M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.74,7.13 11.35,7 12,7Z",
  };

  var BANNER = {
    disconnected: {
      title: "게이트웨이에 연결되지 않았습니다",
      detail: "TCP 소켓이 열려 있지 않습니다. 보낼 곳이 없고, 들어오는 프레임도 없어 관측할 것이 없습니다. 접속 대상은 애드온 설정에서 정합니다.",
    },
    quiet: {
      title: "버스가 조용해 송신을 보류합니다",
      detail: "소켓은 열려 있지만 상태 프레임이 오지 않습니다. 월패드가 절전 중일 수도, 배선이 끊겼을 수도 있습니다. 지금 보내면 결과를 확인할 수 없습니다.",
    },
    ready: { title: "제어 준비됨", detail: "" },
    sending: { title: "보낸 뒤 응답을 관측하고 있습니다", detail: "" },
    confirmed: { title: "요청한 상태를 확인했습니다", detail: "" },
    unconfirmed: {
      title: "소켓으로 보냈지만 요청한 상태는 관측하지 못했습니다",
      detail: "월패드가 반영하지 않았을 수도, 상태 프레임만 못 보았을 수도 있습니다. 실패로 기록하지 않습니다.",
    },
  };

  // Every reason the server's readiness gate can produce, worded for the operator. A silent
  // control is the defect this page exists to remove, so an unmapped reason passes through in
  // English rather than vanishing.
  const REASON_KO = {
    "master TX disabled": "송신이 애드온 설정에서 꺼져 있습니다",
    "speculative TX disabled": "추측 후보 송신이 꺼져 있습니다",
    "unsafe TX disabled": "위험 조작 송신이 꺼져 있습니다",
    "authorized user mismatch": "이 사용자에게는 송신 권한이 없습니다",
    "gateway link is not up": "게이트웨이에 연결되지 않았습니다",
    "one in-flight write only": "앞선 송신이 아직 끝나지 않았습니다",
    "transport generation quarantined": "연결이 끊겼던 구간이라 잠겨 있습니다",
    "transport not connected": "소켓이 열려 있지 않습니다",
    "capture append pending": "수집 기록을 쓰는 중입니다",
    "no current-generation valid RX frame": "다시 연결된 뒤 아직 프레임을 받지 못했습니다",
    "no current valid RX frame": "아직 유효한 프레임을 받지 못했습니다",
    "current RX frame stale": "마지막 프레임이 너무 오래되었습니다",
    "line busy: quiet interval not met": "회선이 아직 조용해지지 않았습니다",
    "TX cooldown active": "연속 송신을 막는 대기 시간입니다",
    "empty action frame": "보낼 프레임이 없습니다",
    "recognized frame boundary collision": "다른 프레임과 경계가 겹칩니다",
    "current-generation 7F compatibility proof required": "이번 연결에서 호환 증명을 아직 받지 못했습니다",
  };

  const reasonKo = function (text) {
    if (!text) return "";
    // The retry tail composes "<refusal> after N frame(s) reached the bus" so that a refusal
    // which followed a frame onto the wallpad can be told from one that wrote nothing. Only
    // the refusal has a wording in the table, so the lookup uses the head and the operator
    // still reads the whole composed string in the parenthesis.
    var head = String(text).replace(/ after \d+ frame\(s\) reached the bus$/, "");
    var known = REASON_KO[head];
    return known ? known + " (" + text + ")" : text;
  };

  const reasonsKo = function (list) {
    if (!Array.isArray(list) || list.length === 0) return "";
    var out = [];
    for (var i = 0; i < list.length; i += 1) { var one = reasonKo(list[i]); if (one) out.push(one); }
    return out.join(" · ");
  };

  // What the page can tell from the status alone, without asking the server for a preview.
  const gateBlockers = function (payload) {
    var tx = (payload && payload.tx) || {};
    var out = [];
    if (tx.enabled !== true) out.push("master TX disabled");
    if (tx.authorized !== true) out.push("authorized user mismatch");
    if (tx.link !== "up") out.push("gateway link is not up");
    if (tx.quarantined === true) out.push("transport generation quarantined");
    if (tx.pendingAppend === true) out.push("capture append pending");
    if (tx.currentGenerationRx !== true) out.push("no current-generation valid RX frame");
    if (tx.fresh !== true) out.push("current RX frame stale");
    return out;
  };

  var bannerStateNow = function (payload) {
    if (send.state === "sending" || send.state === "confirmed" || send.state === "unconfirmed") return send.state;
    var tx = (payload && payload.tx) || {};
    if (tx.link !== "up") return "disconnected";
    if (tx.fresh !== true) return "quiet";
    return "ready";
  };

  var drawBanner = function (payload) {
    var state = bannerStateNow(payload);
    var el = $("banner-state");
    if (!el) return;
    el.setAttribute("data-state", state);
    el.setAttribute("aria-busy", state === "sending" ? "true" : "false");
    var icon = $("banner-icon");
    if (icon) {
      var path = icon.querySelector("path");
      if (path) path.setAttribute("d", BANNER_ICON[state]);
    }
    setText("banner-title", BANNER[state].title);
    var detail = BANNER[state].detail;
    if (state === "ready") {
      var tx = (payload && payload.tx) || {};
      var ageMs = payload && payload.serverNowMs && payload.lastValidFrameAtMs
        ? Math.max(0, payload.serverNowMs - payload.lastValidFrameAtMs) : null;
      detail = "상태 프레임을 관측하고 있습니다"
        + (ageMs === null ? "" : " · 마지막 프레임 " + (ageMs / 1000).toFixed(1) + "초 전")
        + " · 관측 확인 " + OBSERVED_WRITES + " / " + OBSERVED_WRITES + "개"
        // Shown only when it is not zero, because zero is what a healthy line reads and a
        // permanent "0개" teaches nothing. A rising count is the sign that our own writes are
        // colliding with the wallpad's: in the measured runs every transmit that waited for a
        // quiet interval damaged something, and every one through the silent-query gate did not.
        + ((tx.unparsedByteCount || 0) > 0 ? " · 해독하지 못한 바이트 " + tx.unparsedByteCount + "개" : "");
      var blocked = reasonsKo(gateBlockers(payload));
      if (blocked) detail = blocked + " · " + detail;
    } else if (state === "sending" || state === "confirmed" || state === "unconfirmed") {
      detail = send.label + (detail ? " · " + detail : "");
    }
    setText("banner-detail", detail);
    var meter = $("banner-meter");
    var foot = $("banner-foot");
    if (meter) meter.hidden = state !== "sending";
    if (foot) foot.hidden = state !== "sending";
    var actions = $("banner-actions");
    if (actions) actions.hidden = state !== "unconfirmed";
  };

  var tickSend = function () {
    if (send.state !== "sending") return;
    var elapsed = Date.now() - send.startedAtMs;
    var remaining = Math.max(0, send.windowMs - elapsed);
    var fill = $("banner-meter-fill");
    if (fill) fill.style.width = Math.min(100, (elapsed / send.windowMs) * 100) + "%";
    setText("banner-remaining", (remaining / 1000).toFixed(1) + "초 남음 / 최대 " + (send.windowMs / 1000).toFixed(1) + "초");
  };

  var locked = function () {
    var tx = (latest && latest.tx) || {};
    return send.state === "sending" || tx.link !== "up" || tx.enabled !== true || tx.authorized !== true;
  };

  var applyLock = function () {
    var disabled = locked();
    var ids = ["light-1-on","light-1-off","light-2-on","light-2-off","light-3-on","light-3-off",
      "lights-all-on","lights-all-off","batchoff-toggle","heat-all-on","heat-all-off",
      "gas-close","elevator-up","elevator-down"];
    for (var z = 1; z <= 4; z += 1) {
      ids.push("heat-zone-" + z + "-on", "heat-zone-" + z + "-off", "heat-temp-" + z + "-up", "heat-temp-" + z + "-down");
    }
    for (var i = 0; i < ids.length; i += 1) {
      var el = $(ids[i]);
      if (el) el.disabled = disabled;
    }
  };

  var postAction = function (action, mode) {
    var body = {};
    for (var key in action) if (Object.prototype.hasOwnProperty.call(action, key)) body[key] = action[key];
    body.mode = mode;
    return fetch("./api/action", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body),
    }).then(function (response) {
      if (!response.ok) throw new Error("action rejected");
      return response.json();
    });
  };

  var settle = function (state) {
    send.state = state;
    drawBanner(latest);
    applyLock();
    window.setTimeout(function () {
      if (send.state === state) { send.state = "idle"; drawBanner(latest); applyLock(); }
    }, 6000);
  };

  // One write attempt: it leaves the socket, then a matching state frame either arrives inside
  // the observation window or it does not. Nothing here is a failure.
  var run = function (action, label) {
    if (locked()) return;
    send.state = "sending";
    send.label = label;
    send.last = action;
    send.startedAtMs = Date.now();
    var tx = (latest && latest.tx) || {};
    if (typeof tx.observationTimeoutMs === "number") send.windowMs = tx.observationTimeoutMs;
    drawBanner(latest);
    applyLock();
    tickSend();
    postAction(action, "live").then(function (result) {
      if (result && result.outcome === "rejected") {
        var why = reasonsKo(result.reasons) || reasonKo(result.reason) || "준비되지 않음";
        send.label = label + " · 보내지 못했습니다 · " + why;
        settle("unconfirmed");
        return;
      }
      var ok = result && (result.confirmed === true || result.outcome === "confirmed");
      // An unconfirmed send that also carries a reason is one whose later attempts were
      // refused after an earlier one had written. Dropping the reason here left the operator
      // with "not observed" and no way to see that a capture append, or a socket that went
      // away, is what stopped the retries.
      var why = ok ? "" : reasonKo(result && result.reason);
      send.label = label + " · " + (ok ? "상태 프레임으로 확인" : (send.windowMs / 1000).toFixed(1) + "초 동안 요청한 상태를 관측하지 못함") + (why ? " · " + why : "");
      settle(ok ? "confirmed" : "unconfirmed");
      poll(true);
    }, function (error) {
      var why = reasonsKo(gateBlockers(latest)) || reasonKo(String(error && error.message)) || "준비되지 않음";
      send.label = label + " · 보내지 못했습니다 · " + why;
      settle("unconfirmed");
    });
  };

  var TEMP_MIN = 5;
  var TEMP_MAX = 40;
  var targets = { 1: null, 2: null, 3: null, 4: null };

  var drawDevices = function (payload) {
    var devices = (payload && payload.debug && payload.debug.devices) || {};
    var tx = (payload && payload.tx) || {};

    var chip = $("link-state");
    if (chip) chip.setAttribute("data-link", tx.link || "down");
    setText("link-state-text", "EW11 게이트웨이 · TCP · "
      + (tx.link === "up" ? "연결됨" : tx.link === "connecting" ? "연결 중" : "연결 끊김"));

    var lights = devices.lights || {};
    for (var n = 1; n <= 3; n += 1) {
      var light = lights[n] || {};
      var on = light.state === "on";
      var known = light.state === "on" || light.state === "off";
      setText("light-state-" + n, (known ? (on ? "켜짐" : "꺼짐") : "아직 관측되지 않았습니다") + " · 0x19 · 채널 " + n);
      var icon = $("light-icon-" + n);
      if (icon) icon.style.setProperty("--tile-color", on ? "var(--state-light-active-color)" : "var(--state-inactive-color)");
      var onBtn = $("light-" + n + "-on");
      var offBtn = $("light-" + n + "-off");
      if (onBtn) onBtn.setAttribute("aria-pressed", known && on ? "true" : "false");
      if (offBtn) offBtn.setAttribute("aria-pressed", known && !on ? "true" : "false");
    }

    var batch = devices.batchOff || {};
    var batchOn = batch.state === "on";
    setText("batchoff-state", batch.state === "on" ? "걸림" : batch.state === "off" ? "풀림" : "아직 관측되지 않았습니다");
    var batchBtn = $("batchoff-toggle");
    if (batchBtn) batchBtn.textContent = batchOn ? "풀기" : "걸기";

    var heating = devices.heating || {};
    for (var z = 1; z <= 4; z += 1) {
      var zone = heating[z] || {};
      var heatOn = zone.state === "on";
      var heatKnown = zone.state === "on" || zone.state === "off";
      var room = typeof zone.currentC === "number" ? " · 실내 " + zone.currentC + "°C" : "";
      setText("heat-state-" + z, heatKnown
        ? (heatOn ? "난방 " + (zone.targetC != null ? zone.targetC : "—") + "°C" : "꺼짐") + room
        : "아직 관측되지 않았습니다 · 0x18 · 존 " + z);
      if (typeof zone.targetC === "number") targets[z] = zone.targetC;
      setText("heating-target-" + z, targets[z] == null ? "—" : String(targets[z]));
      var zoneIcon = $("heat-icon-" + z);
      if (zoneIcon) zoneIcon.style.setProperty("--tile-color", heatOn ? "var(--state-climate-heat-color)" : "var(--state-inactive-color)");
      var zoneOn = $("heat-zone-" + z + "-on");
      var zoneOff = $("heat-zone-" + z + "-off");
      if (zoneOn) zoneOn.setAttribute("aria-pressed", heatKnown && heatOn ? "true" : "false");
      if (zoneOff) zoneOff.setAttribute("aria-pressed", heatKnown && !heatOn ? "true" : "false");
    }

    var gas = devices.gas || {};
    var gasEl = $("gas-state");
    if (gasEl) {
      gasEl.textContent = gas.state === "closed" ? "잠김" : gas.state === "open" ? "열림" : "아직 관측되지 않았습니다";
      gasEl.className = "badge " + (gas.state === "closed" ? "badge--closed" : gas.state === "open" ? "badge--open" : "badge--unknown");
    }
    var gasBtn = $("gas-close");
    if (gasBtn && gas.state === "closed") gasBtn.disabled = true;

    var elevator = devices.elevator || {};
    var callEl = $("elevator-call");
    if (callEl) {
      var calling = elevator.call === "up" || elevator.call === "down";
      var floor = elevator.floorLabel;
      callEl.textContent = calling
        ? (elevator.call === "up" ? "상행" : "하행") + " 호출" + (floor ? " · " + (floor.charAt(0) === "B" ? "지하 " + floor.slice(1) + "층" : floor + "층") : "")
        : "호출 중에만 층을 알 수 있습니다";
      callEl.className = "tile__sub" + (calling ? "" : " unavailable");
    }
    var elevatorIcon = $("elevator-icon");
    if (elevatorIcon) elevatorIcon.style.setProperty("--tile-color",
      elevator.call === "up" || elevator.call === "down" ? "var(--state-active-color)" : "var(--state-inactive-color)");

    var household = (devices.entrances || {}).household || {};
    if (typeof household.doorOpenAtMs === "number") {
      setText("door-open-event", "문열림");
      var at = new Date(household.doorOpenAtMs);
      var pad = function (v) { return String(v).padStart(2, "0"); };
      setText("door-open-at", pad(at.getHours()) + ":" + pad(at.getMinutes()) + ":" + pad(at.getSeconds()) + " 관측");
    }

    var recording = tx.recording === "open";
    var dot = $("capture-dot");
    if (dot) dot.setAttribute("data-recording", recording ? "open" : "off");
    if (recording) {
      var mb = ((payload.byteCount || 0) / 1048576).toFixed(1);
      var secs = Math.round((payload.elapsedMs || 0) / 1000);
      setText("capture-status", "수집 중 · " + mb + " MB · " + (payload.recordCount || 0) + " 프레임 · "
        + Math.floor(secs / 60) + "분 " + (secs % 60) + "초 / " + Math.round((payload.limitMs || 0) / 3600000) + "시간");
    } else {
      setText("capture-status", "지금은 수집하지 않습니다");
    }
    var start = $("capture-start");
    var stop = $("capture-stop");
    var download = $("capture-download");
    if (start) start.disabled = recording;
    if (stop) stop.disabled = !recording;
    if (download) download.hidden = !(payload && payload.file && payload.file.finalized);
  };

  var draw = function (payload) {
    latest = payload;
    if (typeof payload.csrfToken === "string") csrfToken = payload.csrfToken;
    drawDevices(payload);
    drawBanner(payload);
    applyLock();
  };

  var pollTimer = null;
  var poll = function (immediate) {
    if (pollTimer !== null) { window.clearTimeout(pollTimer); pollTimer = null; }
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var deadline = window.setTimeout(function () { if (controller) controller.abort(); }, 5000);
    fetch("./api/status", { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function (response) { if (!response.ok) throw new Error("poll failed"); return response.json(); })
      .then(function (payload) { window.clearTimeout(deadline); draw(payload); }, function () { window.clearTimeout(deadline); })
      .then(function () { pollTimer = window.setTimeout(function () { poll(false); }, 1000); });
    if (immediate === true) return;
  };

  var capture = function (endpoint) {
    fetch(endpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } })
      .then(function () { poll(true); }, function () { poll(true); });
  };

  var on = function (id, handler) { var el = $(id); if (el) el.addEventListener("click", handler); };

  for (var n = 1; n <= 3; n += 1) {
    (function (light) {
      on("light-" + light + "-on", function () { run({ kind: "light", target: light, state: "on" }, "등 " + light + " · 켜기"); });
      on("light-" + light + "-off", function () { run({ kind: "light", target: light, state: "off" }, "등 " + light + " · 끄기"); });
    })(n);
  }
  on("lights-all-on", function () { run({ kind: "light", target: "all", state: "on" }, "조명 전체 켜기"); });
  on("lights-all-off", function () { run({ kind: "light", target: "all", state: "off" }, "조명 전체 끄기"); });
  on("batchoff-toggle", function () {
    var batch = (latest && latest.debug && latest.debug.devices && latest.debug.devices.batchOff) || {};
    var next = batch.state === "on" ? "off" : "on";
    run({ kind: "batchoff", state: next }, "일괄소등 · " + (next === "on" ? "걸기" : "풀기"));
  });

  for (var z = 1; z <= 4; z += 1) {
    (function (zone) {
      on("heat-zone-" + zone + "-on", function () { run({ kind: "heat", zone: zone, state: "on" }, "존 " + zone + " · 켜기"); });
      on("heat-zone-" + zone + "-off", function () { run({ kind: "heat", zone: zone, state: "off" }, "존 " + zone + " · 끄기"); });
      var step = function (delta) {
        var base = targets[zone] == null ? 23 : targets[zone];
        var next = Math.min(TEMP_MAX, Math.max(TEMP_MIN, base + delta));
        if (next === targets[zone]) return;
        targets[zone] = next;
        setText("heating-target-" + zone, String(next));
        run({ kind: "heat", zone: zone, temperatureC: next }, "존 " + zone + " · 목표 " + next + "°C");
      };
      on("heat-temp-" + zone + "-up", function () { step(1); });
      on("heat-temp-" + zone + "-down", function () { step(-1); });
    })(z);
  }
  on("heat-all-on", function () { run({ kind: "heat", target: "all", state: "on" }, "난방 전체 켜기"); });
  on("heat-all-off", function () { run({ kind: "heat", target: "all", state: "off" }, "난방 전체 끄기"); });

  on("gas-close", function () { run({ kind: "gas", state: "close" }, "가스 차단"); });
  on("elevator-up", function () { run({ kind: "elevator", direction: "up" }, "승강기 상행 호출"); });
  on("elevator-down", function () { run({ kind: "elevator", direction: "down" }, "승강기 하행 호출"); });

  on("banner-retry", function () { if (send.last) run(send.last, send.label.split(" · ")[0]); });
  on("capture-start", function () { capture("./api/capture"); });
  on("capture-stop", function () { capture("./api/stop"); });
  on("capture-download", function () { window.location.assign("./api/download"); });

  window.setInterval(tickSend, 100);
  poll(true);
})();
`;

const lightTile = (n: number): string => `
      <div class="tile">
        <span class="ha-tile__icon" id="light-icon-${n}" style="--tile-color:var(--state-inactive-color)">${svg(ICON.lightOff)}</span>
        <div class="tile__grow">
          <div class="tile__name">등 ${n}</div>
          <div class="tile__sub" id="light-state-${n}">아직 관측되지 않았습니다 · 0x19 · 채널 ${n}</div>
        </div>
        <div class="pair" role="group" aria-label="등 ${n}">
          <button class="btn btn--light" id="light-${n}-on" type="button" aria-pressed="false">켜기</button>
          <button class="btn" id="light-${n}-off" type="button" aria-pressed="false">끄기</button>
        </div>
      </div>`;

const zoneTile = (n: number): string => `
      <div class="tile tile--stacked">
        <div class="tile__head">
          <span class="ha-tile__icon" id="heat-icon-${n}" style="--tile-color:var(--state-inactive-color);width:32px;height:32px">${svg(ICON.radiator, 20)}</span>
          <div class="tile__grow">
            <div class="tile__name">존 ${n}</div>
            <div class="tile__sub" id="heat-state-${n}">아직 관측되지 않았습니다 · 0x18 · 존 ${n}</div>
          </div>
        </div>
        <div class="stepper">
          <button class="stepper__btn" id="heat-temp-${n}-down" type="button" aria-label="존 ${n} 목표 온도 내리기">−</button>
          <span class="stepper__value"><span id="heating-target-${n}">—</span> °C</span>
          <button class="stepper__btn" id="heat-temp-${n}-up" type="button" aria-label="존 ${n} 목표 온도 올리기">+</button>
        </div>
        <div class="pair" role="group" aria-label="존 ${n} 난방">
          <button class="btn btn--heat" id="heat-zone-${n}-on" type="button" aria-pressed="false">켜기</button>
          <button class="btn" id="heat-zone-${n}-off" type="button" aria-pressed="false">끄기</button>
        </div>
        <p class="hint">목표 온도를 바꾸면 이 존이 함께 켜집니다</p>
      </div>`;

export function renderAppHtml(): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>BESTIUM 월패드</title>
  <style>${HA_DESIGN_SYSTEM_CSS}${PAGE_CSS}</style>
</head>
<body>
<div class="app">
  <header class="app-header">
    <span class="app-header__mark">${svg(ICON.check, 26)}</span>
    <div class="app-header__title">
      <strong>BESTIUM 월패드</strong>
      <span>RS485 · 애드온 0.5.8</span>
    </div>
    <div class="link-chip" id="link-state" data-link="down">
      <span class="link-chip__dot"></span><span id="link-state-text">EW11 게이트웨이 · TCP · 연결 확인 중</span>
    </div>
  </header>

  <main>
    <div class="stack">

      <section class="banner" id="banner-state" data-state="disconnected" aria-live="polite" aria-busy="false">
        <div class="banner__wash"></div>
        <div class="banner__body">
          <span class="banner__icon" id="banner-icon">${svg(ICON.alert, 28)}</span>
          <div class="banner__text">
            <div class="banner__title" id="banner-title">게이트웨이에 연결되지 않았습니다</div>
            <div class="banner__detail" id="banner-detail">TCP 소켓이 열려 있지 않습니다. 보낼 곳이 없고, 들어오는 프레임도 없어 관측할 것이 없습니다. 접속 대상은 애드온 설정에서 정합니다.</div>
            <div class="banner__meter" id="banner-meter" hidden><span id="banner-meter-fill" style="width:0%"></span></div>
            <div class="banner__foot" id="banner-foot" hidden>
              <span>관측이 끝날 때까지 다른 조작은 잠깁니다</span><span id="banner-remaining"></span>
            </div>
            <div id="banner-actions" hidden>
              <button class="btn btn--quiet" id="banner-retry" type="button">${svg(ICON.refresh, 20)} 같은 제어 다시 보내기</button>
            </div>
          </div>
        </div>
      </section>

      <section class="ha-card card">
        <div class="card__head">
          <h2>조명</h2>
          <span class="card__note">상태 프레임 0x19 · 등 3개</span>
        </div>
        <div class="grid grid--lights">LIGHT_TILES</div>
        <div class="pair">
          <button class="btn" id="lights-all-on" type="button">전체 켜기</button>
          <button class="btn" id="lights-all-off" type="button">전체 끄기</button>
        </div>
        <div class="rule"></div>
        <div class="danger-row">
          <div class="danger-row__text">
            <div class="danger-row__title">${svg(ICON.alert, 18)}<span>일괄소등 · <span id="batchoff-state">아직 관측되지 않았습니다</span></span></div>
            <span class="hint">월패드가 제어하지 못하는 다른 방 조명까지 끕니다</span>
          </div>
          <button class="btn btn--danger" id="batchoff-toggle" type="button">걸기</button>
        </div>
      </section>

      <section class="ha-card card">
        <div class="card__head">
          <h2>난방</h2>
          <span class="card__note">상태 프레임 0x18 · 존 4개 · 5~40°C</span>
        </div>
        <div class="grid grid--zones">ZONE_TILES</div>
        <div class="pair">
          <button class="btn" id="heat-all-on" type="button">전체 켜기</button>
          <button class="btn" id="heat-all-off" type="button">전체 끄기</button>
        </div>
      </section>

      <section class="ha-card card">
        <div class="card__head"><h2>공용부 · 안전</h2></div>
        <div class="grid grid--common">

          <div class="tile tile--stacked">
            <div class="tile__head">
              <span class="ha-tile__icon" id="gas-icon" style="--tile-color:var(--state-inactive-color);width:32px;height:32px">${svg(ICON.valve, 20)}</span>
              <div class="tile__grow">
                <div class="tile__name">가스</div>
                <div class="tile__sub">0x1b · 밸브</div>
              </div>
              <span class="badge badge--unknown" id="gas-state">아직 관측되지 않았습니다</span>
            </div>
            <button class="btn btn--danger" id="gas-close" type="button">가스 차단</button>
            <p class="hint">여는 명령은 없습니다. 잠그면 현장에서 손으로 열어야 합니다</p>
          </div>

          <div class="tile tile--stacked">
            <div class="tile__head">
              <span class="ha-tile__icon" id="elevator-icon" style="--tile-color:var(--state-inactive-color);width:32px;height:32px">${svg(ICON.elevator, 20)}</span>
              <div class="tile__grow">
                <div class="tile__name">승강기</div>
                <div class="tile__sub unavailable" id="elevator-call">호출 중에만 층을 알 수 있습니다</div>
              </div>
            </div>
            <div class="pair" role="group" aria-label="승강기 호출">
              <button class="btn" id="elevator-up" type="button">${svg(ICON.arrowUp, 20)} 상행 호출</button>
              <button class="btn" id="elevator-down" type="button">${svg(ICON.arrowDown, 20)} 하행 호출</button>
            </div>
          </div>

          <div class="tile tile--stacked">
            <div class="tile__head">
              <span class="ha-tile__icon" style="--tile-color:var(--state-inactive-color);width:32px;height:32px">${svg(ICON.door, 20)}</span>
              <div class="tile__grow">
                <div class="tile__name">현관</div>
                <div class="tile__sub">0x1e · 문열림 통지</div>
              </div>
            </div>
            <div>
              <div class="event" id="door-open-event">아직 관측되지 않았습니다</div>
              <div class="event__at" id="door-open-at"></div>
            </div>
            <p class="hint">초인종은 이 회선에 나타나지 않습니다</p>
          </div>

        </div>
      </section>

      <div class="rule"></div>

      <section class="ha-card card capture">
        <h2>패킷 수집</h2>
        <div class="capture__status">
          <span class="capture__dot" id="capture-dot" data-recording="off"></span>
          <span id="capture-status">지금은 수집하지 않습니다</span>
        </div>
        <div class="capture__buttons">
          <button class="btn btn--quiet" id="capture-start" type="button">${svg(ICON.play, 20)} 시작</button>
          <button class="btn btn--quiet" id="capture-stop" type="button">${svg(ICON.stop, 20)} 중지</button>
          <button class="btn btn--quiet" id="capture-download" type="button" hidden>${svg(ICON.download, 20)} 내려받기</button>
        </div>
        <p class="hint">분석이 필요할 때 캡처를 떠서 내려받습니다. 제어와 관측은 캡처와 무관하게 동작합니다</p>
      </section>

    </div>
  </main>
</div>
<script>CLIENT_SCRIPT</script>
</body>
</html>`
    .replace("LIGHT_TILES", [1, 2, 3].map(lightTile).join(""))
    .replace("ZONE_TILES", [1, 2, 3, 4].map(zoneTile).join(""))
    .replace("CLIENT_SCRIPT", CLIENT_SCRIPT);
}

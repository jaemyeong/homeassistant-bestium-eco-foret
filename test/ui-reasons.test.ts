import assert from "node:assert/strict";
import test from "node:test";

import { renderAppHtml } from "../bestium-eco-foret/src/ui.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript
// stripping segfaults intermittently. See M4-E104 in `.agent/progress.md`.

// Every reason `evaluateReadiness`, `send`, and `issueSpeculativeChallenge` can produce.
// Collected from `reasons.push(...)` and the challenge `throw`s in `m2.ts`.
const SERVER_REASONS = [
  "master TX disabled",
  "speculative TX disabled",
  "unsafe TX disabled",
  "authorized user mismatch",
  "capture is not running",
  "one in-flight write only",
  "transport generation quarantined",
  "transport not connected",
  "capture append pending",
  "no current-generation valid RX frame",
  "no current valid RX frame",
  "current RX frame stale",
  "line busy: quiet interval not met",
  "TX cooldown active",
  "empty action frame",
  "recognized frame boundary collision",
  "current-generation 7F compatibility proof required",
];

test("M4.9 RED: every server readiness reason reaches the operator in Korean", () => {
  // One tap now routes every candidate through preview and challenge, so these strings
  // are the operator's primary answer to "why did nothing happen". The plan's acceptance
  // criterion is a Korean sentence at the blocked control, not a raw English reason.
  const html = renderAppHtml();
  const table = html.slice(html.indexOf("const REASON_KO = {"), html.indexOf("const reasonKo ="));
  assert.ok(table.length > 0, "the emitted page must carry a reason table");

  for (const reason of SERVER_REASONS) {
    const entry = new RegExp('"' + reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '":\\s*"([^"]+)"').exec(table);
    assert.ok(entry, `${reason} must have a Korean wording`);
    const korean = entry![1];
    assert.match(korean, /[가-힣]/, `${reason} must be worded in Korean, got ${korean}`);
    assert.doesNotMatch(korean, /[A-Za-z]{3}/, `${reason}'s wording must not just repeat the English, got ${korean}`);
  }
});

test("M4.9 RED: an unmapped reason still reaches the operator instead of vanishing", () => {
  // Failing closed here would mean a silent control, which is the defect this whole
  // round exists to remove. A raw English string beats an empty outcome line.
  const html = renderAppHtml();
  const source = html.slice(html.indexOf("const reasonKo ="), html.indexOf("const gateBlockers"));
  assert.match(source, /known \? known \+ " \(" \+ text \+ "\)" : text/, "an unknown reason must pass through unchanged");
  assert.match(source, /if \(!text\) return ""/, "an empty reason must not render an empty parenthesis");
});

test("M4.9 RED: the blocked-send paths word their reason rather than passing English through", () => {
  const html = renderAppHtml();
  for (const marker of [
    'const why = reasonsKo(preview.reasons) || "준비되지 않음"',
    'const why = reasonsKo(result.reasons) || reasonKo(result.reason)',
    '"보내지 못했습니다 · " + (reasonKo(challenge?.reason)',
  ]) {
    assert.ok(html.includes(marker), `blocked-send path must word its reason: ${marker}`);
  }
});

test("0.2.7 RED: a button's tinted surface sits behind its label, never over it", () => {
  // `button` sets position:relative with z-index:0, so it makes a stacking context and an
  // absolutely positioned ::before inside it paints above the inline label. At opacity .16
  // the label showed through; the .warning buttons run the tint at opacity 1, so all six of
  // them — the three entrance macros, both elevator calls and the candidate challenge —
  // rendered as blank orange rectangles from 0.2.5 until this was found in a real browser.
  const html = renderAppHtml();
  const rule = /button::before \{[^}]*\}/.exec(html);
  assert.ok(rule, "the button surface rule must exist");
  assert.match(rule![0], /z-index:\s*-1/, "the tint must sit behind the label");
  assert.match(rule![0], /position:absolute/, "and still cover the button box");
});

test("0.2.7 RED: the elevator call buttons are the only children of their group", () => {
  // The explanatory notice was placed inside the flex row and became a third item, which
  // squeezed both buttons down to one character per line.
  const html = renderAppHtml();
  const group = /<div class="seg" role="group" aria-label="승강기 호출">(.*?)<\/div>/s.exec(html);
  assert.ok(group, "the elevator control group must exist");
  assert.equal((group![1].match(/<button/g) ?? []).length, 2, "two buttons");
  assert.doesNotMatch(group![1], /<p[ >]/, "no paragraph may share the flex row");
});

test("0.2.7 RED: a sentence-length notice is allowed to wrap", () => {
  // .pill is a 32px fixed-height badge. Three notices in this release are sentences.
  const html = renderAppHtml();
  assert.match(html, /\.pill\.block \{[^}]*height:auto/, "the wrapping variant must exist");
  for (const marker of ["네 구역 모두 inferred_candidate", "이 버스에서 0x7F 프레임을", "하행은 레거시 베스티움이"]) {
    const at = html.indexOf(marker);
    assert.ok(at > 0, marker);
    assert.match(html.slice(Math.max(0, at - 60), at), /class="pill warn block"/, `${marker} must use the wrapping variant`);
  }
});

test("0.2.7 RED: the entrance buttons say that they open a door", () => {
  // They send the legacy door-open macro. The old labels named a state instead, so a
  // reader had no way to know that pressing one unlocks the entrance.
  const html = renderAppHtml();
  for (const [id, label] of [
    ["household-inactive", "세대 현관문 열기"],
    ["household-ringing", "세대 현관문 열기"],
    ["communal-ringing", "공동 현관문 열기"],
  ] as const) {
    const button = new RegExp(`<button id="${id}"[^>]*>([^<]*)`).exec(html);
    assert.ok(button, id);
    assert.match(button![1], new RegExp(label), `${id} must name the door it opens`);
  }
});

test("0.2.8 RED: a busy line does not disable a control", () => {
  // The server now waits for the quiet window instead of refusing, so the page has no
  // reason to grey a button out for a wait that ends in about 20 ms.
  const html = renderAppHtml();
  const ready = /const readyForAction = \(preview\) => \{[\s\S]*?return true; \};/.exec(html);
  assert.ok(ready, "readyForAction must exist");
  assert.doesNotMatch(ready![0], /tx\.quiet/, "a momentarily busy line must not disable the control");
  const start = html.indexOf("const gateBlockers");
  assert.ok(start > 0, "gateBlockers must exist");
  const blockers = html.slice(start, html.indexOf("return out;", start));
  assert.doesNotMatch(blockers, /tx\.quiet/, "and it must not be announced as a blocker");
});

test("0.2.8 RED: an indeterminate write can be acknowledged and released", () => {
  // The lock is correct — after a partial write the device state is genuinely unknown —
  // but nothing could ever clear it, so one failure killed the page until a reload.
  const html = renderAppHtml();
  assert.match(html, /id="tx-unlock"/, "the release panel must exist");
  assert.match(html, /id="tx-unlock-ack"/, "with an operator acknowledgement");
  assert.match(html, /clearIndeterminate\(\)/, "wired to a handler");
  const clear = /const clearIndeterminate = \(\) => \{[\s\S]*?\};/.exec(html);
  assert.ok(clear, "the handler must exist");
  assert.match(clear![0], /txRetryLocked = false/, "and it must actually release the lock");
  // It must stay an acknowledgement: nothing may clear the lock on its own.
  assert.equal((html.match(/txRetryLocked = false/g) ?? []).length, 2, "declaration and the acknowledgement only");
});

test("0.2.8 RED: the confirmation phrase field can show the whole phrase", () => {
  const html = renderAppHtml();
  assert.match(html, /\.actions > label \{[^}]*flex:1 1 100%/, "the field takes its own row");
  assert.match(html, /\.actions > label input \{[^}]*width:100%/, "and fills it");
});

test("0.2.8 RED: the candidate warning describes the risk instead of naming a detection", () => {
  // "wrong-device/collision warning" is fixed boilerplate on every candidate, not something
  // that was detected, and it reads like a collision the add-on observed.
  const html = renderAppHtml();
  assert.doesNotMatch(html, /wrong-device\/collision warning/, "no invented detection");
  assert.match(html, /관측으로 확인하지 않은 제어입니다/, "say what is actually true");
});

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
  "gateway link is not up",
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

test("M5 RED: every path that refuses a send words its reason in Korean", () => {
  // Two ways a send can come back without reaching the bus: the server refuses it, or the
  // request itself fails. Both have to say why in the operator's language, because a silent
  // control is the defect this page exists to remove. The exact call sites changed with the
  // rewrite; what has to hold is that neither path leaves the reason unworded.
  const html = renderAppHtml();
  const run = html.slice(html.indexOf("var run = function"), html.indexOf("var TEMP_MIN"));
  assert.ok(run.length > 0, "the send path must exist");
  const refusals = run.match(/reasonsKo\([^)]*\)/g) ?? [];
  assert.ok(refusals.length >= 2, `both refusal paths must word their reason, found ${refusals.length}`);
  assert.match(run, /"준비되지 않음"/, "and fall back to a Korean phrase rather than an empty line");
  assert.match(run, /보내지 못했습니다/, "the operator is told the write never left");
});

test("M5 RED: a control's tint is its own background, not a layer over the label", () => {
  // 0.2.5 painted the tint with an absolutely positioned `button::before`. `button` sets
  // position:relative with z-index:0, so it makes a stacking context and the pseudo-element
  // painted above the inline label: six buttons rendered as blank orange rectangles until
  // someone opened the page in a real browser. The page no longer has that shape — an active
  // control sets its own `background`, so there is nothing that can cover its text.
  const html = renderAppHtml();
  assert.doesNotMatch(html, /\.btn::before/, "a control must not paint through a pseudo-element");
  assert.match(html, /\.btn\[aria-pressed="true"\]\{background:/, "an active control tints its own surface");
});

test("M5 RED: a control group holds controls and nothing else", () => {
  // The explanatory notice was once placed inside the flex row and became a third item,
  // which squeezed both elevator buttons down to one character per line.
  const html = renderAppHtml();
  const groups = html.match(/<div class="pair" role="group"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g) ?? [];
  assert.ok(groups.length >= 4, "the light, zone and elevator groups are all pairs");
  const elevator = /<div class="pair" role="group" aria-label="승강기 호출">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(elevator, "the elevator control group must exist");
  assert.equal((elevator![1].match(/<button/g) ?? []).length, 2, "two buttons");
  assert.doesNotMatch(elevator![1], /<p[ >]/, "no paragraph may share the flex row");
});

test("M5 RED: a sentence-length notice wraps instead of being clipped", () => {
  // Three of this page's notices are full sentences. A fixed-height badge would cut them.
  const html = renderAppHtml();
  assert.match(html, /\.hint\{[^}]*text-wrap:pretty/, "notices wrap");
  assert.doesNotMatch(html, /\.hint\{[^}]*height:\s*\d/, "and are never given a fixed height");
  for (const marker of [
    "월패드가 제어하지 못하는 다른 방 조명까지 끕니다",
    "여는 명령은 없습니다. 잠그면 현장에서 손으로 열어야 합니다",
    "분석이 필요할 때 캡처를 떠서 내려받습니다",
  ]) {
    const at = html.indexOf(marker);
    assert.ok(at > 0, marker);
    assert.match(html.slice(Math.max(0, at - 120), at), /class="hint"/, marker + " must use the wrapping notice");
  }
});

test("M5 RED: a busy line does not disable a control", () => {
  // The server waits for the quiet window instead of refusing, so the page has no reason to
  // grey a button out for a wait that ends in about 20 ms.
  const html = renderAppHtml();
  const start = html.indexOf("const gateBlockers");
  assert.ok(start > 0, "gateBlockers must exist");
  const blockers = html.slice(start, html.indexOf("return out;", start));
  assert.doesNotMatch(blockers, /tx\.quiet/, "a momentarily busy line must not be announced as a blocker");
  const locked = html.slice(html.indexOf("var locked = function"), html.indexOf("var applyLock"));
  assert.doesNotMatch(locked, /tx\.quiet/, "nor may it disable the control");
});

test("M5 RED: a capture that is not running disables nothing but the capture card", () => {
  // This is the requirement the milestone exists for. Control and observation ride on the
  // link; a recording is something the operator starts on top of them.
  const html = renderAppHtml();
  const locked = html.slice(html.indexOf("var locked = function"), html.indexOf("var applyLock"));
  assert.doesNotMatch(locked, /recording/, "no control may be gated on a recording");
  assert.doesNotMatch(locked, /capture/i, "nor on a capture by any other name");
  const applyLock = html.slice(html.indexOf("var applyLock"), html.indexOf("var postAction"));
  for (const id of ["capture-start", "capture-stop", "capture-download"]) {
    assert.doesNotMatch(applyLock, new RegExp(id), id + " is the capture card's own, not a gated control");
  }
});

test("M5 RED: the banner opens on a link that is down, not a capture that is off", () => {
  const html = renderAppHtml();
  const banner = /<section class="banner" id="banner-state" data-state="([a-z]+)"/.exec(html);
  assert.ok(banner, "the banner must exist");
  assert.equal(banner![1], "disconnected", "the first state is a link that is not up");
  assert.match(html, /게이트웨이에 연결되지 않았습니다/);
  assert.doesNotMatch(html, /수집이 실행 중이 아닙니다|수집 꺼짐/, "no state may say the collection is off");
  // Six states, and no seventh: `doorbell` left with the observation that the bell never
  // appears on this line.
  const states = html.slice(html.indexOf("var BANNER = {"), html.indexOf("var bannerStateNow"));
  for (const state of ["disconnected", "quiet", "ready", "sending", "confirmed", "unconfirmed"]) {
    assert.match(states, new RegExp(state + ":"), state + " must be a banner state");
  }
  assert.doesNotMatch(states, /doorbell/, "the bell is not on this line");
});

test("M5 RED: the page counts the eight write paths measurement confirmed", () => {
  const html = renderAppHtml();
  assert.match(html, /var OBSERVED_WRITES = 8;/, "eight write paths, not six devices");
  assert.match(html, /관측 확인 " \+ OBSERVED_WRITES \+ " \/ " \+ OBSERVED_WRITES/);
});

// The requirements below survived the rewrite even though the tests that carried them did
// not: they were written against a screen with a review flow, a challenge dialog and a
// capture lease, and all three are gone. What each one was protecting is still true of the
// page that replaced it, so it is restated here against the new shape.

test("M5 RED: a send ends at confirmed or unconfirmed, never silently", () => {
  // A control that goes quiet after a press is the defect this whole round exists to remove.
  // Both arms of the request settle the banner, and a refusal settles it too.
  const html = renderAppHtml();
  const run = html.slice(html.indexOf("var run = function"), html.indexOf("var TEMP_MIN"));
  // Three arms: the server refuses, the write resolves, or the request itself fails.
  const settles = run.match(/settle\(/g) ?? [];
  assert.equal(settles.length, 3, `every arm must settle, found ${settles.length}`);
  assert.match(run, /settle\(ok \? "confirmed" : "unconfirmed"\)/, "the resolved arm reports what was observed");
  assert.match(run, /postAction\(action, "live"\)\.then\(function \(result\) \{[\s\S]*?\}, function \(error\)/,
    "the request's failure arm exists and is not empty");
});

test("M5 RED: a send in flight locks the controls and nothing else", () => {
  // One write at a time is the server's rule; the page has to make it visible rather than
  // queue presses the operator cannot see. The capture card is deliberately outside it.
  const html = renderAppHtml();
  const locked = html.slice(html.indexOf("var locked = function"), html.indexOf("var applyLock"));
  assert.match(locked, /send\.state === "sending"/, "a write in flight locks the controls");
  const applyLock = html.slice(html.indexOf("var applyLock"), html.indexOf("var postAction"));
  assert.match(applyLock, /light-1-on/, "the light controls are locked");
  assert.match(applyLock, /heat-zone-/, "and the zones");
  assert.match(applyLock, /gas-close/, "and the gas valve");
  assert.doesNotMatch(applyLock, /capture-/, "the capture card is never locked by a send");
});

test("M5 RED: the page starts fail-closed and opens only on what the status says", () => {
  // Before the first poll answers there is no evidence of anything, so nothing may look
  // ready and no state may be presented as observed.
  const html = renderAppHtml();
  assert.match(html, /data-state="disconnected"/, "the banner starts disconnected");
  assert.match(html, /data-link="down"/, "and the link chip starts down");
  assert.equal((html.match(/아직 관측되지 않았습니다/g) ?? []).length >= 8, true,
    "every device reads as unobserved until a frame arrives");
  const locked = html.slice(html.indexOf("var locked = function"), html.indexOf("var applyLock"));
  assert.match(locked, /tx\.link !== "up"/, "a link that is not up locks every control");
  assert.match(locked, /tx\.enabled !== true/, "so does transmission being off");
  assert.match(locked, /tx\.authorized !== true/, "so does an unauthorized user");
});

test("M5 RED: a poll that fails leaves the last state standing rather than inventing one", () => {
  // Redrawing from a failed poll would show fabricated state; the page keeps what it last
  // saw and tries again a second later.
  const html = renderAppHtml();
  const poll = html.slice(html.indexOf("var poll = function"), html.indexOf("var capture = function"));
  assert.match(poll, /function \(payload\) \{ window\.clearTimeout\(deadline\); draw\(payload\); \}, function \(\) \{ window\.clearTimeout\(deadline\); \}/,
    "the failure arm draws nothing");
  assert.match(poll, /window\.setTimeout\(function \(\) \{ poll\(false\); \}, 1000\)/, "and it retries");
});

test("M5 RED: the capture card drives only the capture", () => {
  const html = renderAppHtml();
  const capture = html.slice(html.indexOf("var capture = function"), html.indexOf("var on = function"));
  assert.match(capture, /\.\/api\/capture|endpoint/, "it posts to the capture endpoints");
  assert.match(capture, /poll\(true\)/, "and re-reads the status either way");
  assert.doesNotMatch(capture, /send\./, "it never touches the send state");
});

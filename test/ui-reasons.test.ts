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

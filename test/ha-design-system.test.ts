import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HA_DESIGN_SYSTEM_CSS } from "../bestium-eco-foret/src/ha-design-system.ts";
import {
  SOURCE_ORDER,
  emitModule,
  localiseBodyFont,
  mergeCss,
  stripWebFonts,
} from "../tools/design/build-css.ts";

const MIRROR = new URL("../.agent/design-mirror/_ds/", import.meta.url);
const readMirror = (path: string): string => readFileSync(new URL(path, MIRROR), "utf8");

// The check that catches a hand edit or a truncated copy: rebuild from the
// mirror and compare. Anything that drifted — in the merge, in the mirror, or
// in the committed module — shows up as a mismatch rather than as a page that
// renders subtly wrong months later.
test("the committed module is what the mirror produces", () => {
  const rebuilt = emitModule(mergeCss(readMirror));
  const committed = readFileSync(
    new URL("../bestium-eco-foret/src/ha-design-system.ts", import.meta.url),
    "utf8",
  );
  assert.equal(rebuilt, committed, "run `node tools/design/emit.ts` and commit the result");
});

test("the sheets appear in @import order", () => {
  const positions = SOURCE_ORDER.map((path) =>
    HA_DESIGN_SYSTEM_CSS.indexOf(`/* ===== _ds/${path} ===== */`),
  );
  for (const [i, at] of positions.entries()) {
    assert.notEqual(at, -1, `${SOURCE_ORDER[i]} is missing`);
    if (i > 0) assert.ok(at > positions[i - 1]!, `${SOURCE_ORDER[i]} is out of order`);
  }
});

// An Ingress page that fetches anything fails on a network the add-on cannot
// reach, and does it silently — the text just renders in a fallback face.
// Comments are stripped first: the notes marking what was removed name the
// at-rules they removed, and a plain substring search would match the note
// rather than a rule. What matters is what the browser executes.
const RULES_ONLY = HA_DESIGN_SYSTEM_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

test("nothing is fetched from the network", () => {
  assert.equal(RULES_ONLY.includes("http://"), false);
  assert.equal(RULES_ONLY.includes("https://"), false);
  assert.equal(RULES_ONLY.includes("@import"), false);
  assert.equal(RULES_ONLY.includes("@font-face"), false);
  assert.equal(/url\(/.test(RULES_ONLY), false);
});

// The comments still have to be there — that is how a reader learns the sheet
// was edited at all.
test("the notes survive the merge", () => {
  assert.ok(HA_DESIGN_SYSTEM_CSS.includes("@import"), "the note names the @import it removed");
  assert.ok(HA_DESIGN_SYSTEM_CSS.includes("@font-face"), "and the @font-face");
});

test("both removals say what they removed", () => {
  const notes = HA_DESIGN_SYSTEM_CSS.match(/removed by tools\/design\/build-css\.ts:/g) ?? [];
  assert.equal(notes.length, 2);
});

test("the body font resolves without a download", () => {
  const line = HA_DESIGN_SYSTEM_CSS.match(/^--ha-font-family-body:(.*)$/m)?.[1] ?? "";
  assert.ok(line.includes("system-ui"), "needs an OS fallback");
  assert.ok(line.includes("Apple SD Gothic Neo"), "needs a Korean face on macOS and iOS");
  assert.ok(line.includes("Malgun Gothic"), "needs a Korean face on Windows");
});

// The names the page will actually write. If a token or a class went missing in
// the merge, the page still renders — just wrong — so name them here.
const REQUIRED = [
  "--primary-color",
  "--primary-text-color",
  "--secondary-text-color",
  "--card-background-color",
  "--primary-background-color",
  "--secondary-background-color",
  "--divider-color",
  "--error-color",
  "--warning-color",
  "--success-color",
  "--state-light-active-color",
  "--state-climate-heat-color",
  "--state-inactive-color",
  "--state-unavailable-color",
  "--ha-card-background",
  "--ha-card-border-radius",
  "--ha-font-size-m",
  "--ha-space-4",
  "--ha-border-radius-lg",
  "--ha-control-transition",
  ".ha-card",
  ".ha-tile__icon",
  ".ha-tile__primary",
  ".ha-tile__secondary",
  ".ha-control-button",
  ".ha-control-switch",
  ".ha-control-number-buttons",
  ".ha-chip",
  ".ha-bar",
  ".ha-button",
];

test("every token and class the page needs survived the merge", () => {
  for (const name of REQUIRED) {
    assert.ok(HA_DESIGN_SYSTEM_CSS.includes(name), `${name} is missing`);
  }
});

// Dark is not a separate sheet: it is a media query inside three of the nine.
test("dark mode comes through as prefers-color-scheme", () => {
  const blocks = HA_DESIGN_SYSTEM_CSS.match(/@media \(prefers-color-scheme:dark\)/g) ?? [];
  assert.equal(blocks.length, 3, "semantic-colors, theme and elevation each carry one");
  assert.ok(HA_DESIGN_SYSTEM_CSS.includes("@media (prefers-reduced-motion:reduce)"));
});

test("braces balance", () => {
  const opens = (RULES_ONLY.match(/\{/g) ?? []).length;
  const closes = (RULES_ONLY.match(/\}/g) ?? []).length;
  assert.equal(opens, closes);
});

test("the transforms only touch what they name", () => {
  assert.equal(stripWebFonts("body{color:red}\n"), "body{color:red}\n");
  assert.equal(localiseBodyFont("body{color:red}\n"), "body{color:red}\n");
  const stripped = stripWebFonts(readMirror("tokens/fonts.css"));
  assert.equal(stripped.includes("googleapis"), false);
  assert.equal(stripped.includes("Roboto[wdth,wght].ttf"), false);
});

// A backtick or `${` in the CSS would end the String.raw literal early and turn
// the rest of the stylesheet into TypeScript.
test("emitModule refuses CSS that would break the literal", () => {
  assert.throws(() => emitModule("body{content:`x`}"), /backtick/);
  assert.throws(() => emitModule("body{content:'${x}'}"), /placeholder/);
});

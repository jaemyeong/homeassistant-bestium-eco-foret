import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// The tests run against the repository; the add-on runs from an image. Nothing checked that
// the second contained what the first proved, and the gap was real: `tx-queue.ts` was left
// out of the image on the day it was written and `ha-design-system.ts` on the day after.
// 0.3.0's first deploy died at import with `Cannot find module
// '/app/src/ha-design-system.ts'` — a green suite and a dead add-on at the same time.

const ADDON = new URL("../bestium-eco-foret/", import.meta.url);
const SRC = new URL("src/", ADDON);
const dockerfile = readFileSync(new URL("Dockerfile", ADDON), "utf8");

/** Every local module reachable from the entry point, following imports. */
function runtimeClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const source = readFileSync(new URL(name, SRC), "utf8");
    for (const match of source.matchAll(/from\s+"\.\/([A-Za-z0-9.-]+\.ts)"/g)) {
      queue.push(match[1]!);
    }
  }
  return seen;
}

test("M5 RED: the image carries every module the entry point can reach", () => {
  const entry = /CMD \["node", "src\/([A-Za-z0-9.-]+\.ts)"\]/.exec(dockerfile)?.[1];
  assert.ok(entry, "the Dockerfile must name its entry point");
  const needed = runtimeClosure(entry!);
  assert.ok(needed.size >= 6, `the closure looks too small: ${[...needed].join(", ")}`);

  // The list is deliberate: `.dockerignore` denies by default and the Dockerfile re-includes,
  // so the image carries only what it runs. What was missing is the check that the list keeps
  // up with the imports, which is this.
  const dockerignore = readFileSync(new URL(".dockerignore", ADDON), "utf8");
  for (const name of needed) {
    const escaped = name.replace(/[.]/g, "\\.");
    assert.match(
      dockerfile,
      new RegExp(`^COPY src/${escaped} `, "m"),
      `${name} is imported at runtime but never copied into the image`,
    );
    assert.match(
      dockerignore,
      new RegExp(`^!src/${escaped}$`, "m"),
      `${name} is copied but excluded by .dockerignore, so the COPY finds nothing`,
    );
  }
});

test("M5 RED: nothing in the add-on's source is unreachable from the entry point", () => {
  // The other direction: a module that ships but nothing imports is either dead or a missing
  // import somewhere. `tx-canary.ts` is the one exception and it says so here.
  const entry = /CMD \["node", "src\/([A-Za-z0-9.-]+\.ts)"\]/.exec(dockerfile)?.[1];
  const reachable = runtimeClosure(entry!);
  const onDisk = readdirSync(SRC).filter((name) => name.endsWith(".ts"));
  const orphans = onDisk.filter((name) => !reachable.has(name));
  assert.deepEqual(orphans, ["tx-canary.ts"],
    `unreachable modules: ${orphans.join(", ")} — each is either dead or missing an import`);
});

test("M5 RED: the image's version label matches the add-on's own", () => {
  // Home Assistant reads the label to decide whether an update is available. A config that
  // says 0.3.1 behind an image labelled 0.3.0 offers an update that changes nothing.
  const config = JSON.parse(readFileSync(new URL("config.json", ADDON), "utf8")) as Record<string, unknown>;
  const label = /LABEL io\.hass\.version="([^"]+)"/.exec(dockerfile)?.[1];
  assert.equal(label, config.version, "the image label and the add-on version must agree");
  const pkg = JSON.parse(readFileSync(new URL("package.json", ADDON), "utf8")) as Record<string, unknown>;
  assert.equal(pkg.version, config.version, "and so must the package");
});

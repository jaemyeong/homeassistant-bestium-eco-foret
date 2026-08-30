/* Writes bestium-eco-foret/src/ha-design-system.ts from the mirror. */
import { readFileSync, writeFileSync } from "node:fs";
import { emitModule, mergeCss } from "./build-css.ts";

const MIRROR = new URL("../../.agent/design-mirror/_ds/", import.meta.url);
const OUT = new URL("../../bestium-eco-foret/src/ha-design-system.ts", import.meta.url);

const css = mergeCss((path) => readFileSync(new URL(path, MIRROR), "utf8"));
writeFileSync(OUT, emitModule(css));
process.stdout.write(`wrote ${OUT.pathname} (${css.length} chars of CSS)\n`);

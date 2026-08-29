import assert from "node:assert/strict";
import test from "node:test";

import { parseBuslabConfig, createRedactor } from "../tools/buslab/config.ts";

// The gateway address is deliberately absent from this repository, so the tool reads it from
// an ignored file or the environment and must never write it back out. See `M4-E124` and the
// redaction decision recorded for `0.2.5`.

const PATH = "/repo/tools/buslab/config.json";

test("E1 RED: a missing configuration says where to put one", () => {
  let error: Error | null = null;
  try {
    parseBuslabConfig({ configPath: PATH });
  } catch (thrown) {
    error = thrown as Error;
  }
  assert.ok(error, "a missing configuration must not be treated as an empty one");
  assert.match(error!.message, /BUSLAB_HOST/, "the environment variable must be named");
  assert.match(error!.message, /tools\/buslab\/config\.json/, "the file path must be named");
});

test("E1 RED: the environment wins over the file, so a run can be pointed elsewhere", () => {
  const config = parseBuslabConfig({
    configPath: PATH,
    file: { host: "from-file", port: 1111 },
    env: { BUSLAB_HOST: "from-env", BUSLAB_PORT: "2222" },
  });
  assert.deepEqual(config, { host: "from-env", port: 2222 });
});

test("E1 RED: the file is used when the environment is silent", () => {
  const config = parseBuslabConfig({ configPath: PATH, file: { host: "gateway", port: 8899 } });
  assert.deepEqual(config, { host: "gateway", port: 8899 });
});

test("E1 RED: a host that cannot be dialled is refused rather than carried forward", () => {
  for (const host of ["", "   ", "has space", "x".repeat(254)]) {
    assert.throws(
      () => parseBuslabConfig({ configPath: PATH, file: { host, port: 8899 } }),
      /ew11 host|host/i,
      JSON.stringify(host),
    );
  }
});

test("E1 RED: a port outside the dialable range is refused", () => {
  for (const port of [0, -1, 65_536, 1.5, "8899x", null]) {
    assert.throws(
      () => parseBuslabConfig({ configPath: PATH, file: { host: "gateway", port } }),
      /port/i,
      JSON.stringify(port),
    );
  }
});

test("E1 RED: a numeric string from the environment is accepted, a malformed one is not", () => {
  assert.equal(parseBuslabConfig({ configPath: PATH, env: { BUSLAB_HOST: "g", BUSLAB_PORT: "8899" } }).port, 8899);
  assert.throws(() => parseBuslabConfig({ configPath: PATH, env: { BUSLAB_HOST: "g", BUSLAB_PORT: "88 99" } }), /port/i);
});

test("E1 RED: the redactor removes the address from anything on its way to disk", () => {
  // Node puts the address straight into socket errors: `connect ECONNREFUSED 10.0.0.5:8899`.
  // Every string that reaches an artifact goes through this first.
  const redact = createRedactor({ host: "10.0.0.5", port: 8899 });
  assert.equal(redact("connect ECONNREFUSED 10.0.0.5:8899"), "connect ECONNREFUSED <gateway>:<port>");
  assert.equal(redact("getaddrinfo ENOTFOUND 10.0.0.5"), "getaddrinfo ENOTFOUND <gateway>");
  assert.ok(!redact("read from 10.0.0.5 twice: 10.0.0.5").includes("10.0.0.5"), "every occurrence goes");
  assert.equal(redact("nothing to hide"), "nothing to hide");
});

test("E1 RED: a hostname is redacted too, and a bare port number is left alone", () => {
  const redact = createRedactor({ host: "ew11.local", port: 8899 });
  assert.ok(!redact("connect EHOSTUNREACH ew11.local:8899").includes("ew11.local"));
  // 8899 on its own is not secret and stripping it would corrupt unrelated numbers.
  assert.equal(redact("wrote 8899 bytes"), "wrote 8899 bytes");
});

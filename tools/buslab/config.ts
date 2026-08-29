// Where the gateway lives is not in this repository and must not end up in one of its
// artifacts either. The address comes from an ignored file or the environment, and every
// string that could carry it back out goes through `createRedactor` first.

export type BuslabConfig = {
  host: string;
  port: number;
};

type ConfigInput = {
  configPath: string;
  file?: unknown;
  env?: Record<string, string | undefined>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseHost(raw: unknown, configPath: string): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new TypeError(
      `buslab needs the gateway host. Set BUSLAB_HOST, or put {"host": "...", "port": 8899} in ${configPath}.`,
    );
  }
  const host = raw.trim();
  if (host.length > 253) throw new TypeError("buslab host must be at most 253 characters");
  if (/\s/.test(host)) throw new TypeError("buslab host must not contain whitespace");
  return host;
}

function parsePort(raw: unknown, configPath: string): number {
  const value = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError(
      `buslab needs a gateway port between 1 and 65535. Set BUSLAB_PORT, or put it in ${configPath}.`,
    );
  }
  return value;
}

export function parseBuslabConfig(input: ConfigInput): BuslabConfig {
  const file = asRecord(input.file) ?? {};
  const env = input.env ?? {};
  return {
    host: parseHost(env.BUSLAB_HOST ?? file.host, input.configPath),
    port: parsePort(env.BUSLAB_PORT ?? file.port, input.configPath),
  };
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Node writes the address straight into socket errors (`connect ECONNREFUSED 10.0.0.5:8899`),
 * so anything on its way to an artifact passes through here. The port is only removed where it
 * follows the host: on its own it is not secret, and stripping it would corrupt byte counts.
 */
export function createRedactor(config: BuslabConfig): (text: string) => string {
  const host = escapeForRegExp(config.host);
  const withPort = new RegExp(`${host}:${config.port}`, "g");
  const bare = new RegExp(host, "g");
  return (text) => text.replace(withPort, "<gateway>:<port>").replace(bare, "<gateway>");
}

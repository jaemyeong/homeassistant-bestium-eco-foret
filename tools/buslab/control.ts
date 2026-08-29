// The control channel. One JSON object per line, over a unix domain socket in the run
// directory. A unix socket rather than a TCP port because the address needs no configuration,
// the path makes the run it belongs to obvious, and nothing outside this machine can reach it.

import { createServer, createConnection } from "node:net";

import { parseControlLine, type ControlReply, type ControlRequest } from "./daemon.ts";

export type ControlServer = {
  close(): Promise<void>;
};

/** Serve one run's control socket. Each connection may send many request lines. */
export function serveControl(opts: {
  socketPath: string;
  handle(request: ControlRequest): Promise<ControlReply>;
  onError?(error: Error): void;
}): Promise<ControlServer> {
  const server = createServer((connection) => {
    let buffer = "";
    connection.setEncoding("utf8");
    connection.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        const parsed = parseControlLine(line);
        if (!parsed.ok) {
          connection.write(`${JSON.stringify({ ok: false, reason: parsed.reason })}\n`);
          continue;
        }
        void opts.handle(parsed.request).then(
          (reply) => connection.write(`${JSON.stringify(reply)}\n`),
          (error: unknown) => connection.write(
            `${JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "handler failed" })}\n`,
          ),
        );
      }
    });
    connection.on("error", (error) => opts.onError?.(error));
  });

  return new Promise<ControlServer>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.socketPath, () => {
      server.removeListener("error", reject);
      server.on("error", (error) => opts.onError?.(error));
      resolve({
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** Send one request to a running daemon and read its single reply. */
export function requestControl(opts: {
  socketPath: string;
  request: ControlRequest;
  timeoutMs?: number;
}): Promise<ControlReply> {
  return new Promise<ControlReply>((resolve, reject) => {
    const connection = createConnection(opts.socketPath);
    let buffer = "";
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      connection.destroy();
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`no reply from the run within ${opts.timeoutMs ?? 5_000} ms`))),
      opts.timeoutMs ?? 5_000,
    );
    connection.setEncoding("utf8");
    connection.on("connect", () => connection.write(`${JSON.stringify(opts.request)}\n`));
    connection.on("data", (chunk: string) => {
      buffer += chunk;
      const index = buffer.indexOf("\n");
      if (index < 0) return;
      const line = buffer.slice(0, index);
      clearTimeout(timer);
      finish(() => {
        try {
          resolve(JSON.parse(line) as ControlReply);
        } catch {
          reject(new Error("the run replied with something that is not JSON"));
        }
      });
    });
    connection.on("error", (error: Error) => {
      clearTimeout(timer);
      finish(() => reject(error));
    });
    connection.on("close", () => {
      clearTimeout(timer);
      finish(() => reject(new Error("the run closed the control channel without replying")));
    });
  });
}

/**
 * Is a daemon already listening on this run's control socket? A second `start` under the same
 * name would delete the live socket and append to the same `run.ndjson`, interleaving two
 * streams into one file with nothing to say afterwards which read came from which.
 */
export async function isRunAlive(socketPath: string): Promise<boolean> {
  try {
    const reply = await requestControl({ socketPath, request: { cmd: "status" }, timeoutMs: 700 });
    return reply.ok === true;
  } catch {
    return false;
  }
}

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4317;
export const PORT_FALLBACK_ATTEMPTS = 20;

export interface ServerOptions {
  /** Preferred port. If taken, the server retries `port + 1`, `port + 2`, ... up to `maxAttempts`. */
  port?: number;
  /** Number of sequential ports to try before failing. Default 20. */
  maxAttempts?: number;
  /** Bind host. Forced to loopback in MVP for dev-only security posture. */
  host?: typeof LOOPBACK_HOST;
}

export interface StartedServer {
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/**
 * Start an HTTP server bound to 127.0.0.1 on the first available port at-or-after `port`.
 *
 * Falls back to `port + 1`, `port + 2`, ... up to `maxAttempts`. Returns the actual bound
 * port + a close() helper. Non-EADDRINUSE errors propagate immediately.
 */
export async function startServer(
  handler: RequestHandler,
  options: ServerOptions = {},
): Promise<StartedServer> {
  const host = options.host ?? LOOPBACK_HOST;
  const desiredPort = options.port ?? DEFAULT_PORT;
  const maxAttempts = options.maxAttempts ?? PORT_FALLBACK_ATTEMPTS;

  let lastError: NodeJS.ErrnoException | null = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = desiredPort + i;
    try {
      const started = await listenOn(handler, host, port);
      return started;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EADDRINUSE') throw err;
      lastError = err;
    }
  }
  const message = `No free port found in [${desiredPort}, ${desiredPort + maxAttempts - 1}] on ${host}`;
  throw new Error(message, lastError ? { cause: lastError } : undefined);
}

function listenOn(handler: RequestHandler, host: string, port: number): Promise<StartedServer> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      void (async (): Promise<void> => {
        try {
          await handler(req, res);
        } catch (handlerError: unknown) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            const message =
              handlerError instanceof Error ? handlerError.message : String(handlerError);
            res.end(JSON.stringify({ error: message }));
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      })();
    });

    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      reject(err);
    };

    const onListening = (): void => {
      server.removeListener('error', onError);
      const address = server.address() as AddressInfo;
      const actualPort = address.port;
      const url = `http://${host}:${actualPort}`;
      resolve({
        server,
        host,
        port: actualPort,
        url,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((closeError) => {
              if (closeError) rejectClose(closeError);
              else resolveClose();
            });
          }),
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

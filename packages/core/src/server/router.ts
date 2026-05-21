import type { IncomingMessage, ServerResponse } from 'node:http';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'PATCH';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  signal: AbortSignal;
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

export interface Route {
  method: Method;
  path: string;
  handler: RouteHandler;
}

export interface RouterOptions {
  /** Called when no route matches. Default: 404 JSON. */
  notFound?: RouteHandler;
}

export function createRouter(routes: readonly Route[], options: RouterOptions = {}) {
  const notFound = options.notFound ?? defaultNotFound;
  return async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = parseRequestUrl(req);
    const method = (req.method ?? 'GET').toUpperCase() as Method;
    const route = routes.find((r) => r.method === method && r.path === url.pathname);

    const controller = new AbortController();
    // Abort only when the response socket closes before we finished writing
    // it. Listening on `req.close` is incorrect here because Node emits it as
    // soon as the request body has been fully consumed (which happens
    // immediately after `readJsonBody` for short POSTs), which would abort
    // long-running streaming handlers before they even produced their first
    // SSE event. `res.close` + `writableEnded` is the standard pattern for
    // "client went away mid-stream".
    res.once('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    const ctx: RouteContext = { req, res, url, signal: controller.signal };
    if (route) {
      await route.handler(ctx);
      return;
    }
    await notFound(ctx);
  };
}

function parseRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? '127.0.0.1';
  return new URL(req.url ?? '/', `http://${host}`);
}

const defaultNotFound: RouteHandler = ({ res }) => {
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'not found' }));
};

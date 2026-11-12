import type { IncomingMessage, ServerResponse } from 'http';
import app, { ensureServerInitialized } from '../server';

export default async function handler(
  req: IncomingMessage & { url?: string; body?: any; _body?: boolean },
  res: ServerResponse
) {
  await ensureServerInitialized();

  // If Vercel runtime pre-parsed the body stream, tell Express body-parser not to re-read it
  if (req.body !== undefined && !req._body) {
    req._body = true;
  }

  return app(req as any, res as any);
}

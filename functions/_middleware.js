// functions/_middleware.js — runs for every /api/* request.
// Attaches the authenticated user (if any) to context.data.user and sets security headers.
import { parseCookies } from './lib/response.js';
import { userFromToken } from './lib/auth.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;

  // Resolve session -> user (cookie 'sid')
  try {
    const token = parseCookies(request).sid;
    data.user = await userFromToken(env, token);
  } catch {
    data.user = null;
  }

  const response = await next();

  // Security headers on every API response
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

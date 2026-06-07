// functions/api/auth/logout.js  —  POST  (clears the current session)
import { ok, clearCookie, parseCookies } from '../../lib/response.js';
import { destroySession } from '../../lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  await destroySession(env, parseCookies(request).sid);
  const res = ok({ loggedOut: true });
  res.headers.append('Set-Cookie', clearCookie());
  return res;
}

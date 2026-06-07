// functions/lib/lemonsqueezy.js — webhook signature verification + variant→plan mapping.

const enc = new TextEncoder();

// Verify the X-Signature header (hex HMAC-SHA256 of the raw body) against the secret.
export async function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// Map a Lemon Squeezy variant id to one of our plans using env-configured ids.
// Set these in wrangler vars / secrets:
//   LS_VARIANT_PRO_MONTHLY, LS_VARIANT_PRO_ANNUAL, LS_VARIANT_LIFETIME, LS_VARIANT_DOWNLOAD_PASS
export function planFromVariant(env, variantId) {
  const v = String(variantId);
  if (v === env.LS_VARIANT_LIFETIME) return { plan: 'lifetime', billing: 'lifetime' };
  if (v === env.LS_VARIANT_PRO_ANNUAL) return { plan: 'pro', billing: 'annual' };
  if (v === env.LS_VARIANT_PRO_MONTHLY) return { plan: 'pro', billing: 'monthly' };
  if (v === env.LS_VARIANT_DOWNLOAD_PASS) return { plan: 'pass', billing: null };
  return { plan: null, billing: null };
}

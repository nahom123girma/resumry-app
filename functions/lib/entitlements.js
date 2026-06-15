// functions/lib/entitlements.js — SINGLE SOURCE OF TRUTH for plan capabilities.
//
// A user's effective plan is users.plan: 'free' | 'pro' | 'lifetime'.
// "Download Pass" is NOT a separate plan — it is a credit balance
// (users.download_passes) layered on top of the free plan. Each credit buys
// one clean (watermark-free) export. This matches how the Stripe webhook
// records a pass purchase (it increments download_passes, leaves plan alone).

export const ENTITLEMENTS = {
  free: {
    maxResumes: 1,
    ai: false,
    ats: false,
    docx: false,
    coverLetters: false,
    cleanExports: 'credits',   // watermark-free only while download_passes > 0
  },
  pro: {
    maxResumes: Infinity,
    ai: true,
    ats: true,
    docx: true,
    coverLetters: true,
    cleanExports: 'unlimited',
  },
  lifetime: {
    maxResumes: Infinity,
    ai: true,
    ats: true,
    docx: true,
    coverLetters: true,
    cleanExports: 'unlimited',
  },
};

// Anti-abuse: max distinct candidate names per account (all plans).
export const MAX_IDENTITIES = 3;

export function planOf(user) {
  const p = (user && user.plan) || 'free';
  return ENTITLEMENTS[p] ? p : 'free';
}

export function entitlementsFor(user) {
  return ENTITLEMENTS[planOf(user)];
}

export function isPaid(user) {
  const p = planOf(user);
  return p === 'pro' || p === 'lifetime';
}

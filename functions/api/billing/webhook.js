// functions/api/billing/webhook.js  —  POST  (Lemon Squeezy webhook receiver)
// Verifies the signature, dedupes, and updates billing state in D1 (the source of truth).
import { verifySignature, planFromVariant } from '../../lib/lemonsqueezy.js';
import { recordEvent } from '../../lib/events.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const raw = await request.text();
  const signature = request.headers.get('X-Signature');

  if (!(await verifySignature(raw, signature, env.LS_WEBHOOK_SECRET))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

  const eventName = payload?.meta?.event_name || 'unknown';
  const custom = payload?.meta?.custom_data || {};        // pass user_id at checkout
  const attrs = payload?.data?.attributes || {};
  const variantId = attrs.variant_id || attrs.first_order_item?.variant_id;

  // Idempotency: skip if we've seen this exact event signature already.
  const eventId = signature || (await sha(raw));
  const seen = await env.DB.prepare('SELECT id FROM webhook_events WHERE id = ?').bind(eventId).first();
  if (seen) return new Response('ok (dup)', { status: 200 });
  await env.DB.prepare('INSERT INTO webhook_events (id, event_name) VALUES (?, ?)')
    .bind(eventId, eventName).run();

  // Find the user: prefer custom_data.user_id, fall back to customer email.
  const userId = custom.user_id;
  const email = (attrs.user_email || attrs.customer_email || '').toLowerCase();
  let user = null;
  if (userId) user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user && email) user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return new Response('ok (no matching user)', { status: 200 });

  const { plan, billing } = planFromVariant(env, variantId);

  if (eventName === 'subscription_created' || eventName === 'subscription_updated' || eventName === 'subscription_resumed') {
    const status = attrs.status === 'active' || attrs.status === 'on_trial' ? 'active' : (attrs.status || 'active');
    await env.DB.prepare(
      `UPDATE users SET plan='pro', plan_status=?, billing=?, ls_subscription_id=?, ls_customer_id=?,
       current_period_end=?, updated_at=datetime('now') WHERE id=?`
    ).bind(status, billing || 'monthly', String(attrs.first_subscription_item?.subscription_id || payload.data.id || ''),
           String(attrs.customer_id || ''), attrs.renews_at || null, user.id).run();
  } else if (eventName === 'subscription_expired' || eventName === 'subscription_cancelled' || eventName === 'subscription_paused') {
    // cancelled stays active until period end; expired/paused -> downgrade now
    const downgrade = eventName === 'subscription_expired' || eventName === 'subscription_paused';
    await env.DB.prepare(
      `UPDATE users SET plan=?, plan_status=?, updated_at=datetime('now') WHERE id=?`
    ).bind(downgrade ? 'free' : 'pro', eventName.replace('subscription_', ''), user.id).run();
  } else if (eventName === 'order_created') {
    if (plan === 'lifetime') {
      await env.DB.prepare(
        `UPDATE users SET plan='lifetime', plan_status='active', billing='lifetime',
         ls_customer_id=?, updated_at=datetime('now') WHERE id=?`
      ).bind(String(attrs.customer_id || ''), user.id).run();
    } else if (plan === 'pass') {
      await env.DB.prepare(
        `UPDATE users SET download_passes = download_passes + 1, updated_at=datetime('now') WHERE id=?`
      ).bind(user.id).run();
    }
  }

  // Admin event log: record the payment outcome (amount is in cents on LS).
  const amount = attrs.total != null ? Number(attrs.total) / 100 : null;
  if (eventName === 'subscription_payment_failed') {
    await recordEvent(env, { kind: 'payment_failed', user, detail: plan || 'pro', amount });
  } else if (
    eventName === 'order_created' ||
    eventName === 'subscription_created' ||
    eventName === 'subscription_payment_success'
  ) {
    await recordEvent(env, { kind: 'payment_succeeded', user, detail: plan || billing || 'pro', amount });
  }

  return new Response('ok', { status: 200 });
}

async function sha(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

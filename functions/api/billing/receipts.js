// functions/api/billing/receipts.js
// Returns the signed-in user's REAL payment history from Stripe (charges +
// receipt links), looked up by their stored stripe_customer_id. No local/demo data.
import { json, error } from '../../lib/response.js';

export async function onRequestGet(context){
  const { env, data } = context;
  const user = data && data.user;
  if(!user) return error('Please sign in.', 401);
  // No Stripe configured or no customer yet → empty history (not an error).
  if(!env.STRIPE_SECRET_KEY) return json({ ok: true, receipts: [] });

  let customerId = null;
  try {
    const row = await env.DB.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').bind(user.id).first();
    customerId = row && row.stripe_customer_id;
  } catch(_){}
  if(!customerId) return json({ ok: true, receipts: [] });

  let body;
  try {
    const resp = await fetch('https://api.stripe.com/v1/charges?limit=24&customer=' + encodeURIComponent(customerId), {
      headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY },
    });
    body = await resp.json();
    if(!resp.ok) return json({ ok: true, receipts: [] });
  } catch(_){
    return json({ ok: true, receipts: [] });
  }

  const receipts = (body.data || []).map(ch => {
    let status = 'paid';
    if(ch.refunded || ch.amount_refunded > 0) status = 'refunded';
    else if(ch.status === 'failed') status = 'failed';
    else if(ch.status !== 'succeeded') status = ch.status || 'pending';
    return {
      id: ch.id,
      amount: ch.amount != null ? ch.amount / 100 : 0,
      currency: (ch.currency || 'usd').toUpperCase(),
      date: ch.created ? ch.created * 1000 : null,
      status,
      description: ch.description || 'Payment',
      receipt_url: ch.receipt_url || null,
    };
  });

  return json({ ok: true, receipts });
}

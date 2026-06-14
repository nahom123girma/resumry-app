// functions/api/billing/checkout.js
// Creates a Stripe Checkout Session and returns its URL. No SDK — direct REST call.
import { json, error } from '../../lib/response.js';

// plan key -> the env var holding its Stripe Price ID
const PRICE_ENV = {
  pro_monthly:   'STRIPE_PRICE_PRO_MONTHLY',
  pro_annual:    'STRIPE_PRICE_PRO_ANNUAL',
  lifetime:      'STRIPE_PRICE_LIFETIME',
  download_pass: 'STRIPE_PRICE_DOWNLOAD_PASS',
};
const SUBSCRIPTION_PLANS = new Set(['pro_monthly', 'pro_annual']);

export async function onRequestPost(context){
  const { request, env, data } = context;
  const user = data && data.user;
  if(!user) return error('Please sign in to upgrade.', 401);
  if(!env.STRIPE_SECRET_KEY) return error('Payments are not configured on the server.', 503);

  let body = {};
  try { body = await request.json(); } catch(_){}
  const plan = String(body.plan || '').toLowerCase();
  const priceId = PRICE_ENV[plan] && env[PRICE_ENV[plan]];
  if(!priceId) return error('Unknown or unconfigured plan: ' + plan, 400);

  const origin = new URL(request.url).origin;
  const mode = SUBSCRIPTION_PLANS.has(plan) ? 'subscription' : 'payment';

  const form = new URLSearchParams();
  form.set('mode', mode);
  form.set('line_items[0][price]', priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', origin + '/?checkout=success#dashboard');
  form.set('cancel_url', origin + '/?checkout=cancel#pricing');
  form.set('client_reference_id', user.id);
  form.set('metadata[user_id]', user.id);
  form.set('metadata[plan]', plan);
  form.set('allow_promotion_codes', 'true');
  if(user.email) form.set('customer_email', user.email);
  if(mode === 'subscription'){
    form.set('subscription_data[metadata][user_id]', user.id);
    form.set('subscription_data[metadata][plan]', plan);
  }

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const session = await resp.json();
  if(!resp.ok){
    return error((session.error && session.error.message) || 'Could not start checkout.', 502);
  }
  return json({ ok: true, url: session.url });
}

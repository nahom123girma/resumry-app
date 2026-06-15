// functions/api/billing/webhook.js
// Stripe webhook. Verifies the signature with Web Crypto (no SDK), then updates
// the user's plan in D1 and logs the event for the admin dashboard.
import { recordEvent } from '../../lib/events.js';
import { sendEmail, receiptHtml } from '../../lib/email.js';

async function verifyStripeSignature(rawBody, sigHeader, secret){
  if(!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach(kv => { const i = kv.indexOf('='); if(i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1); });
  const t = parts.t, v1 = parts.v1;
  if(!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + rawBody));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if(hex.length !== v1.length) return false;
  let diff = 0;
  for(let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(context){
  const { request, env } = context;
  const raw = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  if(!(await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET))){
    return new Response('Bad signature', { status: 400 });
  }

  let event;
  try { event = JSON.parse(raw); } catch(_) { return new Response('Bad payload', { status: 400 }); }
  const obj = (event.data && event.data.object) || {};

  try {
    if(event.type === 'checkout.session.completed'){
      const userId = (obj.metadata && obj.metadata.user_id) || obj.client_reference_id;
      const plan = (obj.metadata && obj.metadata.plan) || '';
      const amount = obj.amount_total != null ? obj.amount_total / 100 : null;
      if(userId){
        if(plan === 'download_pass'){
          await env.DB.prepare("UPDATE users SET download_passes = download_passes + 1, stripe_customer_id = COALESCE(?, stripe_customer_id), updated_at = datetime('now') WHERE id = ?")
            .bind(obj.customer || null, userId).run();
        } else if(plan === 'lifetime'){
          await env.DB.prepare("UPDATE users SET plan='lifetime', plan_status='active', stripe_customer_id = COALESCE(?, stripe_customer_id), updated_at = datetime('now') WHERE id = ?")
            .bind(obj.customer || null, userId).run();
        } else { // pro_monthly | pro_annual
          await env.DB.prepare("UPDATE users SET plan='pro', plan_status='active', stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = datetime('now') WHERE id = ?")
            .bind(obj.customer || null, obj.subscription || null, userId).run();
        }
        const u = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(userId).first();
        await recordEvent(env, { kind: 'payment_succeeded', user: u, detail: plan || 'pro', amount });
        if(u && u.email){
          const planLabel = ({ pro_monthly:'Pro — Monthly', pro_annual:'Pro — Annual', lifetime:'Lifetime', download_pass:'Download Pass' })[plan] || 'Resumry';
          try { await sendEmail(env, { to: u.email, subject: 'Your Resumry receipt', html: receiptHtml(u.name || 'there', { plan: planLabel, amount, date: Date.now() }) }); } catch(_){}
        }
      }
    } else if(event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted'){
      const subId = obj.id;
      const status = obj.status; // active | past_due | canceled | unpaid | trialing ...
      if(subId){
        await env.DB.prepare("UPDATE users SET plan = CASE WHEN ? IN ('active','trialing') THEN 'pro' ELSE 'free' END, plan_status = ?, updated_at = datetime('now') WHERE stripe_subscription_id = ?")
          .bind(status, status, subId).run();
      }
    } else if(event.type === 'invoice.payment_failed'){
      const customer = obj.customer;
      const amount = obj.amount_due != null ? obj.amount_due / 100 : null;
      let u = null;
      if(customer){
        await env.DB.prepare("UPDATE users SET plan_status='past_due', updated_at = datetime('now') WHERE stripe_customer_id = ?").bind(customer).run();
        u = await env.DB.prepare('SELECT id, email, name FROM users WHERE stripe_customer_id = ?').bind(customer).first();
      }
      await recordEvent(env, { kind: 'payment_failed', user: u, detail: 'subscription', amount });
    }
  } catch(e){
    console.warn('webhook handler error', event.type, e && e.message);
  }

  return new Response('ok', { status: 200 });
}

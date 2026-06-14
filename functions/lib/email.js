// functions/lib/email.js
// Transactional email via Resend + secure one-time token helpers.

const FROM = 'Resumry <noreply@resumry.com>';

// Send an email through Resend. Never throws — returns {ok}. If the key is
// missing it no-ops so the rest of the flow (signup, payment) still succeeds.
export async function sendEmail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped:', subject);
    return { ok: false, skipped: true };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text: text || '' }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn('Resend error', resp.status, body);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn('Resend send failed', e && e.message);
    return { ok: false };
  }
}

// 256-bit random token (raw value goes in the email link; only its hash is stored).
export function randomToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── Branded templates ───────────────────────────────────────────── */
function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1a17">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:800;font-size:20px;color:#fe5d2b;margin-bottom:20px">Resumry</div>
    <div style="background:#fff;border-radius:14px;padding:28px 26px;border:1px solid #e7dfd2">
      <h1 style="font-size:19px;margin:0 0 14px">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#8a8275;font-size:12px;margin:18px 4px 0">Resumry · You're receiving this because someone used this email at resumry.com. If that wasn't you, you can ignore this message.</p>
  </div></body></html>`;
}
function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#fe5d2b;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9px;margin:6px 0 14px">${label}</a>`;
}

export function verifyEmailHtml(name, link) {
  return shell('Confirm your email',
    `<p style="font-size:14px;line-height:1.55;margin:0 0 16px">Hi ${name || 'there'}, welcome to Resumry! Confirm this email address to finish setting up your account.</p>
     ${button(link, 'Verify email')}
     <p style="font-size:12px;color:#8a8275;line-height:1.5;margin:6px 0 0">Or paste this link into your browser:<br><span style="color:#fe5d2b;word-break:break-all">${link}</span><br><br>This link expires in 48 hours.</p>`);
}

export function resetPasswordHtml(name, link) {
  return shell('Reset your password',
    `<p style="font-size:14px;line-height:1.55;margin:0 0 16px">Hi ${name || 'there'}, we got a request to reset your Resumry password. Click below to choose a new one.</p>
     ${button(link, 'Reset password')}
     <p style="font-size:12px;color:#8a8275;line-height:1.5;margin:6px 0 0">Or paste this link into your browser:<br><span style="color:#fe5d2b;word-break:break-all">${link}</span><br><br>This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.</p>`);
}

export function receiptHtml(name, { plan, amount, date }) {
  const amt = typeof amount === 'number' ? ('$' + amount.toFixed(2)) : amount;
  return shell('Payment received',
    `<p style="font-size:14px;line-height:1.55;margin:0 0 16px">Hi ${name || 'there'}, thanks for your purchase! Here's your receipt.</p>
     <table style="width:100%;font-size:14px;border-collapse:collapse">
       <tr><td style="padding:8px 0;color:#8a8275">Plan</td><td style="padding:8px 0;text-align:right;font-weight:700">${plan}</td></tr>
       <tr><td style="padding:8px 0;color:#8a8275;border-top:1px solid #eee">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700;border-top:1px solid #eee">${amt}</td></tr>
       <tr><td style="padding:8px 0;color:#8a8275;border-top:1px solid #eee">Date</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${date}</td></tr>
     </table>
     <p style="font-size:12px;color:#8a8275;line-height:1.5;margin:16px 0 0">A full history is available under Billing in your dashboard.</p>`);
}

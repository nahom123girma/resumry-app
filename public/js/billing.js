// public/js/billing.js — opens Lemon Squeezy checkout, passing the user id so the
// webhook can match the purchase to the account. Entitlement comes from the server
// (session.user.plan), never from the client.
window.Resumry = window.Resumry || {};

Resumry.billing = (function () {
  // Fill these with your Lemon Squeezy hosted checkout URLs.
  const CHECKOUT = {
    pass:     '', // Download Pass $4.99
    monthly:  '', // Pro $7.99/mo
    annual:   '', // Pro $49/yr
    lifetime: '', // Lifetime $99
  };

  function checkout(which) {
    const base = CHECKOUT[which];
    if (!base) { alert('Checkout link not configured yet.'); return; }
    const user = Resumry.session.user();
    const url = new URL(base);
    // Lemon Squeezy: prefill email + pass custom data (read back in the webhook).
    if (user) {
      url.searchParams.set('checkout[email]', user.email);
      url.searchParams.set('checkout[custom][user_id]', user.id);
    }
    // Use the LS overlay if lemon.js is loaded, else just navigate.
    if (window.LemonSqueezy && window.LemonSqueezy.Url) {
      window.LemonSqueezy.Url.Open(url.toString());
    } else {
      window.location.href = url.toString();
    }
  }
  return { checkout, CHECKOUT };
})();

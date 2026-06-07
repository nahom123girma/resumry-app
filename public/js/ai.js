// public/js/ai.js — calls the rate-limited server AI endpoint. No keys here, ever.
window.Resumry = window.Resumry || {};

Resumry.ai = (function () {
  async function generate(task, prompt, extra) {
    try {
      const r = await Resumry.api.post('/ai/generate', { task, prompt, context: extra || null });
      return { text: r.text, used: r.used, quota: r.quota };
    } catch (e) {
      if (e.status === 401) throw new Error('Please sign in to use AI features.');
      if (e.status === 402) throw new Error('You\u2019ve hit your monthly AI limit — upgrade for more.');
      if (e.status === 429) throw new Error('Too many requests — try again in a moment.');
      throw new Error(e.data?.error || 'AI request failed.');
    }
  }
  return { generate };
})();

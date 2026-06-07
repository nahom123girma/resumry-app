// public/js/store.js — résumé/cover storage. D1 is the source of truth; localStorage
// is a fast offline cache. Reads hit cache first, then reconcile from the server.
window.Resumry = window.Resumry || {};

Resumry.store = (function () {
  const CACHE = 'resumry-cache-v1';

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch (_) { return {}; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE, JSON.stringify(obj)); } catch (_) {}
  }

  // Load resumes: return cached copy immediately (if any), then sync from server.
  async function loadResumes() {
    const cache = readCache();
    const cached = cache.resumes || [];
    try {
      const r = await Resumry.api.get('/resumes');
      cache.resumes = r.resumes;
      writeCache(cache);
      return r.resumes;
    } catch (e) {
      // Offline or signed out → serve cache.
      return cached;
    }
  }

  async function saveResume(resume) {
    // Optimistic cache update
    const cache = readCache();
    cache.resumes = (cache.resumes || []).filter((x) => x.id !== resume.id);
    cache.resumes.unshift(resume);
    writeCache(cache);
    // Write-through to server (best effort; queue on failure)
    try {
      const r = await Resumry.api.post('/resumes', resume);
      return r.id;
    } catch (e) {
      queue('resume', resume);
      return resume.id;
    }
  }

  async function deleteResume(id) {
    const cache = readCache();
    cache.resumes = (cache.resumes || []).filter((x) => x.id !== id);
    writeCache(cache);
    try { await Resumry.api.del('/resumes/' + id); } catch (_) {}
  }

  // Simple offline write queue, flushed on next online sync.
  function queue(kind, item) {
    const cache = readCache();
    cache._queue = cache._queue || [];
    cache._queue.push({ kind, item, at: Date.now() });
    writeCache(cache);
  }
  async function flushQueue() {
    const cache = readCache();
    const q = cache._queue || [];
    if (!q.length) return;
    const remaining = [];
    for (const job of q) {
      try {
        if (job.kind === 'resume') await Resumry.api.post('/resumes', job.item);
        if (job.kind === 'cover') await Resumry.api.post('/covers', job.item);
      } catch (_) { remaining.push(job); }
    }
    cache._queue = remaining;
    writeCache(cache);
  }

  return { loadResumes, saveResume, deleteResume, flushQueue, _readCache: readCache };
})();

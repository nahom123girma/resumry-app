// functions/api/ai/generate.js  —  POST { task, prompt, context }
// Rate-limited, quota-enforced AI proxy. The AI provider key NEVER reaches the client.
import { json, error } from '../../lib/response.js';
import { rateLimit, getUsage, incrementUsage, AI_MONTHLY_QUOTA } from '../../lib/ratelimit.js';

// Provider-agnostic: defaults to an OpenAI-compatible chat endpoint. To use Gemini
// or Anthropic, point AI_API_URL/AI_MODEL at theirs and adjust the body shape below.
export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user;
  if (!user) return error('Sign in to use AI features', 401);

  // 1) Short-window abuse limit (e.g. max 8 calls / minute / user)
  const rl = await rateLimit(env, `ai:${user.id}`, 8, 60);
  if (!rl.allowed) return error('Too many requests — slow down a moment.', 429, { resetIn: rl.resetIn });

  // 2) Monthly plan quota
  const quota = AI_MONTHLY_QUOTA[user.plan] ?? AI_MONTHLY_QUOTA.free;
  const used = await getUsage(env, user.id);
  if (used >= quota) {
    return error('Monthly AI limit reached for your plan.', 402, { used, quota });
  }

  // 3) Build the request
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const task = (body.task || 'generate').slice(0, 40);
  const userPrompt = (body.prompt || '').slice(0, 8000); // cap input size for cost control
  if (!userPrompt) return error('Empty prompt');

  if (!env.AI_API_KEY) return error('AI is not configured on the server', 503);

  const apiUrl = env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = env.AI_MODEL || 'gpt-4o-mini';
  const system = 'You are Resumry AI, a concise assistant that helps write and improve resumes and cover letters. Return only the requested content.';

  let aiResp;
  try {
    aiResp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `[task: ${task}]\n${userPrompt}` },
        ],
      }),
    });
  } catch {
    return error('AI provider unreachable', 502);
  }
  if (!aiResp.ok) return error('AI provider error', 502, { status: aiResp.status });

  const out = await aiResp.json();
  const text = out?.choices?.[0]?.message?.content ?? '';

  // 4) Count usage only on success
  await incrementUsage(env, user.id);

  return json({ ok: true, text, used: used + 1, quota });
}

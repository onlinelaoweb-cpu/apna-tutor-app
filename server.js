// Tiny built-in .env loader (avoids an extra dependency) - only used for local dev.
// On Railway, environment variables are set directly in the dashboard, so this is a no-op there.
try {
  const fs = require('fs');
  const envPath = require('path').join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = (match[2] || '').replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (e) { /* ignore - env vars may already be set by the platform */ }

const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ---- Profiles ----
app.get('/api/profiles', (req, res) => {
  res.json(db.getProfiles());
});

app.post('/api/profiles', (req, res) => {
  const { id, name, grade, stream } = req.body || {};
  if (!id || !name || !grade) return res.status(400).json({ error: 'id, name and grade are required' });
  db.addProfile({ id, name, grade, stream: stream || null });
  res.json({ ok: true });
});

app.delete('/api/profiles/:id', (req, res) => {
  db.deleteProfile(req.params.id);
  res.json({ ok: true });
});

// ---- Quiz progress ----
app.get('/api/progress/:profileId', (req, res) => {
  const rows = db.getProgress(req.params.profileId).map(({ subject, topic, score, total, date }) => ({
    subject, topic, score, total, date,
  }));
  res.json(rows);
});

app.post('/api/progress/:profileId', (req, res) => {
  const { subject, topic, score, total, date } = req.body || {};
  if (!subject || score === undefined || total === undefined || !date) {
    return res.status(400).json({ error: 'subject, score, total and date are required' });
  }
  db.addProgress(req.params.profileId, { subject, topic: topic || '', score, total, date });
  res.json({ ok: true });
});

// ---- Topic log (powers "welcome back, let's recap what we covered before") ----
app.get('/api/topics/:profileId', (req, res) => {
  const subject = req.query.subject;
  if (!subject) return res.status(400).json({ error: 'subject query param is required' });
  const today = new Date().toISOString().slice(0, 10);
  const entries = db.getTopicLog(req.params.profileId, subject).filter((e) => e.date !== today);
  entries.sort((a, b) => (a.date < b.date ? 1 : -1)); // most recent day first
  const seen = new Set();
  const distinct = [];
  for (const e of entries) {
    const key = e.topic || '(general)';
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push({ topic: e.topic, date: e.date });
    if (distinct.length >= 5) break;
  }
  res.json({ topics: distinct });
});

app.post('/api/topics/:profileId', (req, res) => {
  const { subject, topic } = req.body || {};
  if (!subject) return res.status(400).json({ error: 'subject is required' });
  const date = new Date().toISOString().slice(0, 10);
  db.addTopicLog(req.params.profileId, { subject, topic: topic || '', date });
  res.json({ ok: true });
});

// ---- Streaks and badges (derived from topic log + quiz history, no separate tracking) ----
app.get('/api/streak/:profileId', (req, res) => {
  res.json(db.getEngagementStats(req.params.profileId));
});

// ---- Family summary (parent-facing weekly digest across all kids) ----
app.get('/api/family-summary', (req, res) => {
  const profiles = db.getProfiles();
  const summary = profiles.map((p) => {
    const stats = db.getEngagementStats(p.id);
    const progress = db.getProgress(p.id);
    const weakMap = {};
    progress.forEach((e) => {
      if (e.total > 0 && (e.score / e.total) < 0.6) {
        if (!weakMap[e.subject] || weakMap[e.subject].date < e.date) weakMap[e.subject] = e;
      }
    });
    const weakTopics = Object.keys(weakMap).map((s) => ({
      subject: s, topic: weakMap[s].topic, score: weakMap[s].score, total: weakMap[s].total,
    }));
    return {
      id: p.id, name: p.name, grade: p.grade,
      currentStreak: stats.currentStreak, longestStreak: stats.longestStreak,
      activeDays: stats.activeDays, quizCount: progress.length, weakTopics,
    };
  });
  res.json(summary);
});

// ---- AI tutor backend ----
// Which AI answers the tutor chat, quizzes and worksheets. Pick with AI_PROVIDER:
//   gemini - Google Gemini free tier (NO cost, no card needed: key from aistudio.google.com)
//   claude - Anthropic API (pay-per-use)
//   none   - no AI at all. The app still works with its built-in offline quizzes,
//            worksheets and spelling practice (the tutor chat just says it is resting).
// If AI_PROVIDER is not set: uses gemini if GEMINI_API_KEY exists, else claude if
// ANTHROPIC_API_KEY exists, else none.
const PROVIDER = (process.env.AI_PROVIDER
  || (process.env.GEMINI_API_KEY ? 'gemini' : (process.env.ANTHROPIC_API_KEY ? 'claude' : 'none'))).toLowerCase();

// Safety cap on AI calls per day (protects the free quota, or your bill if you use claude).
// Over the cap, the app quietly switches to its offline quizzes until tomorrow. 0 = no cap.
const DAILY_LIMIT = parseInt(process.env.DAILY_AI_LIMIT || '300', 10);
let usage = { day: '', count: 0 };
function underDailyLimit() {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) usage = { day: today, count: 0 };
  if (DAILY_LIMIT > 0 && usage.count >= DAILY_LIMIT) return false;
  usage.count++;
  return true;
}

// Gemini model names change over time, so they are a setting, not hard-coded.
// The first name that works is used; if one is busy or over its free quota the next is tried.
const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);
const GEMINI_BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';

let lastGoodModel = null;
const thinkForm = {};

async function askGemini({ system, priorTurns, message, image, webSearch }) {
  const contents = priorTurns.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] }));
  while (contents.length && contents[0].role !== 'user') contents.shift();
  const parts = [];
  if (image && image.data && image.mediaType) parts.push({ inline_data: { mime_type: image.mediaType, data: image.data } });
  parts.push({ text: message || 'Please look at this and help me understand it.' });
  contents.push({ role: 'user', parts });

  const body = { contents, generationConfig: { maxOutputTokens: 2048, temperature: 0.7 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (webSearch) body.tools = [{ google_search: {} }];
  // Quizzes and worksheets must come back as clean JSON. (Not combinable with search.)
  else if (/ONLY valid JSON/i.test(system || '')) body.generationConfig.responseMimeType = 'application/json';

  let lastErr = 'Gemini error';
  // Chat replies are short; only quiz/worksheet JSON needs the big output budget.
  const isJson = !webSearch && /ONLY valid JSON/i.test(system || '');
  if (!isJson) body.generationConfig.maxOutputTokens = 700;
  // Try the model that worked last time first, so a wrong/busy model name does not cost a wasted round-trip on every message.
  const order = lastGoodModel && GEMINI_MODELS.includes(lastGoodModel)
    ? [lastGoodModel, ...GEMINI_MODELS.filter((m) => m !== lastGoodModel)] : GEMINI_MODELS;
  // "Thinking" makes Gemini slow. Ask for as little as possible; if a model does not
  // accept that setting, fall back to the next form (remembered per model).
  const THINK_FORMS = [{ thinkingLevel: 'low' }, { thinkingBudget: 0 }, null];
  for (const model of order) {
    for (let fi = (thinkForm[model] || 0); fi < THINK_FORMS.length; fi++) {
      const t0 = Date.now();
      const reqBody = JSON.parse(JSON.stringify(body));
      if (THINK_FORMS[fi]) reqBody.generationConfig.thinkingConfig = THINK_FORMS[fi];
      try {
        const upstream = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify(reqBody),
        });
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
          lastErr = (data.error && data.error.message) || ('Gemini error ' + upstream.status);
          console.log('[gemini] ' + model + ' form' + fi + ' failed ' + upstream.status + ' in ' + (Date.now() - t0) + 'ms: ' + String(lastErr).slice(0, 120));
          if (upstream.status === 400 && THINK_FORMS[fi] && /think/i.test(lastErr)) { thinkForm[model] = fi + 1; continue; } // try a simpler thinking setting
          if ([400, 404, 429, 500, 503].includes(upstream.status)) break; // try the next model
          throw new Error(lastErr);
        }
        const cand = (data.candidates || [])[0];
        const text = ((cand && cand.content && cand.content.parts) || [])
          .filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim();
        if (!text) { lastErr = 'Empty reply (' + ((cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'no text') + ')'; break; }
        thinkForm[model] = fi;
        lastGoodModel = model;
        console.log('[gemini] ' + model + ' ok in ' + (Date.now() - t0) + 'ms' + (webSearch ? ' (search)' : '') + (THINK_FORMS[fi] ? ' think=' + JSON.stringify(THINK_FORMS[fi]) : ''));
        return text;
      } catch (e) { lastErr = e.message; break; }
    }
  }
  throw new Error(lastErr);
}

async function askClaude({ system, priorTurns, message, image, webSearch }) {
  let content;
  if (image && image.data && image.mediaType) {
    content = [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
      { type: 'text', text: message || 'Please look at this and help me understand it.' },
    ];
  } else {
    content = message;
  }
  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: system || undefined,
    messages: [...priorTurns, { role: 'user', content }],
  };
  if (webSearch) requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(requestBody),
  });
  const data = await upstream.json();
  if (!upstream.ok) throw new Error((data.error && data.error.message) || 'Anthropic API error');
  return (data.content || []).map((b) => b.text || '').join('\n');
}

app.get('/api/ai/status', (req, res) => {
  const ready = PROVIDER === 'gemini' ? !!process.env.GEMINI_API_KEY : (PROVIDER === 'claude' ? !!process.env.ANTHROPIC_API_KEY : false);
  res.json({ provider: PROVIDER, available: ready });
});

// Kept at the old address so the app's front end needs no change.
app.post('/api/messages', async (req, res) => {
  const { system, message, image, history, webSearch } = req.body || {};
  if (!message && !image) return res.status(400).json({ error: 'message or image is required' });
  if (PROVIDER === 'none') return res.status(503).json({ error: 'AI is switched off (AI_PROVIDER=none).' });
  if (PROVIDER === 'gemini' && !process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'Server is missing GEMINI_API_KEY.' });
  if (PROVIDER === 'claude' && !process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
  if (!underDailyLimit()) return res.status(429).json({ error: 'Daily AI limit reached. Try again tomorrow.' });

  // Keep prior turns so the tutor remembers what it just asked - capped to bound cost and latency.
  const priorTurns = Array.isArray(history)
    ? history.slice(-12).filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
        .map((h) => ({ role: h.role, content: h.content }))
    : [];
  try {
    const args = { system, priorTurns, message, image, webSearch };
    const text = PROVIDER === 'claude' ? await askClaude(args) : await askGemini(args);
    res.json({ text });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---- Neural text-to-speech (Google Cloud TTS) - optional. If not configured, the
// frontend automatically falls back to the browser's built-in voice, so the app keeps
// working either way. Both voices confirmed FEMALE per Google's own voice listings -
// en-IN-Wavenet-A and hi-IN-Wavenet-A (their "A" voice is female in nearly every locale).
const TTS_VOICES = {
  en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
  hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
};

app.get('/api/tts/status', (req, res) => {
  res.json({ available: !!process.env.GOOGLE_TTS_API_KEY });
});

app.post('/api/tts', async (req, res) => {
  if (!process.env.GOOGLE_TTS_API_KEY) {
    return res.status(404).json({ error: 'Neural voice is not configured on this server.' });
  }
  const { text, lang } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  const voice = TTS_VOICES[lang] || TTS_VOICES.en;

  try {
    const upstream = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: voice.languageCode, name: voice.name },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 },
        }),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || 'Google TTS error' });
    }
    res.json({ audio: data.audioContent }); // base64 MP3
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Static frontend ----
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Apna Tutor running on port ${PORT}`));
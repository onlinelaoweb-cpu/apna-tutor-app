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

// ---- Anthropic proxy (keeps the API key server-side only) ----
app.post('/api/messages', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in your environment variables.' });
  }
  const { system, message, image, history } = req.body || {};
  if (!message && !image) return res.status(400).json({ error: 'message or image is required' });

  let content;
  if (image && image.data && image.mediaType) {
    content = [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
      { type: 'text', text: message || 'Please look at this and help me understand it.' },
    ];
  } else {
    content = message;
  }

  // Keep prior turns so the tutor remembers what it just asked and can react to the
  // child's reply - capped to the last 12 turns to bound cost and latency.
  const priorTurns = Array.isArray(history)
    ? history.slice(-12).filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
        .map((h) => ({ role: h.role, content: h.content }))
    : [];
  const messages = [...priorTurns, { role: 'user', content }];

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: system || undefined,
        messages,
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || 'Anthropic API error' });
    }
    const text = (data.content || []).map((b) => b.text || '').join('\n');
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Neural text-to-speech (Google Cloud TTS) - optional. If not configured, the
// frontend automatically falls back to the browser's built-in voice, so the app keeps
// working either way. Voice names use Wavenet for broad, reliable language support.
const TTS_VOICES = {
  en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
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
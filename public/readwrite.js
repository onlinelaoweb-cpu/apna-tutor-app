// Padho-Likho (Read & Write) - reading fluency and writing speed practice.
// Loaded after the main script in index.html, so it can use el(), state, speak(),
// callClaude(), saveProgressEntry(), activeProfile(), render() directly.
// Everything works offline with built-in content; AI is only used for "new story".

const RW_PASSAGES = {
  1: [
    { title: 'The Red Ball', text: 'Raju has a red ball. He plays with it in the park. The ball rolls under a tree. Raju runs and gets it back. He is very happy.' },
    { title: 'My Pet Cat', text: 'I have a little cat. Her name is Mini. She drinks milk every day. Mini likes to sleep on my bed. I love my cat.' },
    { title: 'A Rainy Day', text: 'It is raining today. I see dark clouds in the sky. Mother gives me a small umbrella. I jump in the water and laugh.' }
  ],
  2: [
    { title: 'The Clever Crow', text: 'A thirsty crow found a pot with a little water at the bottom. His beak could not reach it. He picked up small stones and dropped them in the pot one by one. Slowly the water came up, and the crow drank happily.' },
    { title: 'Our School Garden', text: 'Our school has a big garden. Children plant flowers and vegetables there. Every morning we water the plants together. Last week a yellow flower opened, and our teacher clapped. We are proud of our garden.' },
    { title: 'Grandmother\'s Village', text: 'In the holidays I go to my grandmother\'s village. There are green fields and many birds. I ride in a bullock cart and drink fresh coconut water. In the evening Grandmother tells me a story under the stars.' }
  ],
  3: [
    { title: 'The Honest Woodcutter', text: 'A poor woodcutter was cutting a tree near a river when his axe slipped and fell into the deep water. He sat down and began to cry because it was his only axe. A kind river fairy appeared and showed him a golden axe, but he said, "That is not mine." Pleased with his honesty, the fairy gave him his own iron axe and the golden one too.' },
    { title: 'Why We Should Save Water', text: 'Water is very precious, but many people waste it without thinking. A dripping tap can waste dozens of litres in a single day. We should close the tap while brushing our teeth, use a bucket instead of a shower, and reuse water for plants. If every family takes small steps, we can keep our rivers and wells full for the future.' },
    { title: 'A Trip to the Museum', text: 'On Saturday our class went to the city museum. We saw old coins, big dinosaur bones and beautiful paintings from many centuries ago. The guide explained how people lived long before there were phones or cars. I wrote everything in my notebook, and I could not wait to tell my family about the wonderful day.' }
  ]
};

const RW_SIGHT = {
  1: ['the','and','is','you','it','in','said','was','for','they','are','have','this','with','but','not','what','all','were','when','we','can','your','there','up','out','if','about','who','get'],
  2: ['because','where','would','could','should','their','people','again','always','before','after','every','found','great','little','mother','father','friend','school','water','these','those','which','while','write','right','house','around','together','very'],
  3: ['beautiful','different','important','together','thought','between','however','remember','weather','neighbour','delicious','favourite','through','enough','without','another','country','science','sentence','question','answer','special','surprise','journey','library','festival','vegetable','tomorrow','medicine','dangerous']
};

const RW_SENTENCES = {
  1: ['The cat sat on the mat.', 'I like to eat a mango.', 'My dog can run fast.', 'We go to school by bus.', 'The sun is very hot today.', 'Mother made a sweet cake.', 'Look at the big red kite.', 'The bird is in the nest.'],
  2: ['My friend and I play in the park.', 'The children sing a song in class.', 'We have a holiday on Sunday.', 'Grandfather reads a story every night.', 'The farmer grows rice in his field.', 'Please put the books on the table.', 'Our teacher gave us homework today.', 'The little puppy drinks warm milk.'],
  3: ['Every morning I wake up early and drink a glass of milk.', 'The library is full of interesting books about animals.', 'My brother and I are going to the market this evening.', 'We should always speak the truth and help our friends.', 'The peacock opened its beautiful feathers in the garden.', 'During the festival, our whole family cooks delicious food.', 'I want to become a doctor when I grow up.', 'The train stopped at the station and many people got off.']
};

// Rough targets (words per minute reading aloud; words per minute copying/dictation by hand).
const RW_READ_TARGET = { 1: 30, 2: 55, 3: 75 };
const RW_WRITE_TARGET = { 1: 5, 2: 8, 3: 12 };

const RW = {
  mode: 'home',     // home | read | flash | write | build | stats
  level: null,      // 1|2|3, null = auto from grade
  // reading
  phase: 'pick', passage: null, missed: new Set(), startTs: 0, secs: 0, timer: null, rec: null,
  srOk: true, srBase: '', srCur: '', aiLoading: false, saved: false,
  // flash
  fWords: [], fIdx: 0, fKnown: 0, fEnd: 0, fPhase: 'pick', fTimer: null, fMiss: [],
  // write
  wSentence: null, wPhase: 'pick', wStart: 0, wSecs: 0, wTimer: null, wCount: 0,
  // build
  bRounds: [], bIdx: 0, bScore: 0, bPicked: [], bPool: [], bResult: null, bPhase: 'pick'
};

function rwLevel(profile){
  if (RW.level) return RW.level;
  const g = parseInt(profile.grade, 10);
  if (isNaN(g) || g <= 2) return 1;      // Nursery..Class 2
  if (g === 3) return 2;
  return 3;                              // Class 4+
}
function rwTargetGrade(profile){
  const g = parseInt(profile.grade, 10);
  return isNaN(g) ? 1 : g;
}
function rwKey(id){ return 'apnaTutorRW_' + id; }
function rwHist(id){
  try { const h = JSON.parse(localStorage.getItem(rwKey(id)) || '{}'); return { read: h.read || [], write: h.write || [], flash: h.flash || [], build: h.build || [] }; }
  catch(e){ return { read: [], write: [], flash: [], build: [] }; }
}
function rwAdd(id, kind, rec){
  const h = rwHist(id);
  h[kind].push(rec);
  if (h[kind].length > 60) h[kind] = h[kind].slice(-60);
  try { localStorage.setItem(rwKey(id), JSON.stringify(h)); } catch(e){}
}
async function rwLog(profile, subject, topic, score, total){
  const entry = { subject, topic, score, total, date: new Date().toISOString().slice(0,10) };
  if (!state.progress[profile.id]) state.progress[profile.id] = [];
  state.progress[profile.id].unshift(entry);
  await saveProgressEntry(profile.id, entry);
  try { await loadStreak(profile.id); } catch(e){}
}
function rwNorm(w){ return String(w).toLowerCase().replace(/[^a-z']/g, ''); }
function rwShuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function rwPick(arr, n){ return rwShuffle(arr).slice(0, n); }
function rwStopAll(){
  clearInterval(RW.timer); clearInterval(RW.fTimer); clearInterval(RW.wTimer);
  if (RW.rec){ const r = RW.rec; RW.rec = null; try { r.onend = null; r.abort(); } catch(e){} }
  try { stopSpeaking(); } catch(e){}
}
function rwGo(mode){
  rwStopAll();
  RW.mode = mode;
  RW.phase = 'pick'; RW.fPhase = 'pick'; RW.wPhase = 'pick'; RW.bPhase = 'pick';
  render();
}

// ---------- shared UI ----------
const RW_CARD = 'background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin-bottom:14px;';
const RW_BIG_BTN = 'background:var(--gold); color:#2B1B05; border:none; border-radius:12px; padding:14px 22px; font-weight:800; font-size:16px; cursor:pointer;';
const RW_SOFT_BTN = 'background:var(--bg-alt); color:var(--ink); border:1.5px solid var(--line); border-radius:10px; padding:10px 16px; font-weight:700; font-size:14px; cursor:pointer;';

function rwBtn(label, fn, big){ return el('button', { style: big ? RW_BIG_BTN : RW_SOFT_BTN, onclick: fn }, [label]); }
function rwBack(){ return el('button', { class: 'btn-ghost', style: 'margin-bottom:12px;', onclick: () => rwGo('home') }, ['← Padho-Likho menu']); }
function rwLevelChips(profile){
  const cur = rwLevel(profile);
  const names = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  return el('div', { style: 'display:flex; gap:8px; justify-content:center; margin:6px 0 14px;' },
    [1, 2, 3].map(l => el('button', {
      style: RW_SOFT_BTN + (cur === l ? 'background:var(--gold); border-color:var(--gold);' : ''),
      onclick: () => { RW.level = l; RW.phase = 'pick'; RW.fPhase = 'pick'; RW.wPhase = 'pick'; RW.bPhase = 'pick'; render(); }
    }, [names[l]])));
}
function rwFmt(secs){ const m = Math.floor(secs / 60), s = Math.floor(secs % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

// ---------- entry ----------
function renderReadWrite(){
  const profile = activeProfile();
  const wrap = el('div', { style: 'max-width:680px; margin:0 auto;' });
  if (!profile) return el('div', { class: 'empty-state' }, [el('h2', {}, ['Welcome!']), el('p', {}, ['Add your first child on the left to get started.'])]);
  if (RW.mode === 'read') wrap.appendChild(rwRead(profile));
  else if (RW.mode === 'flash') wrap.appendChild(rwFlash(profile));
  else if (RW.mode === 'write') wrap.appendChild(rwWrite(profile));
  else if (RW.mode === 'build') wrap.appendChild(rwBuild(profile));
  else if (RW.mode === 'stats') wrap.appendChild(rwStats(profile));
  else wrap.appendChild(rwHome(profile));
  return wrap;
}

function rwHome(profile){
  const wrap = el('div', {});
  const h = rwHist(profile.id);
  const lvl = rwLevel(profile);
  const lastRead = h.read[h.read.length - 1];
  wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
    el('div', { style: 'font-size:34px;' }, ['📖✏️']),
    el('h2', { style: 'margin:6px 0 4px;' }, ['Padho-Likho · Read & Write']),
    el('div', { style: 'color:var(--ink-soft); font-size:13.5px;' }, [
      `${profile.name}, roz sirf 10-15 minute. Speed apne aap badhegi! Level:`
    ]),
    rwLevelChips(profile),
    lastRead ? el('div', { style: 'font-size:13px; color:var(--ink-soft);' }, [`Last reading: ${lastRead.wpm} words/min · ${lastRead.acc}% sahi (target ~${RW_READ_TARGET[lvl]})`]) : null
  ]));
  const items = [
    ['read', '🗣️', 'Zor se padho', 'Passage padho, timer chalega. Speed (WPM) aur galtiyan milengi.'],
    ['flash', '⚡', 'Word Flash', '60 second mein kitne words turant pehchan sakti ho?'],
    ['write', '📝', 'Likho (copy-book)', 'Sentence suno, copy mein likho, time check karo.'],
    ['build', '🧩', 'Vakya banao', 'Bikhre words ko sahi sentence mein lagao.'],
    ['stats', '📈', 'Meri speed', 'Pichhle din ki speed ka chart aur roz ka plan.']
  ];
  items.forEach(([mode, icon, title, sub]) => {
    wrap.appendChild(el('div', { style: RW_CARD + 'display:flex; align-items:center; gap:14px; cursor:pointer;', onclick: () => rwGo(mode) }, [
      el('div', { style: 'font-size:30px;' }, [icon]),
      el('div', {}, [
        el('div', { style: 'font-weight:800; font-size:16px;' }, [title]),
        el('div', { style: 'font-size:13px; color:var(--ink-soft);' }, [sub])
      ])
    ]));
  });
  return wrap;
}

// ---------- 1. Reading aloud ----------
async function rwNewAiPassage(profile){
  const lvl = rwLevel(profile);
  const words = { 1: 30, 2: 55, 3: 80 }[lvl];
  RW.aiLoading = true; render();
  const sys = 'You write short reading passages for Indian school children. Respond with ONLY valid JSON, no markdown fences: {"title":"...","text":"..."}. Use simple, clear English, short sentences, Indian everyday context, no difficult names.';
  const user = `Write a fresh story or fact passage of about ${words} words for a Class ${profile.grade} child (reading level ${lvl} of 3). Plain text only, no quotes inside unless needed.`;
  try {
    let raw = await callClaude(sys, user, null, [], false);
    raw = raw.replace(/```json|```/g, '').trim();
    const p = JSON.parse(raw);
    if (p && p.text && p.text.split(/\s+/).length >= 15){ RW.passage = { title: p.title || 'New Story', text: p.text.trim() }; }
    else throw new Error('bad');
  } catch(e){
    RW.passage = rwPick(RW_PASSAGES[lvl], 1)[0];
  }
  RW.aiLoading = false; RW.phase = 'ready'; RW.missed = new Set(); RW.saved = false; render();
}
function rwChoosePassage(profile, p){
  RW.passage = p; RW.phase = 'ready'; RW.missed = new Set(); RW.saved = false; render();
}
function rwStartReading(){
  RW.phase = 'reading'; RW.startTs = Date.now(); RW.srBase = ''; RW.srCur = ''; RW.srOk = true;
  try { stopSpeaking(); } catch(e){}
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR){
    try {
      const r = new SR();
      r.lang = 'en-IN'; r.continuous = true; r.interimResults = true;
      r.onresult = (e) => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript + ' '; RW.srCur = s; };
      r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed'){ RW.srOk = false; } };
      r.onend = () => {
        if (RW.phase === 'reading' && RW.rec === r && RW.srOk){
          RW.srBase += ' ' + RW.srCur; RW.srCur = '';
          try { r.start(); } catch(e){}
        }
      };
      RW.rec = r; r.start();
    } catch(e){ RW.srOk = false; RW.rec = null; }
  } else { RW.srOk = false; }
  clearInterval(RW.timer);
  RW.timer = setInterval(() => {
    const t = document.getElementById('rw-timer');
    if (t) t.textContent = rwFmt((Date.now() - RW.startTs) / 1000);
  }, 500);
  render();
}
function rwFinishReading(){
  clearInterval(RW.timer);
  RW.secs = Math.max(1, (Date.now() - RW.startTs) / 1000);
  const words = RW.passage.text.split(/\s+/);
  const heard = (RW.srBase + ' ' + RW.srCur).split(/\s+/).map(rwNorm).filter(Boolean);
  RW.missed = new Set();
  if (RW.rec){ const r = RW.rec; RW.rec = null; try { r.onend = null; r.abort(); } catch(e){} }
  if (heard.length >= 3){
    let j = 0;
    words.forEach((w, i) => {
      const n = rwNorm(w); let found = -1;
      for (let k = j; k < Math.min(heard.length, j + 4); k++){ if (heard[k] === n){ found = k; break; } }
      if (found >= 0) j = found + 1; else RW.missed.add(i);
    });
  }
  RW.phase = 'done'; render();
}
function rwRead(profile){
  const wrap = el('div', {});
  wrap.appendChild(rwBack());
  const lvl = rwLevel(profile);
  if (RW.aiLoading){ wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, ['Nayi kahani ban rahi hai...'])); return wrap; }

  if (RW.phase === 'pick' || !RW.passage){
    wrap.appendChild(el('div', { style: RW_CARD }, [
      el('h2', { style: 'margin:0 0 6px;' }, ['Kya padhna hai?']),
      el('div', { style: 'color:var(--ink-soft); font-size:13px;' }, ['Level chuno, phir passage. Sahi se, saaf aur dheere-dheere padho - speed baad mein aayegi.']),
      rwLevelChips(profile)
    ]));
    RW_PASSAGES[lvl].forEach(p => {
      wrap.appendChild(el('div', { style: RW_CARD + 'cursor:pointer;', onclick: () => rwChoosePassage(profile, p) }, [
        el('div', { style: 'font-weight:800;' }, [p.title]),
        el('div', { style: 'font-size:12.5px; color:var(--ink-soft);' }, [p.text.split(/\s+/).length + ' words'])
      ]));
    });
    wrap.appendChild(rwBtn('✨ Nayi kahani (AI)', () => rwNewAiPassage(profile), false));
    return wrap;
  }

  const words = RW.passage.text.split(/\s+/);
  const card = el('div', { style: RW_CARD });
  card.appendChild(el('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;' }, [
    el('h2', { style: 'margin:0; font-size:18px;' }, [RW.passage.title]),
    RW.phase === 'reading' ? el('div', { id: 'rw-timer', style: "font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:18px;" }, ['0:00']) : null
  ]));

  const textBox = el('div', { style: 'font-size:22px; line-height:2; letter-spacing:.3px;' });
  words.forEach((w, i) => {
    const missed = RW.missed.has(i);
    const span = el('span', {
      style: 'cursor:pointer; padding:1px 3px; border-radius:6px; margin-right:2px;' + (missed ? 'background:#FBEAEC; color:var(--maroon); font-weight:700;' : ''),
      onclick: () => {
        if (RW.phase === 'ready') { speak(rwNorm(w) || w); }
        else if (RW.phase === 'done'){ if (RW.missed.has(i)) RW.missed.delete(i); else RW.missed.add(i); render(); }
      }
    }, [w]);
    textBox.appendChild(span); textBox.appendChild(document.createTextNode(' '));
  });
  card.appendChild(textBox);
  wrap.appendChild(card);

  if (RW.phase === 'ready'){
    wrap.appendChild(el('div', { style: 'text-align:center; color:var(--ink-soft); font-size:13px; margin-bottom:10px;' }, ['Kisi bhi word par tap karo to wo bolke batayega. Tayyar ho to Start dabao aur zor se padho.']));
    wrap.appendChild(el('div', { style: 'display:flex; gap:10px; justify-content:center; flex-wrap:wrap;' }, [
      rwBtn('🔊 Pehle sun lo', () => speak(RW.passage.text), false),
      rwBtn('▶ Start reading', rwStartReading, true),
      rwBtn('Doosra passage', () => { RW.phase = 'pick'; render(); }, false)
    ]));
  } else if (RW.phase === 'reading'){
    wrap.appendChild(el('div', { style: 'text-align:center; color:var(--ink-soft); font-size:13px; margin-bottom:10px;' }, [
      RW.srOk ? '🎤 Sun raha hoon... padhna khatam ho to Done dabao.' : 'Padhna khatam ho to Done dabao. (Mic nahi chal raha - Mummy/Papa galat words baad mein tap karke mark karenge.)'
    ]));
    wrap.appendChild(el('div', { style: 'text-align:center;' }, [rwBtn('✅ Done', rwFinishReading, true)]));
  } else if (RW.phase === 'done'){
    const n = words.length;
    const wpm = Math.round(n / (RW.secs / 60));
    const acc = Math.round(((n - RW.missed.size) / n) * 100);
    const target = RW_READ_TARGET[lvl];
    const msg = acc < 85 ? 'Pehle sahi padhna zaroori hai - laal words ko dobara dheere padho.'
      : wpm >= target ? 'Shabaash! Target speed pe ho. 🎉'
      : 'Accha! Isi passage ko ek baar aur padho - speed badh jayegi.';
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('div', { style: 'display:flex; justify-content:space-around; margin-bottom:10px;' }, [
        el('div', {}, [el('div', { style: 'font-size:30px; font-weight:800;' }, [String(wpm)]), el('div', { style: 'font-size:12px; color:var(--ink-soft);' }, ['words / min (target ~' + target + ')'])]),
        el('div', {}, [el('div', { style: 'font-size:30px; font-weight:800; color:' + (acc >= 90 ? 'var(--green-ok)' : 'var(--maroon)') + ';' }, [acc + '%']), el('div', { style: 'font-size:12px; color:var(--ink-soft);' }, ['sahi padhe'])]),
        el('div', {}, [el('div', { style: 'font-size:30px; font-weight:800;' }, [rwFmt(RW.secs)]), el('div', { style: 'font-size:12px; color:var(--ink-soft);' }, ['time'])])
      ]),
      el('div', { style: 'font-weight:700;' }, [msg]),
      el('div', { style: 'font-size:12.5px; color:var(--ink-soft); margin-top:6px;' }, ['Upar kisi word par tap karke sahi/galat badal sakte ho (laal = galat).'])
    ]));
    wrap.appendChild(el('div', { style: 'display:flex; gap:10px; justify-content:center; flex-wrap:wrap;' }, [
      rwBtn('🔊 Sahi tarah sun lo', () => speak(RW.passage.text), false),
      rwBtn('🔁 Phir se padho', () => { RW.phase = 'ready'; RW.missed = new Set(); RW.saved = false; render(); }, false),
      RW.saved ? el('div', { style: 'align-self:center; font-weight:700; color:var(--green-ok);' }, ['✓ Save ho gaya']) : rwBtn('💾 Save karo', async () => {
        RW.saved = true;
        rwAdd(profile.id, 'read', { d: new Date().toISOString().slice(0, 10), wpm, acc, lvl, n });
        render();
        await rwLog(profile, 'Reading', `${wpm} WPM · ${RW.passage.title}`, acc, 100);
        render();
      }, true),
      rwBtn('➡ Naya passage', () => { RW.phase = 'pick'; render(); }, false)
    ]));
  }
  return wrap;
}

// ---------- 2. Word Flash ----------
function rwFlash(profile){
  const wrap = el('div', {});
  wrap.appendChild(rwBack());
  const lvl = rwLevel(profile);
  if (RW.fPhase === 'pick'){
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('h2', { style: 'margin:0 0 6px;' }, ['⚡ Word Flash']),
      el('div', { style: 'color:var(--ink-soft); font-size:13.5px;' }, ['Word dikhega. Turant bol do. Pata hai to ✓, nahi pata to ✗ dabao. 60 second!']),
      rwLevelChips(profile),
      rwBtn('▶ Start', () => {
        RW.fWords = rwShuffle(RW_SIGHT[lvl]); RW.fIdx = 0; RW.fKnown = 0; RW.fMiss = [];
        RW.fEnd = Date.now() + 60000; RW.fPhase = 'play';
        clearInterval(RW.fTimer);
        RW.fTimer = setInterval(() => {
          const left = Math.max(0, Math.ceil((RW.fEnd - Date.now()) / 1000));
          const t = document.getElementById('rw-ftimer');
          if (t) t.textContent = left + 's';
          if (left <= 0) rwFlashEnd(profile);
        }, 250);
        render();
      }, true)
    ]));
    return wrap;
  }
  if (RW.fPhase === 'play'){
    if (RW.fIdx >= RW.fWords.length){ rwFlashEnd(profile); return wrap; }
    const w = RW.fWords[RW.fIdx];
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('div', { style: "display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-weight:700;" }, [
        el('div', { id: 'rw-ftimer' }, [Math.max(0, Math.ceil((RW.fEnd - Date.now()) / 1000)) + 's']),
        el('div', {}, ['✓ ' + RW.fKnown])
      ]),
      el('div', { style: 'font-size:54px; font-weight:800; margin:34px 0; letter-spacing:1px; cursor:pointer;', onclick: () => speak(w) }, [w]),
      el('div', { style: 'display:flex; gap:14px; justify-content:center;' }, [
        el('button', { style: RW_BIG_BTN + 'background:var(--green-ok); color:#fff;', onclick: () => { RW.fKnown++; RW.fIdx++; render(); } }, ['✓ Pata hai']),
        el('button', { style: RW_BIG_BTN + 'background:var(--maroon); color:#fff;', onclick: () => { RW.fMiss.push(w); RW.fIdx++; render(); } }, ['✗ Nahi pata'])
      ]),
      el('div', { style: 'font-size:12px; color:var(--ink-soft); margin-top:12px;' }, ['Word par tap karo to sun sakte ho.'])
    ]));
    return wrap;
  }
  // done
  const total = RW.fKnown + RW.fMiss.length;
  wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
    el('h2', { style: 'margin:0 0 6px;' }, [`${RW.fKnown} words turant pehchane! 🎉`]),
    RW.fMiss.length ? el('div', { style: 'margin:10px 0;' }, [
      el('div', { style: 'font-size:13px; color:var(--ink-soft); margin-bottom:6px;' }, ['Ye words kal phir practice karenge (tap karke suno):']),
      el('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; justify-content:center;' },
        RW.fMiss.map(w => el('span', { style: 'background:#FBEAEC; color:var(--maroon); font-weight:700; padding:6px 12px; border-radius:20px; cursor:pointer;', onclick: () => speak(w) }, [w])))
    ]) : null,
    el('div', { style: 'display:flex; gap:10px; justify-content:center; margin-top:12px;' }, [
      rwBtn('🔁 Phir se', () => { RW.fPhase = 'pick'; render(); }, true),
      rwBtn('Menu', () => rwGo('home'), false)
    ])
  ]));
  return wrap;
}
async function rwFlashEnd(profile){
  if (RW.fPhase !== 'play') return;
  clearInterval(RW.fTimer);
  RW.fPhase = 'done';
  const total = RW.fKnown + RW.fMiss.length;
  render();
  if (total > 0){
    rwAdd(profile.id, 'flash', { d: new Date().toISOString().slice(0, 10), known: RW.fKnown, total });
    await rwLog(profile, 'Reading', 'Word Flash', RW.fKnown, total);
  }
}

// ---------- 3. Writing speed (copy-book) ----------
function rwWrite(profile){
  const wrap = el('div', {});
  wrap.appendChild(rwBack());
  const lvl = rwLevel(profile);
  const target = RW_WRITE_TARGET[lvl];
  if (RW.wPhase === 'pick'){
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('h2', { style: 'margin:0 0 6px;' }, ['📝 Copy-book mein likho']),
      el('div', { style: 'color:var(--ink-soft); font-size:13.5px; line-height:1.6;' }, ['Asli notebook aur pencil lo. App sentence bolega aur dikhayega. Tum copy mein likho, phir "Likh liya" dabao. Saaf likhna pehle, speed baad mein.']),
      rwLevelChips(profile),
      rwBtn('▶ Pehla sentence', () => { RW.wCount = 0; rwNextSentence(lvl); }, true)
    ]));
    return wrap;
  }
  const s = RW.wSentence, nWords = s.split(/\s+/).length;
  if (RW.wPhase === 'writing'){
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('div', { style: "font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:20px;", id: 'rw-wtimer' }, ['0:00']),
      el('div', { style: 'font-size:26px; line-height:1.7; margin:16px 0; font-weight:700;' }, [s]),
      el('div', { style: 'display:flex; gap:10px; justify-content:center; flex-wrap:wrap;' }, [
        rwBtn('🔊 Phir se suno', () => speak(s), false),
        rwBtn('✅ Likh liya', () => {
          clearInterval(RW.wTimer);
          RW.wSecs = Math.max(1, (Date.now() - RW.wStart) / 1000);
          RW.wPhase = 'check'; render();
        }, true)
      ])
    ]));
    return wrap;
  }
  // check phase
  const wpm = Math.round(nWords / (RW.wSecs / 60) * 10) / 10;
  wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
    el('div', { style: 'font-size:15px; color:var(--ink-soft);' }, ['Tumne ' + nWords + ' words ' + rwFmt(RW.wSecs) + ' mein likhe']),
    el('div', { style: 'font-size:30px; font-weight:800; margin:6px 0;' }, [wpm + ' words/min']),
    el('div', { style: 'font-size:13px; color:var(--ink-soft);' }, ['Target ~' + target + ' words/min']),
    el('div', { style: 'font-size:15px; margin:14px 0 6px; line-height:1.6;' }, ['Mummy/Papa: spelling, capital letter aur full stop dekho. Saaf aur sahi likha hai?']),
    el('div', { style: 'font-size:19px; font-weight:700; margin-bottom:12px;' }, [s]),
    el('div', { style: 'display:flex; gap:10px; justify-content:center; flex-wrap:wrap;' }, [
      el('button', { style: RW_BIG_BTN + 'background:var(--green-ok); color:#fff;', onclick: async () => {
        rwAdd(profile.id, 'write', { d: new Date().toISOString().slice(0, 10), wpm, ok: 1, lvl });
        RW.wCount++; await rwLog(profile, 'Writing', `Copy-book ${wpm} WPM`, 1, 1);
        if (RW.wCount >= 5){ RW.wPhase = 'pick'; render(); } else rwNextSentence(lvl);
      } }, ['✓ Sahi, agla']),
      el('button', { style: RW_BIG_BTN + 'background:var(--maroon); color:#fff;', onclick: async () => {
        rwAdd(profile.id, 'write', { d: new Date().toISOString().slice(0, 10), wpm, ok: 0, lvl });
        RW.wCount++; await rwLog(profile, 'Writing', `Copy-book ${wpm} WPM`, 0, 1);
        if (RW.wCount >= 5){ RW.wPhase = 'pick'; render(); } else rwNextSentence(lvl);
      } }, ['✗ Galti thi, agla'])
    ]),
    el('div', { style: 'font-size:12px; color:var(--ink-soft); margin-top:10px;' }, [`${RW.wCount + 1} / 5 sentences`])
  ]));
  return wrap;
}
function rwNextSentence(lvl){
  RW.wSentence = rwPick(RW_SENTENCES[lvl], 1)[0];
  RW.wPhase = 'writing'; RW.wStart = Date.now();
  clearInterval(RW.wTimer);
  RW.wTimer = setInterval(() => {
    const t = document.getElementById('rw-wtimer');
    if (t) t.textContent = rwFmt((Date.now() - RW.wStart) / 1000);
  }, 500);
  render();
  speak(RW.wSentence);
}

// ---------- 4. Sentence builder ----------
function rwBuildSetup(lvl){
  RW.bRounds = rwPick(RW_SENTENCES[lvl], 6); RW.bIdx = 0; RW.bScore = 0; RW.bResult = null; RW.bPhase = 'play';
  rwBuildRound();
}
function rwBuildRound(){
  const s = RW.bRounds[RW.bIdx];
  RW.bPicked = []; RW.bResult = null;
  const words = s.split(/\s+/);
  let pool = words.map((w, i) => ({ w, i }));
  let tries = 0;
  do { pool = rwShuffle(pool); tries++; } while (pool.every((x, k) => x.i === k) && tries < 5);
  RW.bPool = pool;
}
function rwBuild(profile){
  const wrap = el('div', {});
  wrap.appendChild(rwBack());
  const lvl = rwLevel(profile);
  if (RW.bPhase === 'pick'){
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('h2', { style: 'margin:0 0 6px;' }, ['🧩 Vakya banao']),
      el('div', { style: 'color:var(--ink-soft); font-size:13.5px;' }, ['Bikhre hue words par sahi order mein tap karo aur sentence banao.']),
      rwLevelChips(profile),
      rwBtn('▶ Start', () => { rwBuildSetup(lvl); render(); }, true)
    ]));
    return wrap;
  }
  if (RW.bIdx >= RW.bRounds.length){
    const total = RW.bRounds.length;
    wrap.appendChild(el('div', { style: RW_CARD + 'text-align:center;' }, [
      el('h2', { style: 'margin:0 0 6px;' }, [`Score: ${RW.bScore} / ${total} 🎉`]),
      el('div', { style: 'display:flex; gap:10px; justify-content:center; margin-top:12px;' }, [
        rwBtn('🔁 Phir se', () => { rwBuildSetup(lvl); render(); }, true),
        rwBtn('Menu', () => rwGo('home'), false)
      ])
    ]));
    return wrap;
  }
  const correct = RW.bRounds[RW.bIdx];
  const answerBox = el('div', { style: 'min-height:56px; border:2px dashed var(--line); border-radius:12px; padding:10px; display:flex; flex-wrap:wrap; gap:8px; margin:12px 0;' },
    RW.bPicked.map((x, k) => el('span', { style: 'background:var(--gold); color:#2B1B05; font-weight:700; padding:8px 12px; border-radius:10px; font-size:17px; cursor:pointer;', onclick: () => {
      if (RW.bResult) return; RW.bPicked.splice(k, 1); render();
    } }, [x.w])));
  const poolBox = el('div', { style: 'display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px;' },
    RW.bPool.map(x => {
      const used = RW.bPicked.includes(x);
      return el('span', { style: 'background:' + (used ? '#eee' : '#fff') + '; border:1.5px solid var(--line); font-weight:700; padding:8px 12px; border-radius:10px; font-size:17px; cursor:pointer; opacity:' + (used ? '.35' : '1') + ';', onclick: () => {
        if (used || RW.bResult) return; RW.bPicked.push(x); speak(x.w); render();
      } }, [x.w]);
    }));
  const card = el('div', { style: RW_CARD }, [
    el('div', { style: 'font-size:12px; color:var(--ink-soft);' }, [`Sentence ${RW.bIdx + 1} / ${RW.bRounds.length} · Score ${RW.bScore}`]),
    answerBox, poolBox
  ]);
  if (RW.bResult){
    card.appendChild(el('div', { style: 'font-weight:800; font-size:16px; margin-bottom:10px; color:' + (RW.bResult === 'ok' ? 'var(--green-ok)' : 'var(--maroon)') + ';' }, [
      RW.bResult === 'ok' ? '✓ Bilkul sahi!' : '✗ Sahi sentence: ' + correct
    ]));
    card.appendChild(el('div', { style: 'text-align:center;' }, [rwBtn('Agla →', () => { RW.bIdx++; if (RW.bIdx < RW.bRounds.length) rwBuildRound(); render(); }, true)]));
  } else {
    card.appendChild(el('div', { style: 'display:flex; gap:10px; justify-content:center;' }, [
      rwBtn('↺ Hatao', () => { RW.bPicked = []; render(); }, false),
      rwBtn('Check', async () => {
        if (RW.bPicked.length !== RW.bPool.length) return;
        const ok = RW.bPicked.map(x => x.w).join(' ') === correct;
        RW.bResult = ok ? 'ok' : 'no'; if (ok) RW.bScore++;
        if (RW.bIdx === RW.bRounds.length - 1){
          rwAdd(profile.id, 'build', { d: new Date().toISOString().slice(0, 10), score: RW.bScore, total: RW.bRounds.length });
          rwLog(profile, 'Writing', 'Sentence building', RW.bScore, RW.bRounds.length);
        }
        render();
      }, true)
    ]));
  }
  wrap.appendChild(card);
  return wrap;
}

// ---------- 5. Stats and daily plan ----------
function rwStats(profile){
  const wrap = el('div', {});
  wrap.appendChild(rwBack());
  const h = rwHist(profile.id);
  const lvl = rwLevel(profile);
  const target = RW_READ_TARGET[lvl];

  const reads = h.read.slice(-10);
  const chart = el('div', { style: RW_CARD });
  chart.appendChild(el('h3', { style: 'margin:0 0 4px;' }, ['📈 Padhne ki speed (words/min)']));
  if (!reads.length){
    chart.appendChild(el('div', { style: 'color:var(--ink-soft); font-size:13px;' }, ['Abhi koi reading save nahi hui. "Zor se padho" se shuru karo.']));
  } else {
    const max = Math.max(target * 1.3, ...reads.map(r => r.wpm));
    const bars = el('div', { style: 'display:flex; align-items:flex-end; gap:6px; height:130px; margin-top:10px; position:relative;' });
    const tl = el('div', { style: `position:absolute; left:0; right:0; bottom:${Math.round(target / max * 100)}%; border-top:2px dashed var(--maroon); font-size:10px; color:var(--maroon);` }, ['target ' + target]);
    bars.appendChild(tl);
    reads.forEach(r => {
      bars.appendChild(el('div', { style: 'flex:1; text-align:center;' }, [
        el('div', { style: 'font-size:10px;' }, [String(r.wpm)]),
        el('div', { style: `height:${Math.max(4, Math.round(r.wpm / max * 100))}px; background:${r.acc >= 90 ? 'var(--green-ok)' : 'var(--gold)'}; border-radius:6px 6px 0 0;` })
      ]));
    });
    chart.appendChild(bars);
    chart.appendChild(el('div', { style: 'font-size:11.5px; color:var(--ink-soft); margin-top:6px;' }, ['Hara = 90%+ sahi padha. Peela = galtiyan zyada - pehle accuracy.']));
  }
  wrap.appendChild(chart);

  const wr = h.write.slice(-10);
  const avgW = wr.length ? Math.round(wr.reduce((a, r) => a + r.wpm, 0) / wr.length * 10) / 10 : null;
  const okW = wr.length ? Math.round(wr.filter(r => r.ok).length / wr.length * 100) : null;
  wrap.appendChild(el('div', { style: RW_CARD }, [
    el('h3', { style: 'margin:0 0 6px;' }, ['📝 Likhne ki speed']),
    avgW === null ? el('div', { style: 'color:var(--ink-soft); font-size:13px;' }, ['Abhi koi copy-book practice nahi hui.'])
      : el('div', { style: 'font-size:15px;' }, [`Average ${avgW} words/min (target ~${RW_WRITE_TARGET[lvl]}) · ${okW}% sentences saaf aur sahi`])
  ]));

  const f = h.flash.slice(-5);
  wrap.appendChild(el('div', { style: RW_CARD }, [
    el('h3', { style: 'margin:0 0 6px;' }, ['⚡ Word Flash']),
    f.length ? el('div', { style: 'font-size:15px;' }, ['Pichhle rounds: ' + f.map(x => x.known + '/' + x.total).join(' · ')])
      : el('div', { style: 'color:var(--ink-soft); font-size:13px;' }, ['Abhi koi round nahi.'])
  ]));

  wrap.appendChild(el('div', { style: RW_CARD }, [
    el('h3', { style: 'margin:0 0 8px;' }, ['🗓️ Roz ka 15-minute plan']),
    el('ol', { style: 'margin:0; padding-left:20px; line-height:1.9; font-size:14.5px;' }, [
      el('li', {}, ['5 min - Zor se padho: ek chhota passage, 2 baar. Dusri baar speed badhao.']),
      el('li', {}, ['2 min - Word Flash: 60 second ka ek round.']),
      el('li', {}, ['5 min - Copy-book: 3-5 sentences, saaf likhai. Capital letter aur full stop yaad rakho.']),
      el('li', {}, ['3 min - Vakya banao ya ghar ki koi kahani/akhbaar ke 5 line padho.'])
    ]),
    el('div', { style: 'font-size:12.5px; color:var(--ink-soft); margin-top:8px; line-height:1.6;' }, ['Tip: Roz thoda karna, hafte mein ek baar bahut karne se behtar hai. Galti par daantna nahi - tareef karo. 2-3 hafte mein farak dikhega.'])
  ]));
  return wrap;
}

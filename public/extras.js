// Extras: weekly parent report, weak-topic revision, homework planner.
// Loaded after index.html's main script; uses el(), state, activeProfile(), render(), generateQuiz().

const HW = { subject: '', task: '', due: '' };
function hwKey(id){ return 'apnaTutorHW_' + id; }
function hwLoad(id){ try { return JSON.parse(localStorage.getItem(hwKey(id)) || '[]'); } catch(e){ return []; } }
function hwSave(id, list){ try { localStorage.setItem(hwKey(id), JSON.stringify(list)); } catch(e){} }
function exToday(){ return new Date().toISOString().slice(0,10); }
function exDaysAgo(n){ const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); }

function renderHomework(){
  const profile = activeProfile();
  if (!profile) return el('div', {class:'empty-state'}, [el('h2',{},['Welcome!']), el('p',{},['Add your first child on the left to get started.'])]);
  const wrap = el('div', {style:'max-width:620px; margin:0 auto;'});
  const list = hwLoad(profile.id);
  const card = 'background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin-bottom:12px;';
  const inp = 'width:100%; box-sizing:border-box; padding:10px 12px; font-size:14px; border:1.5px solid var(--line); border-radius:8px; margin-bottom:8px;';
  const subjects = subjectsForGrade(profile.grade, profile.stream);
  const sel = el('select', {style:inp, onchange:(e)=>{ HW.subject = e.target.value; }}, subjects.map(s=>el('option',{value:s},[s])));
  if (HW.subject) sel.value = HW.subject; else HW.subject = subjects[0] || '';
  const task = el('input', {style:inp, placeholder:'Homework / kaam (jaise: Page 24 copy likhna)', value:HW.task, oninput:(e)=>{ HW.task = e.target.value; }});
  const due = el('input', {type:'date', style:inp, value: HW.due || exToday(), onchange:(e)=>{ HW.due = e.target.value; }});
  wrap.appendChild(el('div', {style:card}, [
    el('h3', {style:'margin:0 0 10px;'}, ['📚 Homework planner']),
    sel, task, due,
    el('button', {class:'quiz-start-btn', onclick:()=>{
      if (!HW.task.trim()) return;
      list.push({ id: Date.now(), subject: HW.subject, task: HW.task.trim(), due: HW.due || exToday(), done: false, doneOn: null });
      HW.task = ''; hwSave(profile.id, list); render();
    }}, ['+ Add'])
  ]));
  const today = exToday();
  const open = list.filter(x=>!x.done).sort((a,b)=>a.due.localeCompare(b.due));
  const done = list.filter(x=>x.done).slice(-5).reverse();
  const row = (x)=>{
    const late = !x.done && x.due < today, isToday = x.due === today;
    return el('div', {style:'display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--line);'}, [
      el('input', {type:'checkbox', style:'width:22px; height:22px;', ...(x.done ? {checked:'checked'} : {}), onchange:()=>{
        x.done = !x.done; x.doneOn = x.done ? today : null; hwSave(profile.id, list); render();
      }}),
      el('div', {style:'flex:1;' + (x.done ? 'text-decoration:line-through; opacity:.6;' : '')}, [
        el('div', {style:'font-weight:700; font-size:14.5px;'}, [x.task]),
        el('div', {style:'font-size:12px; color:'+(late?'var(--maroon)':'var(--ink-soft)')+';'}, [x.subject + ' · ' + (late ? 'late! ' : isToday ? 'aaj ' : '') + x.due])
      ]),
      el('span', {style:'cursor:pointer; color:var(--maroon); font-weight:700;', onclick:()=>{ hwSave(profile.id, list.filter(y=>y.id!==x.id)); render(); }}, ['×'])
    ]);
  };
  wrap.appendChild(el('div', {style:card}, [
    el('h3', {style:'margin:0 0 4px;'}, [`Baaki kaam (${open.length})`]),
    open.length ? el('div', {}, open.map(row)) : el('div', {style:'color:var(--ink-soft); font-size:13px;'}, ['Sab ho gaya! 🎉'])
  ]));
  if (done.length) wrap.appendChild(el('div', {style:card}, [el('h3', {style:'margin:0 0 4px;'}, ['Ho gaya']), el('div', {}, done.map(row))]));
  return wrap;
}

// Topics where quiz scores are low - tap to revise with a fresh quiz.
function weakTopics(profileId){
  const by = {};
  (state.progress[profileId] || []).forEach(e=>{
    if (!e.total || e.subject === 'Reading' || e.subject === 'Writing') return;
    const k = e.subject + '||' + (e.topic || 'General');
    (by[k] = by[k] || []).push(e.score / e.total);
  });
  return Object.keys(by).map(k=>{
    const arr = by[k].slice(0, 3); const avg = arr.reduce((a,b)=>a+b,0) / arr.length;
    const [subject, topic] = k.split('||'); return { subject, topic, avg };
  }).filter(x=>x.avg < 0.6).sort((a,b)=>a.avg-b.avg).slice(0, 5);
}

function weeklyReportText(profile){
  const since = exDaysAgo(6), list = (state.progress[profile.id] || []).filter(e=>e.date >= since);
  const quiz = list.filter(e=>e.subject !== 'Reading' && e.subject !== 'Writing');
  const rd = list.filter(e=>e.subject === 'Reading' && /WPM/.test(e.topic || ''));
  const wr = list.filter(e=>e.subject === 'Writing');
  const days = new Set(list.map(e=>e.date)).size;
  const avg = quiz.length ? Math.round(quiz.reduce((a,e)=>a + e.score/e.total, 0) / quiz.length * 100) : null;
  const wpm = rd.map(e=>parseInt(e.topic, 10)).filter(n=>!isNaN(n));
  const lines = [`📊 ${profile.name} ka weekly report (pichhle 7 din)`, `Active days: ${days}/7`];
  if (quiz.length) lines.push(`Quizzes: ${quiz.length}, average ${avg}%`);
  if (wpm.length) lines.push(`Reading: ${rd.length} sessions, best ${Math.max(...wpm)} words/min`);
  if (wr.length) lines.push(`Writing practice: ${wr.length} sentences`);
  const weak = weakTopics(profile.id);
  if (weak.length) lines.push('Revise karna hai: ' + weak.map(w=>`${w.subject} - ${w.topic}`).join(', '));
  if (!list.length) lines.push('Is hafte abhi koi practice nahi hui.');
  return lines.join('\n');
}

function renderProgressExtras(){
  const profile = activeProfile();
  if (!profile) return el('div', {});
  const card = 'background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin:14px 0;';
  const wrap = el('div', {style:'max-width:620px; margin:0 auto;'});
  const weak = weakTopics(profile.id);
  wrap.appendChild(el('div', {style:card}, [
    el('h3', {style:'margin:0 0 8px;'}, ['🔁 Revise karne wale topics']),
    weak.length ? el('div', {}, weak.map(w=>el('div', {style:'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line);'}, [
      el('div', {style:'flex:1; font-size:14px;'}, [el('b', {}, [w.subject]), ' · ' + w.topic + ' ', el('span', {style:'color:var(--maroon); font-weight:700;'}, [Math.round(w.avg*100)+'%'])]),
      el('button', {class:'quiz-start-btn', style:'padding:7px 12px; font-size:12.5px;', onclick:()=>{
        state.activeSubject = w.subject; state.topic = w.topic === 'General' ? '' : w.topic; state.activeTab = 'quiz'; generateQuiz();
      }}, ['Quiz do'])
    ]))) : el('div', {style:'color:var(--ink-soft); font-size:13px;'}, ['Abhi koi kamzor topic nahi (60% se neeche). Quiz dete raho!'])
  ]));
  const text = weeklyReportText(profile);
  wrap.appendChild(el('div', {style:card}, [
    el('h3', {style:'margin:0 0 8px;'}, ['📊 Weekly report']),
    el('pre', {style:'white-space:pre-wrap; font-family:inherit; font-size:14px; margin:0 0 10px;'}, [text]),
    el('a', {class:'quiz-start-btn', style:'display:inline-block; text-decoration:none;', target:'_blank', rel:'noopener', href:'https://wa.me/?text=' + encodeURIComponent(text)}, ['WhatsApp par bhejo'])
  ]));
  return wrap;
}

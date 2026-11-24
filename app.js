/* ============================================================
   app.js — логіка симулятора.
   Питання беруться з questions.js (window.QUESTIONS, window.SIGNS),
   малювання повідомлень — з render.js.
   ============================================================ */

const CONFIG = {
  /* СПОСІБ 1 (простий, без дозволів): Google Форма.
     FORM_URL — адреса форми, у якій «viewform» замінено на «formResponse».
     FORM_FIELDS — номери полів (entry.…) з «попередньо заповненого посилання». */
  FORM_URL: '',
  FORM_FIELDS: {
    test:    'entry.0000000001',
    group:   'entry.0000000002',
    code:    'entry.0000000003',
    score:   'entry.0000000004',
    pattern: 'entry.0000000005',   // правильність по прикладах (за номером), напр. ++-+-++-++
    details: 'entry.0000000006'    // усі деталі
  },
  /* СПОСІБ 2: Google Apps Script (веб-застосунок, що приймає POST). */
  SUBMIT_URL: '',
  SHUFFLE: true,             // перемішувати порядок прикладів
  SHOW_SCORE_AT_END: false   // у режимі дослідження бал не показується
};

const SIGNS = window.SIGNS;

/* ---------- Стан ---------- */
const qs = new URLSearchParams(location.search);
/* ?draft=1 — перевірка змін з редактора (чернетка зберігається в браузері) */
let QUESTIONS = window.QUESTIONS;
if (qs.get('draft') === '1'){
  try { const d = localStorage.getItem('phishsim.draft'); if (d) QUESTIONS = JSON.parse(d); } catch(e){}
}

/* Режими, які обирають на стартовому екрані */
const MODES = {
  '1':   {title:'Тест «до»',         learn:false, desc:n => `Ти побачиш <b>${n}</b> повідомлень. Для кожного виріши: <b>фішинг</b> чи <b>безпечне</b>. Підказок не буде.`},
  'L':   {title:'Навчання',          learn:true,  desc:n => `Спочатку коротка пам'ятка «7 ознак фішингу», потім <b>${n}</b> флеш-карток. Після кожної відповіді — пояснення, а помилки повторюються.`},
  '2':   {title:'Тест «після»',      learn:false, desc:n => `Ти побачиш <b>${n}</b> нових повідомлень. Для кожного виріши: <b>фішинг</b> чи <b>безпечне</b>. Підказок не буде.`},
  'ALL': {title:'Вільне тренування', learn:true,  desc:n => `Усі <b>${n}</b> прикладів з поясненнями, у форматі флеш-карток. Для самопідготовки — не для дослідження.`}
};

let TEST_NO = null;     // '1' | 'L' | '2' | 'ALL'
let LEARN = false;      // навчання: пам'ятка + флеш-картки
let TRAIN = false;      // показувати пояснення після відповіді
let items = [];
let idx = 0, shownAt = 0, cur = null;
const log = [];
let startedAt = new Date();

function itemsFor(mode){
  if (mode === 'ALL') return ['1','2','L'].flatMap(k => (QUESTIONS[k] || []).map(q => ({...q})));
  return (QUESTIONS[mode] || []).slice();
}

/* ---------- Старт ---------- */
const $ = id => document.getElementById(id);
if (qs.get('draft') === '1') document.querySelector('#start .badge').textContent = 'Перевірка чернетки з редактора';
if (qs.get('g') === 'E' || qs.get('g') === 'K') $('group').value = qs.get('g');

function selectMode(mode){
  TEST_NO = mode;
  LEARN = MODES[mode].learn;
  TRAIN = qs.get('mode') === 'train' || LEARN;
  items = itemsFor(mode);
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('modeDesc').innerHTML = MODES[mode].desc(items.length);
  $('modeDesc').classList.remove('hidden');
  // у вільному тренуванні група й код не потрібні
  const free = mode === 'ALL';
  $('studyFields').classList.toggle('hidden', free);
  validate();
}
document.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => selectMode(b.dataset.mode));

function validate(){
  const free = TEST_NO === 'ALL';
  $('startBtn').disabled = !(TEST_NO && (free || ($('group').value && /^\d{4}$/.test($('code').value) && $('honest').checked)));
}
['group','code','honest'].forEach(id => $(id).addEventListener('input', validate));
$('honest').addEventListener('change', validate);

// режим можна, як і раніше, задати посиланням: ?t=1, ?t=L, ?t=2
const tParam = qs.get('t');
if (tParam && MODES[tParam]) selectMode(tParam); else validate();

$('startBtn').onclick = () => {
  if (CONFIG.SHUFFLE) items.sort(() => Math.random() - 0.5);
  startedAt = new Date();
  $('start').classList.add('hidden');
  window.scrollTo(0,0);
  if (LEARN){ $('introCount').textContent = items.length; $('intro').classList.remove('hidden'); return; }
  $('test').classList.remove('hidden');
  show();
};
$('introBtn').onclick = () => {
  $('intro').classList.add('hidden');
  $('test').classList.remove('hidden');
  window.scrollTo(0,0);
  show();
};
$('menuBtn').onclick = () => { location.href = location.pathname + (qs.get('draft') === '1' ? '?draft=1' : ''); };

/* ---------- Показ повідомлення ---------- */
function show(){
  const it = items[idx];
  cur = {id:it.id, repeat:it.repeat||0, phishing:it.phishing, answer:null, correct:null, timeMs:0,
         inspected:false, clickedLink:false, openedAttachment:false};
  $('counter').textContent = (LEARN ? 'Картка ' : '') + `${idx+1} / ${items.length}` + (it.repeat ? ' · повтор' : '');
  $('bar').style.width = (idx/items.length*100) + '%';
  renderContext(it, $('context'));
  renderMessage(it, $('message'), {
    onHover: href => {                       // навели курсор на посилання — показати адресу
      if (href){ $('urlbar').textContent = '→ ' + href; $('urlbar').style.display = 'block'; cur.inspected = true; }
      else $('urlbar').style.display = 'none';
    },
    onLink: href => openSheet('Посилання веде на:', href, 'link'),
    onFile: name => openSheet('Відкрити файл?', name, 'file'),
    onQR:   url  => openSheet('QR-код веде на:', url, 'link')
  });
  $('answers').classList.remove('hidden');
  $('fbBox').classList.add('hidden');
  shownAt = performance.now();
}

/* ---------- Панель посилань / файлів ---------- */
let sheetKind = null;
function openSheet(title, addr, kind){
  sheetKind = kind; cur.inspected = true;
  $('sheetTitle').textContent = title; $('sheetAddr').textContent = addr;
  $('sheetNote').classList.add('hidden'); $('sheetOpen').classList.remove('hidden');
  $('sheetBg').style.display='flex';
}
$('sheetClose').onclick = () => { $('sheetBg').style.display='none'; };
$('sheetOpen').onclick = () => {
  if (sheetKind==='file') cur.openedAttachment = true; else cur.clickedLink = true;
  $('sheetNote').textContent = 'Це навчальний симулятор — нічого не відкривається. Тепер вирішуй: фішинг чи безпечно?';
  $('sheetNote').classList.remove('hidden'); $('sheetOpen').classList.add('hidden');
};
$('sheetBg').addEventListener('click', e => { if(e.target.id==='sheetBg') $('sheetBg').style.display='none'; });

/* ---------- Відповідь ---------- */
document.querySelectorAll('#answers button').forEach(b => b.onclick = () => answer(b.dataset.a));

function answer(a){
  const it = items[idx];
  cur.answer = a;
  cur.correct = (a==='phish') === it.phishing;
  cur.timeMs = Math.round(performance.now() - shownAt);
  log.push(cur);
  if (LEARN && !cur.correct && (it.repeat||0) < 2) items.push({...it, repeat:(it.repeat||0)+1});
  $('urlbar').style.display='none';
  if (TRAIN) return feedback(it);
  next();
}

function feedback(it){
  $('answers').classList.add('hidden');
  const box = $('fbBox'); box.innerHTML=''; box.classList.remove('hidden');
  const f = el('div','feedback '+(cur.correct?'good':'bad'));
  f.appendChild(el('b',null,(cur.correct?'Правильно! ':'Неправильно. ')+(it.phishing?'Це фішинг.':'Це безпечне повідомлення.')));
  f.appendChild(el('p',null,it.explain));
  if (LEARN && !cur.correct && (it.repeat||0) < 2) f.appendChild(el('p','small','🔁 Ця картка повториться наприкінці колоди.'));
  if (LEARN && cur.correct && it.repeat) f.appendChild(el('p','small','✓ Картку засвоєно після повторення.'));
  if (it.signs.length){
    const ul = el('ul'); it.signs.forEach(s => ul.appendChild(el('li',null,SIGNS[s]))); f.appendChild(el('div','small','Ознаки:')); f.appendChild(ul);
  }
  const btn = el('button','btn',idx+1<items.length?'Далі':'Завершити'); btn.onclick = next;
  box.append(f,btn);
  box.scrollIntoView({behavior:'smooth', block:'start'});
}

function next(){
  idx++;
  if (idx < items.length){ show(); window.scrollTo(0,0); } else finish();
}

/* ---------- Завершення ---------- */
function finish(){
  $('test').classList.add('hidden'); $('finish').classList.remove('hidden');
  const first = log.filter(r=>!r.repeat);              // перші спроби (по одній на картку)
  const repeats = log.length - first.length;            // скільки повторів знадобилося
  const score = first.filter(r=>r.correct).length;
  const payload = {
    test: TEST_NO, group: $('group').value, code: $('code').value, mode: TRAIN?'train':'study',
    score, total: first.length, repeats,
    durationSec: Math.round((new Date()-startedAt)/1000),
    startedAt: startedAt.toISOString(),
    items: log
  };
  const fb = $('finishBody');
  if (TRAIN || CONFIG.SHOW_SCORE_AT_END){
    fb.appendChild(el('div','score',`${score} / ${first.length}`));
    if (LEARN) fb.appendChild(el('p',null,`З першої спроби правильно: ${score} з ${first.length}. Повторів карток знадобилося: ${repeats}.`));
  }
  if (LEARN){
    fb.appendChild(el('p',null,'Тренування завершено! Запам\'ятай головне правило:'));
    const r = el('div','rule'); r.innerHTML = '<b>Зупинись — Перевір — Повідом</b><br>Не поспішай клікати, перевір адресу й відправника, а якщо сумніваєшся — розкажи дорослим.';
    fb.appendChild(r);
  }
  if (TEST_NO === 'ALL') return;   // вільне тренування: результати нікуди не надсилаються
  fb.appendChild(el('p',null,'Будь ласка, не розповідай іншим учасникам про приклади, доки всі не пройдуть тест.'));

  if (CONFIG.FORM_URL){
    // Порядок прикладів однаковий для всіх (за id), щоб «pattern» легко аналізувати
    const sorted = first.slice().sort((a,b)=>a.id.localeCompare(b.id));
    const pattern = sorted.map(r=>r.correct?'+':'-').join('');
    const details = sorted.map(r=>[r.id, r.answer, r.correct?1:0, r.timeMs,
      'перевіряв:'+(r.inspected?1:0), 'відкрив_посилання:'+(r.clickedLink?1:0),
      'відкрив_файл:'+(r.openedAttachment?1:0)].join(' ')).join('; ')
      + ` | повторів ${repeats} | тривалість ${payload.durationSec} с | режим ${payload.mode}`;
    const F = CONFIG.FORM_FIELDS, body = new URLSearchParams();
    body.append(F.test, payload.test); body.append(F.group, payload.group);
    body.append(F.code, payload.code); body.append(F.score, payload.score);
    body.append(F.pattern, pattern); body.append(F.details, details);
    fetch(CONFIG.FORM_URL,{method:'POST',mode:'no-cors',body})
      .then(()=>fb.appendChild(el('p','small','Результат надіслано досліднику.')))
      .catch(()=>showCode(fb,payload));
  } else if (CONFIG.SUBMIT_URL){
    fetch(CONFIG.SUBMIT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)})
      .then(()=>fb.appendChild(el('p','small','Результат надіслано досліднику.')))
      .catch(()=>showCode(fb,payload));
  } else showCode(fb,payload);
}

function showCode(fb,payload){
  // Простий підсумок: учасник робить скріншот і надсилає досліднику
  const sorted = payload.items.filter(r=>!r.repeat).sort((a,b)=>a.id.localeCompare(b.id));
  const pattern = sorted.map(r=>r.correct?'+':'-').join('');
  fb.appendChild(el('p',null,'Зроби скріншот цього блоку й надішли досліднику:'));
  const box = el('div','feedback good');
  const rows = [
    ['Етап', payload.test==='1' ? 'тест 1 («до»)' : payload.test==='2' ? 'тест 2 («після»)' : payload.test==='L' ? 'навчання' : 'вільне тренування'],
    ['Група', payload.group],
    ['Код', payload.code],
    ['Бал', `${payload.score} з ${payload.total}`],
    ['Рядок відповідей', pattern]
  ];
  if (LEARN) rows.splice(4, 0, ['Повторів карток', String(payload.repeats)]);
  rows.forEach(([k,v]) => {
    const line = el('div'); line.style.fontSize='17px'; line.style.margin='4px 0';
    line.append(el('b',null,k+': '), document.createTextNode(v));
    box.appendChild(line);
  });
  fb.appendChild(box);
}

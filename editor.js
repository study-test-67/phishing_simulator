/* ============================================================
   editor.js — редактор питань симулятора.
   Читає питання з questions.js, дає змогу додавати/змінювати/видаляти,
   показує попередній перегляд і створює новий файл questions.js.
   ============================================================ */

const DRAFT_KEY = 'phishsim.draft';
const FILE_HEADER = "/* ============================================================\n   ПИТАННЯ СИМУЛЯТОРА\n   Цей файл можна редагувати вручну або через editor.html.\n\n   Набори:  \"1\" — тест «до»,  \"2\" — тест «після»,  \"L\" — навчання (флеш-картки)\n\n   Поля одного питання:\n     id          унікальний код, напр. \"T1-11\"\n     phishing    true — фішинг, false — безпечне\n     signs       номери ознак фішингу з SIGNS, напр. [1, 2]\n     kind        вигляд: \"sms\" | \"email\" | \"chat\" | \"dm\" | \"poster\"\n     context     (необов'язково) ситуація, жовта смужка зверху\n     from        відправник / назва чату\n     addr        (email) адреса відправника\n     sub         (chat, dm) підпис під іменем\n     time        (sms) час\n     subject     (email) тема листа\n     title       (poster) заголовок оголошення\n     body        текст; посилання пишуться так: [що видно](справжня адреса)\n     attachment  (email) назва вкладення\n     qrUrl       (poster) куди веде QR-код\n     explain     пояснення для режиму навчання\n   ============================================================ */";
const SETS = [
  {key:'1', name:'Тест 1 («до»)'},
  {key:'2', name:'Тест 2 («після»)'},
  {key:'L', name:'Навчання'}
];
const KIND_NAMES = {sms:'SMS', email:'Лист', chat:'Месенджер', dm:'Соцмережа', poster:'QR-оголошення'};
const FIELDS = ['id','phishing','signs','kind','context','from','addr','sub','time','subject','title','body','attachment','qrUrl','explain'];

const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Дані: з чернетки або з questions.js ---------- */
let data = clone(window.QUESTIONS);
let draftLoaded = false;
try {
  const d = localStorage.getItem(DRAFT_KEY);
  if (d){ data = JSON.parse(d); draftLoaded = true; }
} catch(e){ /* браузер не дає зберігати — працюємо без чернетки */ }
SETS.forEach(s => { if (!data[s.key]) data[s.key] = []; });

function saveDraft(){
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch(e){}
}

let currentSet = '1';
let editing = null;     // {set, index} або null для нового питання

/* ---------- Повідомлення внизу екрана ---------- */
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

/* ---------- Вкладки наборів і баланс ---------- */
function renderTabs(){
  const tabs = $('tabs'); tabs.innerHTML = '';
  SETS.forEach(s => {
    const b = el('button', 'ed-tab' + (s.key === currentSet ? ' active' : ''), `${s.name} · ${data[s.key].length}`);
    b.onclick = () => { currentSet = s.key; renderAll(); };
    tabs.appendChild(b);
  });
  const qs = data[currentSet];
  const ph = qs.filter(q => q.phishing).length;
  const bal = $('balance');
  bal.textContent = `Фішингових: ${ph} · безпечних: ${qs.length - ph}` +
    (currentSet !== 'L' && ph !== qs.length - ph ? ' — для тестів краще порівну' : '');
  bal.className = 'ed-balance' + (currentSet !== 'L' && ph !== qs.length - ph ? ' warn' : '');
}

/* ---------- Список питань ---------- */
function renderList(){
  const list = $('list'); list.innerHTML = '';
  const qs = data[currentSet];
  if (!qs.length) list.appendChild(el('li', 'small', 'У цьому наборі ще немає питань.'));
  qs.forEach((q, i) => {
    const li = el('li', 'ed-item' + (editing && editing.set === currentSet && editing.index === i ? ' active' : ''));
    const main = el('div', 'ed-item-main');
    const top = el('div');
    top.append(el('b', null, q.id + ' '), el('span', 'pill ' + (q.phishing ? 'ph' : 'sf'), q.phishing ? 'фішинг' : 'безпечне'),
               el('span', 'small', ' ' + (KIND_NAMES[q.kind] || q.kind)));
    main.append(top, el('div', 'small ed-snip', (q.subject || q.title || q.body || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 90)));
    main.onclick = () => startEdit(currentSet, i);
    const btns = el('div', 'ed-item-btns');
    const up = el('button', null, '↑'); up.title = 'Вище'; up.disabled = i === 0;
    up.onclick = () => move(i, -1);
    const down = el('button', null, '↓'); down.title = 'Нижче'; down.disabled = i === qs.length - 1;
    down.onclick = () => move(i, 1);
    const del = el('button', 'danger', '✕'); del.title = 'Видалити';
    del.onclick = () => {
      if (!confirm(`Видалити питання ${q.id}?`)) return;
      qs.splice(i, 1); editing = null; saveDraft(); clearForm(); renderAll(); toast('Питання видалено');
    };
    btns.append(up, down, del);
    li.append(main, btns);
    list.appendChild(li);
  });
}

function move(i, d){
  const qs = data[currentSet];
  [qs[i], qs[i+d]] = [qs[i+d], qs[i]];
  if (editing && editing.set === currentSet){
    if (editing.index === i) editing.index = i + d; else if (editing.index === i + d) editing.index = i;
  }
  saveDraft(); renderAll();
}

/* ---------- Форма ---------- */
function buildSigns(){
  const fs = $('f_signs');
  Object.entries(window.SIGNS).forEach(([n, text]) => {
    const l = el('label', 'check');
    const c = document.createElement('input'); c.type = 'checkbox'; c.value = n; c.className = 'f_sign';
    c.addEventListener('change', preview);
    l.append(c, document.createTextNode(` ${n}. ${text}`));
    fs.appendChild(l);
  });
}

function showFieldsForKind(){
  const kind = $('f_kind').value;
  document.querySelectorAll('[data-for]').forEach(l => {
    l.classList.toggle('hidden', !l.dataset.for.split(' ').includes(kind));
  });
}

function suggestId(set){
  const prefix = set === 'L' ? 'L-' : `T${set}-`;
  let n = data[set].length + 1, id;
  do { id = prefix + String(n).padStart(2, '0'); n++; } while (allIds().includes(id));
  return id;
}
function allIds(){ return SETS.flatMap(s => data[s.key].map(q => q.id)); }

function readForm(){
  const q = {
    id: $('f_id').value.trim(),
    phishing: $('f_phishing').value === 'true',
    signs: [...document.querySelectorAll('.f_sign:checked')].map(c => Number(c.value)),
    kind: $('f_kind').value
  };
  const vis = id => !$(id).closest('label').classList.contains('hidden');
  ['context','from','addr','sub','time','subject','title','body','attachment','qrUrl','explain'].forEach(f => {
    const v = $('f_' + f).value.trim();
    if (v && vis('f_' + f)) q[f] = v;
  });
  return q;
}

function fillForm(q, set){
  $('f_set').value = set;
  $('f_id').value = q.id || '';
  $('f_kind').value = q.kind || 'sms';
  $('f_phishing').value = String(q.phishing !== false);
  ['context','from','addr','sub','time','subject','title','body','attachment','qrUrl','explain']
    .forEach(f => $('f_' + f).value = q[f] || '');
  document.querySelectorAll('.f_sign').forEach(c => c.checked = (q.signs || []).includes(Number(c.value)));
  showFieldsForKind(); preview();
}

function clearForm(){
  editing = null;
  $('formTitle').textContent = 'Нове питання';
  fillForm({id: suggestId(currentSet), kind:'sms', phishing:true, signs:[]}, currentSet);
  $('errors').classList.add('hidden');
  renderList();
}

function startEdit(set, index){
  editing = {set, index};
  $('formTitle').textContent = 'Редагування ' + data[set][index].id;
  fillForm(data[set][index], set);
  $('errors').classList.add('hidden');
  renderList();
  if (window.innerWidth < 900) $('formTitle').scrollIntoView({behavior:'smooth'});
}

function validate(q, set){
  const errs = [];
  if (!q.id) errs.push('Вкажіть код (id).');
  const taken = SETS.some(s => data[s.key].some((x, i) =>
    x.id === q.id && !(editing && editing.set === s.key && editing.index === i)));
  if (q.id && taken) errs.push(`Код ${q.id} вже є — потрібен інший.`);
  if (!q.body) errs.push('Напишіть текст повідомлення.');
  if (q.kind !== 'poster' && !q.from) errs.push('Вкажіть відправника.');
  if (q.kind === 'email' && !q.addr) errs.push('Для листа вкажіть адресу відправника.');
  if (q.kind === 'email' && !q.subject) errs.push('Для листа вкажіть тему.');
  if (q.kind === 'poster' && !q.title) errs.push('Для оголошення вкажіть заголовок.');
  if (q.kind === 'poster' && !q.qrUrl) errs.push('Вкажіть, куди веде QR-код.');
  if (q.phishing && !q.signs.length) errs.push('Позначте хоча б одну ознаку фішингу.');
  if (!q.phishing && q.signs.length) errs.push('Безпечне повідомлення не повинно мати ознак фішингу — зніміть позначки.');
  if (/\[[^\]]*\]\s+\(/.test(q.body || '')) errs.push('У посиланні між ] і ( не має бути пробілу.');
  if (set === 'L' && !q.explain) errs.push('Для навчання потрібне пояснення.');
  return errs;
}

function save(){
  const set = $('f_set').value;
  const q = readForm();
  const errs = validate(q, set);
  const box = $('errors');
  if (errs.length){
    box.innerHTML = ''; errs.forEach(e => box.appendChild(el('div', null, '• ' + e)));
    box.classList.remove('hidden'); return;
  }
  box.classList.add('hidden');
  if (editing){
    if (editing.set === set) data[set][editing.index] = q;
    else { data[editing.set].splice(editing.index, 1); data[set].push(q); }
    toast(`Питання ${q.id} збережено`);
  } else {
    data[set].push(q);
    toast(`Питання ${q.id} додано в набір ${set}`);
  }
  saveDraft();
  currentSet = set;
  editing = {set, index: data[set].indexOf(q)};
  renderAll();
}

/* ---------- Попередній перегляд ---------- */
function preview(){
  const q = readForm();
  renderContext(q, $('pv_context'));
  renderMessage(q, $('pv_message'), {
    onHover: href => {
      if (href){ $('urlbar').textContent = '→ ' + href; $('urlbar').style.display = 'block'; }
      else $('urlbar').style.display = 'none';
    },
    onLink: href => toast('Посилання веде на: ' + href),
    onFile: name => toast('Вкладення: ' + name),
    onQR:   url  => toast('QR-код веде на: ' + url)
  });
  const fb = $('pv_feedback'); fb.innerHTML = '';
  const f = el('div', 'feedback ' + (q.phishing ? 'bad' : 'good'));
  f.appendChild(el('b', null, q.phishing ? 'Це фішинг.' : 'Це безпечне повідомлення.'));
  if (q.explain) f.appendChild(el('p', null, q.explain));
  if (q.signs.length){
    const ul = el('ul'); q.signs.forEach(s => ul.appendChild(el('li', null, window.SIGNS[s])));
    f.append(el('div', 'small', 'Ознаки:'), ul);
  }
  fb.append(el('div', 'small', 'Так виглядатиме пояснення в навчанні:'), f);
}

/* ---------- Створення файлу questions.js ---------- */
function buildFile(){
  const header = FILE_HEADER + '\n\n';
  const fmt = q => '  {\n' + FIELDS.filter(k => q[k] !== undefined && q[k] !== '')
    .map(k => '    ' + k + ': ' + JSON.stringify(q[k])).join(',\n') + '\n  }';
  return header +
    'window.SIGNS = ' + JSON.stringify(window.SIGNS, null, 2) + ';\n\n' +
    'window.QUESTIONS = {\n' +
    SETS.map(s => ` ${JSON.stringify(s.key)}: [\n` + data[s.key].map(fmt).join(',\n') + '\n ]').join(',\n') +
    '\n};\n';
}

$('exportBtn').onclick = () => {
  const blob = new Blob([buildFile()], {type: 'text/javascript;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'questions.js';
  document.body.appendChild(a); a.click(); a.remove();
  toast('Файл questions.js завантажено — замініть ним старий');
};

$('testBtn').onclick = () => {
  saveDraft();
  window.open(`index.html?t=${currentSet}&draft=1`, '_blank');
};

$('resetBtn').onclick = () => {
  if (!confirm('Скасувати всі зміни й повернутися до питань із файлу questions.js?')) return;
  try { localStorage.removeItem(DRAFT_KEY); } catch(e){}
  data = clone(window.QUESTIONS); editing = null; clearForm(); renderAll(); toast('Зміни скасовано');
};

/* ---------- Події форми ---------- */
$('saveBtn').onclick = save;
$('cancelBtn').onclick = clearForm;
$('newBtn').onclick = clearForm;
$('f_kind').addEventListener('change', () => { showFieldsForKind(); preview(); });
$('f_set').addEventListener('change', () => { if (!editing) $('f_id').value = suggestId($('f_set').value); });
document.querySelectorAll('.ed-form input, .ed-form textarea, .ed-form select')
  .forEach(i => i.addEventListener('input', preview));

function renderAll(){ renderTabs(); renderList(); }

/* ---------- Запуск ---------- */
buildSigns();
renderAll();
clearForm();
if (draftLoaded) toast('Відкрито збережену чернетку');

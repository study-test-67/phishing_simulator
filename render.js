/* ============================================================
   render.js — як малюються повідомлення на «телефоні».
   Використовується і симулятором (app.js), і редактором (editor.js).
   ============================================================ */

/* Створити HTML-елемент: тег, клас, текст */
function el(tag, cls, text){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* Колір аватарки залежить від імені (щоб у кожного відправника свій) */
function colorFor(s){
  let h = 0;
  for (const c of String(s)) h = (h*31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},55%,45%)`;
}

/* Перетворити текст з посиланнями [що видно](справжня адреса) на частини */
function parseBody(text){
  const parts = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text || '')) !== null){
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({link:{text:m[1], href:m[2]}});
    last = re.lastIndex;
  }
  if (last < (text || '').length) parts.push(text.slice(last));
  return parts;
}

/* Вивести текст і посилання в контейнер */
function renderParts(container, text, hooks){
  parseBody(text).forEach(p => {
    if (typeof p === 'string'){ container.appendChild(document.createTextNode(p)); return; }
    const a = el('a', 'fl', p.link.text);
    a.href = '#';
    a.addEventListener('mouseenter', () => hooks.onHover && hooks.onHover(p.link.href));
    a.addEventListener('mouseleave', () => hooks.onHover && hooks.onHover(null));
    a.addEventListener('click', e => { e.preventDefault(); hooks.onLink && hooks.onLink(p.link.href); });
    container.appendChild(a);
  });
}

/* Верхня смужка з аватаркою та іменем */
function appbar(name, sub){
  const bar = el('div', 'appbar');
  const av = el('div', 'avatar', (String(name || '?').trim()[0] || '?').toUpperCase());
  av.style.background = colorFor(name);
  const t = el('div');
  t.appendChild(el('div', 'name', name || ''));
  if (sub) t.appendChild(el('div', 'sub', sub));
  bar.append(av, t);
  return bar;
}

/* Несправжній QR-код (просто малюнок, нікуди не веде) */
function fakeQR(size){
  const n = 21, c = document.createElement('canvas');
  c.width = c.height = size; c.className = 'qr';
  const g = c.getContext('2d'), s = size/n;
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#111';
  let seed = 7; const rnd = () => (seed = (seed*9301 + 49297) % 233280) / 233280;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() > 0.55) g.fillRect(x*s, y*s, s, s);
  [[0,0],[n-7,0],[0,n-7]].forEach(([x,y]) => {
    g.fillStyle = '#111'; g.fillRect(x*s, y*s, 7*s, 7*s);
    g.fillStyle = '#fff'; g.fillRect((x+1)*s, (y+1)*s, 5*s, 5*s);
    g.fillStyle = '#111'; g.fillRect((x+2)*s, (y+2)*s, 3*s, 3*s);
  });
  return c;
}

/* Намалювати одне повідомлення.
   target — куди малювати; hooks — що робити при наведенні/натисканні:
   { onHover(href|null), onLink(href), onFile(name), onQR(url) } */
function renderMessage(it, target, hooks = {}){
  target.innerHTML = '';
  const content = el('div', 'content');

  if (it.kind === 'sms'){
    target.appendChild(appbar(it.from, 'SMS'));
    const b = el('div', 'bubble'); renderParts(b, it.body, hooks); content.appendChild(b);
    content.appendChild(el('div', 'time', it.time || ''));

  } else if (it.kind === 'chat' || it.kind === 'dm'){
    target.appendChild(appbar(it.from, it.sub || ''));
    const b = el('div', 'bubble chat'); renderParts(b, it.body, hooks); content.appendChild(b);
    content.appendChild(el('div', 'time', 'щойно'));

  } else if (it.kind === 'email'){
    target.appendChild(appbar('Пошта', 'Вхідні'));
    const head = el('div', 'mail-head');
    head.appendChild(el('div', 'mail-subject', it.subject || ''));
    const f = el('div', 'mail-from');
    f.append(document.createTextNode((it.from || '') + ' '), el('span', null, '<' + (it.addr || '') + '>'));
    head.appendChild(f); content.appendChild(head);
    const body = el('div', 'mail-body'); renderParts(body, it.body, hooks); content.appendChild(body);
    if (it.attachment){
      const at = el('div', 'attach');
      at.append(el('div', 'ic', 'FILE'), el('div', null, it.attachment));
      at.onclick = () => hooks.onFile && hooks.onFile(it.attachment);
      content.appendChild(at);
    }

  } else if (it.kind === 'poster'){
    target.appendChild(appbar('Камера', 'Оголошення'));
    const p = el('div', 'poster');
    p.appendChild(el('h3', null, it.title || ''));
    renderParts(p, it.body, hooks);
    const q = fakeQR(150); q.title = 'Натисни, щоб «сканувати»';
    q.onclick = () => hooks.onQR && hooks.onQR(it.qrUrl || '');
    p.appendChild(q);
    p.appendChild(el('div', 'small', 'Натисни на QR-код, щоб «сканувати»'));
    content.appendChild(p);
  }
  target.appendChild(content);
}

/* Смужка «Ситуація: …» над повідомленням */
function renderContext(it, box){
  if (it.context){
    box.innerHTML = '';
    box.append(el('b', null, 'Ситуація: '), document.createTextNode(it.context));
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}

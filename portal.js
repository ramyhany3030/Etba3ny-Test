/* =====================================================================
   portal.js — بوابة الأعضاء (أخبار/رحلات/حسابي) + إدارة الأخبار والرحلات للأدمن + خريطة الأتوبيس
   بيتحمّل قبل السكريبت الرئيسي في index.html. كل الدوال بتتنادى بعد ما الصفحة تجهز.
   ===================================================================== */

const PM = { token: sessionStorage.getItem('m_tok') || '', name: sessionStorage.getItem('m_name') || '', code: sessionStorage.getItem('m_code') || '',
  mustChange: false, tab: 'news', imgs: {}, news: { items: [], total: 0 }, trips: [], io: null, dirty: false };
const PA = { news: [], trips: [] };
const P_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function pDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '';
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return P_DAYS[d.getDay()] + ' ' + iso.slice(0, 10);
}
const pSpin = '<div class="empty"><span class="spin"></span> جاري التحميل...</div>';

// نافذة ديناميكية. o: {narrow, tag:'admin'|'member', onClose}
function pModal(title, body, foot, o) {
  o = o || {};
  const ov = document.createElement('div'); ov.className = 'ov';
  if (o.tag === 'admin') ov.dataset.admin = '1'; else if (o.tag === 'member') ov.dataset.member = '1';
  ov.innerHTML = `<div class="mb${o.narrow ? ' nar' : ''}"><header><h3>${esc(title)}</h3><button class="xb" data-x type="button">×</button></header><div class="bd">${body}</div>${foot ? `<div class="ft">${foot}</div>` : ''}</div>`;
  document.body.appendChild(ov);
  const close = () => { if (ov._closed) return; ov._closed = true; if (o.onClose) o.onClose(); ov.remove(); };
  ov._close = close; ov.querySelector('[data-x]').onclick = close;
  return { el: ov, close, q: s => ov.querySelector(s), qa: s => Array.from(ov.querySelectorAll(s)) };
}

/* =====================================================================
   خريطة الأتوبيس (مشتركة: عرض / اختيار / أدمن / محرر)
   الحروف: E ممر | S مقعد | X مقعد غير متاح للحجز | D سائق | R باب
   ===================================================================== */
function numberSeatsJS(cells, oldNums) {            // نفس خوارزمية الخادم بالظبط
  const nums = []; let used = 0;
  cells.forEach((row, r) => { nums.push([]); for (let c = 0; c < row.length; c++) {
    const t = row.charAt(c); let n = 0;
    if (oldNums && (t === 'S' || t === 'X')) n = (oldNums[r] && oldNums[r][c]) || 0;
    nums[r].push(n); if (n > used) used = n;
  } });
  let next = used + 1;
  cells.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const t = row.charAt(c); if ((t === 'S' || t === 'X') && !nums[r][c]) nums[r][c] = next++; } });
  return nums;
}
function cellParts(t, n, o) {
  const occ = o.occupied || {}, cls = ['c', t]; let label = '';
  if (t === 'S' || t === 'X') {
    label = n || '';
    const taken = !!occ[n];
    if (taken) cls.push('taken');
    if (o.mine && o.mine === n) cls.push('mine');
    if (o.sel && o.sel === n) cls.push('sel');
    if (t === 'S' && !taken) cls.push('free');
  } else if (t === 'D') label = 'سائق'; else if (t === 'R') label = 'باب';
  return { cls: cls.join(' '), label };
}
function busHTML(L, o) {
  o = o || {}; const cols = L.cols || (L.cells[0] || '').length, mode = o.mode || 'view', names = o.names || {};
  let h = `<div class="busWrap"><div class="busFront">▲ المقدمة</div><div class="bus${mode === 'edit' ? ' edit' : ''}${mode === 'admin' ? ' adm' : ''}" style="--cols:${cols}">`;
  L.cells.forEach((row, r) => { for (let c = 0; c < cols; c++) {
    const t = row.charAt(c) || 'E', n = (L.nums && L.nums[r] && L.nums[r][c]) || 0, p = cellParts(t, n, o);
    h += `<button type="button" class="${p.cls}" data-r="${r}" data-c="${c}" data-n="${n}" data-k="${t}"${names[n] ? ` title="${esc(names[n])}"` : ''}>${p.label}</button>`;
  } });
  return h + '</div></div>';
}
const BUS_LEGEND = '<div class="legend"><span><i style="background:#e8f6ee;border-color:#1f8a4c"></i>متاح</span><span><i style="background:#e5e7eb;border-color:#cbd0d8"></i>محجوز</span><span><i style="background:#c8a24a;border-color:#a8841f"></i>مقعدك</span></div>';
function presetCells(kind) {
  const P = { '2+2': [2, 2, 11], '2+3': [2, 3, 10], '1+2': [1, 2, 5] }[kind]; if (!P) return null;
  const L = P[0], R = P[1], n = P[2], cols = L + 1 + R, rows = ['D' + 'E'.repeat(cols - 2) + 'R'];
  for (let i = 0; i < n; i++) rows.push('S'.repeat(L) + 'E' + 'S'.repeat(R));
  rows.push('S'.repeat(cols));
  return rows;
}

// محرر الأتوبيس: بيرسم داخل host. init: {cells, nums, locked}
function BusEditor(host, init) {
  const S = { cells: (init && init.cells && init.cells.length ? init.cells : presetCells('2+2')).map(r => r.split('')), oldNums: init && init.nums || null, locked: !!(init && init.locked), tool: 'S' };
  const rows = () => S.cells.length, cols = () => S.cells[0].length;
  host.innerHTML = `
    <div class="row" style="margin-bottom:6px">
      <select data-b="preset" style="width:auto"><option value="">شكل جاهز...</option><option value="2+2">أتوبيس 2+2</option><option value="2+3">أتوبيس 2+3</option><option value="1+2">ميني باص 1+2</option></select>
      <button type="button" class="btn sm" data-b="apply">تطبيق</button>
      <label class="chk" style="margin:0">صفوف <input data-b="rows" type="number" min="1" max="30" style="width:64px;padding:5px"></label>
      <label class="chk" style="margin:0">أعمدة <input data-b="cols" type="number" min="1" max="8" style="width:60px;padding:5px"></label>
    </div>
    <div class="tools" data-b="tools">
      <button type="button" data-tool="S">💺 مقعد</button><button type="button" data-tool="X">⛔ مقعد غير متاح</button>
      <button type="button" data-tool="D">🧑‍✈️ سائق</button><button type="button" data-tool="R">🚪 باب</button><button type="button" data-tool="E">⬜ ممر / مسح</button>
    </div>
    <div class="hint" data-b="info"></div>
    <div data-b="grid" style="text-align:center;margin-top:6px"></div>
    ${S.locked ? '<div class="notice warn" style="margin-top:8px">فيه حجوزات على الرحلة دي: أرقام المقاعد الحالية هتفضل زي ما هي، والمقاعد الجديدة بتتضاف بأرقام بعد آخر رقم. ومينفعش تحذف مقعد محجوز (حرّره الأول).</div>' : ''}`;
  const q = k => host.querySelector(`[data-b="${k}"]`), grid = q('grid');
  const strs = () => S.cells.map(r => r.join(''));
  const nums = () => numberSeatsJS(strs(), S.locked ? S.oldNums : null);
  function info() {
    const s = strs().join(''); const sc = (s.match(/S/g) || []).length, xc = (s.match(/X/g) || []).length;
    q('info').textContent = `اضغط أو اسحب على الخانات للرسم. مقاعد متاحة للحجز: ${sc}${xc ? ' + ' + xc + ' غير متاح' : ''}`;
    q('rows').value = rows(); q('cols').value = cols();
    host.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
  }
  function full() { grid.innerHTML = busHTML({ cells: strs(), nums: nums(), cols: cols() }, { mode: 'edit' }); info(); }
  function refresh() {                                   // تحديث في نفس العناصر (عشان السحب ما يتقطعش)
    const nm = nums();
    grid.querySelectorAll('.c').forEach(el => {
      const r = +el.dataset.r, c = +el.dataset.c, t = S.cells[r][c], p = cellParts(t, nm[r][c], {});
      el.className = p.cls; el.textContent = p.label; el.dataset.k = t; el.dataset.n = nm[r][c];
    });
    info();
  }
  let painting = false;
  const paint = el => { if (!el) return; const r = +el.dataset.r, c = +el.dataset.c; if (S.cells[r][c] !== S.tool) { S.cells[r][c] = S.tool; refresh(); } };
  grid.addEventListener('pointerdown', e => { const el = e.target.closest('.c'); if (!el) return; e.preventDefault(); painting = true; paint(el); });
  grid.addEventListener('pointermove', e => { if (!painting) return; const el = document.elementFromPoint(e.clientX, e.clientY); paint(el && el.closest && el.closest('.bus.edit .c')); });
  window.addEventListener('pointerup', () => { painting = false; });
  host.querySelector('[data-b="tools"]').onclick = e => { const b = e.target.closest('[data-tool]'); if (b) { S.tool = b.dataset.tool; info(); } };
  q('apply').onclick = () => { const k = q('preset').value, p = presetCells(k); if (p) { S.cells = p.map(r => r.split('')); full(); } };
  const resize = () => {
    const R = Math.min(30, Math.max(1, parseInt(q('rows').value, 10) || rows())), C = Math.min(8, Math.max(1, parseInt(q('cols').value, 10) || cols()));
    S.cells = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => (S.cells[r] && S.cells[r][c]) || 'E')); full();
  };
  q('rows').onchange = resize; q('cols').onchange = resize;
  full();
  return { getLayout: () => ({ cells: strs() }) };
}

/* =====================================================================
   بوابة الأعضاء
   ===================================================================== */
async function mcall(action, payload, t) {
  const r = await api(action, { mtoken: PM.token, ...(payload || {}) }, t);
  if (r.auth) mLogout('انتهت الجلسة، سجّل الدخول مرة أخرى.');
  return r;
}
function mSave(token, name, code) {
  PM.token = token; if (name) PM.name = name; if (code) PM.code = code;
  sessionStorage.setItem('m_tok', PM.token); sessionStorage.setItem('m_name', PM.name); sessionStorage.setItem('m_code', PM.code);
}
function mLogout(msg, tellServer) {
  if (tellServer && PM.token) api('memberLogout', { mtoken: PM.token }).catch(() => {});
  PM.token = ''; PM.name = ''; PM.code = ''; PM.imgs = {}; PM.news = { items: [], total: 0 }; PM.trips = [];
  ['m_tok', 'm_name', 'm_code'].forEach(k => sessionStorage.removeItem(k));
  $$('.ov[data-member]').forEach(o => o._close && o._close());
  $('#memPortal').hidden = true; $('#memLogin').hidden = false; $('#navMember').textContent = 'دخول الأعضاء';
  if (msg) showErr('#memErr', msg);
}
function portalOnTab(tab) { if (tab === 'member' && PM.token && PM.tab === 'news' && !PM.news.items.length && !$('#memNews').dataset.loaded) loadNews(true); }
function portalAdminReset() { PA.news = []; PA.trips = []; }

function portalInit() {
  $('#memCode').addEventListener('input', e => { e.target.value = toEn(e.target.value).replace(/\D/g, '').slice(0, 7); });
  $('#memShow').onchange = e => $('#memPass').type = e.target.checked ? 'text' : 'password';
  $('#memForm').onsubmit = async e => {
    e.preventDefault(); showErr('#memErr', '');
    const code = toEn($('#memCode').value).replace(/\D/g, ''), pw = $('#memPass').value;
    if (code.length !== 7) return showErr('#memErr', 'الكود 7 أرقام (مثال: 5001234).');
    if (!pw) return showErr('#memErr', 'اكتب كلمة المرور.');
    const b = $('#memBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    const r = await api('memberLogin', { code, password: pw });
    b.disabled = false; b.textContent = 'دخول';
    if (!r.ok) return showErr('#memErr', r.error);
    mSave(r.token, r.name, r.code); PM.mustChange = !!r.mustChange; $('#memPass').value = ''; enterPortal();
  };
  $('#memLogout').onclick = () => mLogout('', true);
  $('#memGoAcct').onclick = e => { e.preventDefault(); showMemberTab('acct'); };
  $$('#memTabs button').forEach(b => b.onclick = () => showMemberTab(b.dataset.mt));
  $('#memTrips').onclick = onTripsClick;
  $('#memNews').onclick = e => { if (e.target.closest('[data-more]')) loadNews(false); };
  if (PM.token) {
    enterPortal();
    mcall('memberMe').then(r => { if (r.ok) { PM.mustChange = r.mustChange; PM.name = r.name; PM.code = r.code; paintWho(); } });
  }
}
function paintWho() {
  $('#memName').textContent = PM.name; $('#memCodeShow').textContent = PM.code;
  $('#memPwWarn').hidden = !PM.mustChange; $('#navMember').textContent = 'منطقتي';
}
function enterPortal() {
  $('#memLogin').hidden = true; $('#memPortal').hidden = false; paintWho(); showMemberTab(PM.mustChange ? 'news' : PM.tab);
}
function showMemberTab(name) {
  PM.tab = name;
  $$('#memTabs button').forEach(b => b.classList.toggle('on', b.dataset.mt === name));
  $('#memNews').hidden = name !== 'news'; $('#memTrips').hidden = name !== 'trips'; $('#memAcct').hidden = name !== 'acct';
  if (name === 'news') loadNews(true); else if (name === 'trips') loadTrips(); else renderAccount();
}

/* ---------- الأخبار ---------- */
async function loadNews(reset) {
  const box = $('#memNews');
  if (reset) { PM.news = { items: [], total: 0 }; box.innerHTML = pSpin; }
  const r = await mcall('newsList', { offset: PM.news.items.length, limit: 10 });
  if (!r.ok) { box.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
  PM.news.items = PM.news.items.concat(r.items); PM.news.total = r.total; box.dataset.loaded = '1';
  renderNews();
}
function postHTML(p) {
  const n = p.imgCount | 0;
  const imgs = n ? `<div class="pimgs${n === 1 ? ' one' : ''}">` + Array.from({ length: n }, (_, i) => `<div class="pimg" data-pid="${esc(p.id)}" data-i="${i}">⏳</div>`).join('') + '</div>' : '';
  return `<article class="post${p.pinned ? ' pin' : ''}"><h4>${p.pinned ? '📌 ' : ''}${esc(p.title)}</h4><div class="meta">${esc((p.createdAt || '').slice(0, 10))}</div>${p.body ? `<div class="body">${esc(p.body)}</div>` : ''}${imgs}</article>`;
}
function renderNews() {
  const box = $('#memNews'), N = PM.news;
  box.innerHTML = N.items.length ? N.items.map(postHTML).join('') + (N.items.length < N.total ? '<div style="text-align:center"><button class="btn" data-more>عرض المزيد</button></div>' : '')
    : '<div class="empty">مفيش أخبار لسه 📰</div>';
  observeImgs(box);
}
function observeImgs(box) {
  const els = $$('.pimg[data-pid]:not([data-done])', box);
  if (!('IntersectionObserver' in window)) return els.forEach(loadPImg);
  if (!PM.io) PM.io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { PM.io.unobserve(en.target); loadPImg(en.target); } }), { rootMargin: '200px' });
  els.forEach(el => PM.io.observe(el));
}
async function loadPImg(el) {
  if (el.dataset.done) return; el.dataset.done = '1';
  const key = el.dataset.pid + ':' + el.dataset.i; let src = PM.imgs[key];
  if (!src) { const r = await mcall('newsImage', { id: el.dataset.pid, i: +el.dataset.i }, 60000); if (!r.ok) { el.textContent = 'تعذر تحميل الصورة'; el.dataset.done = ''; return; } src = PM.imgs[key] = r.image; }
  el.innerHTML = `<img src="${src}" alt="">`; el.onclick = () => { $('#lbImg').src = src; $('#lightbox').hidden = false; };
}

/* ---------- الرحلات ---------- */
async function loadTrips() {
  const box = $('#memTrips'); box.innerHTML = pSpin;
  const r = await mcall('tripsList');
  if (!r.ok) { box.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
  PM.trips = r.items; renderTrips();
}
function tripStateHTML(t) {
  const my = t.my || { status: 'none' }, open = t.status === 'open';
  const cancel = open ? ' <button class="btn sm" data-act="cancel">إلغاء الاشتراك</button>' : '';
  if (my.status === 'requested') return `<span class="badge p">طلبك قيد المراجعة من الإدارة</span>${open ? ' <button class="btn sm" data-act="cancel">إلغاء الطلب</button>' : ''}`;
  if (my.status === 'accepted' && my.needsCode) return `<div class="notice good">تم قبول اشتراكك ✔ الإدارة هتبعتلك <b>كود الرحلة</b> (4 أرقام وحروف). اكتبه هنا عشان تفتح اختيار المقعد.</div>
    <div class="row"><input class="tcode" maxlength="4" placeholder="XXXX" data-tc autocomplete="off" autocapitalize="characters"><button class="btn pri" data-act="verify">فتح</button>${cancel}</div>`;
  if (my.status === 'accepted') return `${my.seat ? `<span class="badge o">مقعدك رقم ${my.seat}</span>` : '<span class="badge p">لسه ما اخترتش مقعد</span>'}
    <button class="btn gold" data-act="seats">🚌 ${open ? (my.seat ? 'تغيير المقعد' : 'اختيار المقعد') : 'عرض المقعد'}</button>${cancel}`;
  if (my.status === 'rejected') return `<div class="notice bad">تم رفض طلب الاشتراك${my.reason ? ': ' + esc(my.reason) : ''}</div>${open ? '<button class="btn pri" data-act="join">إعادة الطلب</button>' : ''}`;
  return open ? `${my.status === 'cancelled' ? '<span class="badge g">ألغيت اشتراكك</span> ' : ''}<button class="btn pri" data-act="join">🙋 طلب الاشتراك في الرحلة</button>` : '<span class="badge g">التسجيل مغلق</span>';
}
function tripCardHTML(t) {
  const pct = t.seatsTotal ? Math.round(t.seatsTaken * 100 / t.seatsTotal) : 0, left = Math.max(t.seatsTotal - t.seatsTaken, 0);
  return `<div class="trip${t.past ? ' past' : ''}" data-id="${esc(t.id)}">
    <div class="row" style="justify-content:space-between"><h4>🚌 ${esc(t.title)}</h4>${t.status === 'closed' ? '<span class="badge g">الحجز مغلق</span>' : '<span class="badge o">الحجز مفتوح</span>'}</div>
    <div class="tmeta"><span>📅 ${esc(pDate(t.tripDate))}${t.tripTime ? ' · ' + esc(t.tripTime) : ''}</span>${t.place ? `<span>📍 ${esc(t.place)}</span>` : ''}${t.price ? `<span>💰 ${esc(t.price)}</span>` : ''}</div>
    ${t.description ? `<div style="margin:0 0 6px;white-space:pre-wrap;word-break:break-word">${esc(t.description)}</div>` : ''}
    <div class="tbar"><i style="width:${pct}%"></i></div><small class="hint">المقاعد: ${t.seatsTaken} محجوز من ${t.seatsTotal} (باقي ${left})</small>
    <div class="tstate">${tripStateHTML(t)}</div></div>`;
}
function renderTrips() {
  $('#memTrips').innerHTML = PM.trips.length ? PM.trips.map(tripCardHTML).join('') : '<div class="empty">مفيش رحلات متاحة دلوقتي 🚌</div>';
}
async function onTripsClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const card = btn.closest('.trip'), id = card.dataset.id, act = btn.dataset.act, t = PM.trips.find(x => x.id === id);
  if (act === 'seats') return openSeats(id);
  btn.disabled = true;
  try {
    if (act === 'join') {
      const r = await mcall('tripJoin', { tripId: id }); if (!r.ok) toast(r.error, 'err'); else toast('تم إرسال طلب الاشتراك ✔', 'ok');
    } else if (act === 'cancel') {
      if (!await ask({ title: 'إلغاء الاشتراك', msg: `إلغاء اشتراكك في «${t ? t.title : 'الرحلة'}»؟ لو كان عندك مقعد هيتحرر.`, okText: 'إلغاء الاشتراك' })) return;
      const r = await mcall('tripCancel', { tripId: id }); if (!r.ok) toast(r.error, 'err'); else toast('تم الإلغاء', 'ok');
    } else if (act === 'verify') {
      const code = toEn(card.querySelector('[data-tc]').value).replace(/\s+/g, '').toUpperCase();
      if (code.length !== 4) { toast('كود الرحلة 4 خانات.', 'err'); return; }
      const r = await mcall('tripVerifyCode', { tripId: id, code });
      if (!r.ok) { toast(r.error, 'err'); return; }
      toast('تم فتح الرحلة ✔ اختار مقعدك', 'ok'); await loadTrips(); return openSeats(id);
    }
    await loadTrips();
  } finally { btn.disabled = false; }
}

// نافذة اختيار المقعد: بتتحدّث كل 15 ثانية، والخادم هو اللي بيقرر (مقعد واحد لكل شخص، ولو اتحجز قبلك بيرفض)
async function openSeats(tripId) {
  let v = '', st = null, sel = 0, busy = false, timer = null;
  const m = pModal('اختيار المقعد', pSpin, '', { tag: 'member', onClose: () => { clearInterval(timer); if (PM.dirty && PM.tab === 'trips') loadTrips(); PM.dirty = false; } });
  const body = m.q('.bd');
  const draw = () => {
    if (!st) return;
    const t = st.trip, my = st.my, open = t.status === 'open', mine = my.seat || 0;
    if (!my.unlocked || !st.layout) { body.innerHTML = '<div class="empty">لازم اشتراكك يتقبل وتدخل كود الرحلة الأول.</div>'; return; }
    const act = !open ? '<div class="notice warn">الحجز مغلق حاليًا. تقدر تشوف مقعدك بس.</div>'
      : `<div class="row" style="justify-content:center;margin-top:8px">${sel && sel !== mine ? `<button class="btn gold" data-do="take">${mine ? 'نقل حجزي إلى المقعد ' + sel : 'احجز المقعد ' + sel}</button>` : ''}${mine ? '<button class="btn" data-do="release">إلغاء حجز مقعدي</button>' : ''}</div>`;
    body.innerHTML = `<div style="text-align:center"><b>${esc(t.title)}</b><div class="hint">${esc(pDate(t.tripDate))}${t.tripTime ? ' · ' + esc(t.tripTime) : ''} — ${mine ? 'مقعدك الحالي: <b>' + mine + '</b>' : 'لسه ما اخترتش مقعد'}</div>
      ${open ? '<div class="hint">اضغط على مقعد أخضر، وبعدين اضغط «احجز».</div>' : ''}${BUS_LEGEND}${busHTML(st.layout, { mode: 'pick', occupied: st.occupied, mine, sel })}${act}</div>`;
  };
  const refresh = async force => {
    if (busy) return; busy = true;
    const r = await mcall('tripSeats', { tripId, v: force ? '' : v }); busy = false;
    if (!m.el.isConnected) return;
    if (!r.ok) { body.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
    if (r.same) return;
    v = r.v; st = r;
    if (sel && st.occupied && st.occupied[sel]) { sel = 0; toast('المقعد اللي اخترته اتحجز لشخص تاني', 'err'); }
    draw();
  };
  body.onclick = async e => {
    const c = e.target.closest('.bus .c.S.free');
    if (c && st && st.trip.status === 'open') { const n = +c.dataset.n; sel = sel === n ? 0 : n; return draw(); }
    const d = e.target.closest('[data-do]'); if (!d || busy) return;
    d.disabled = true; busy = true;
    const r = d.dataset.do === 'take' ? await mcall('tripSelectSeat', { tripId, seat: sel }) : await mcall('tripReleaseSeat', { tripId });
    busy = false;
    if (!r.ok) toast(r.error, 'err'); else { toast(d.dataset.do === 'take' ? 'تم حجز المقعد ✔' : 'تم إلغاء الحجز', 'ok'); PM.dirty = true; }
    sel = 0; refresh(true);
  };
  timer = setInterval(() => { if (!document.hidden && m.el.isConnected) refresh(false); }, 15000);
  refresh(true);
}

/* ---------- حسابي ---------- */
function renderAccount() {
  const box = $('#memAcct');
  box.innerHTML = `<div class="sec"><h3>تغيير كلمة المرور</h3>
    <form id="mpwForm" novalidate>
      <div class="field"><label>كلمة المرور الحالية ${PM.mustChange ? '(رقم الواتساب)' : ''}</label><input id="mpOld" type="password" dir="ltr" autocomplete="current-password"></div>
      <div class="field"><label>كلمة المرور الجديدة (6 أحرف على الأقل)</label><input id="mpNew" type="password" dir="ltr" autocomplete="new-password"></div>
      <div class="field"><label>تأكيد كلمة المرور الجديدة</label><input id="mpNew2" type="password" dir="ltr" autocomplete="new-password"></div>
      <label class="chk"><input type="checkbox" id="mpShow"> إظهار كلمات المرور</label>
      <div class="formerr" id="mpErr" hidden></div>
      <button class="btn pri" type="submit" id="mpBtn">💾 حفظ كلمة المرور</button>
    </form></div>
    <div id="memCardBox"><p class="lead" style="text-align:center"><span class="spin"></span> جاري تجهيز الكارت...</p></div>`;
  $('#mpShow').onchange = e => ['mpOld', 'mpNew', 'mpNew2'].forEach(id => $('#' + id).type = e.target.checked ? 'text' : 'password');
  $('#mpwForm').onsubmit = async e => {
    e.preventDefault(); showErr('#mpErr', '');
    const o = $('#mpOld').value, n = $('#mpNew').value, n2 = $('#mpNew2').value;
    if (!o) return showErr('#mpErr', 'اكتب كلمة المرور الحالية.');
    if (n.length < 6) return showErr('#mpErr', 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.');
    if (n === o) return showErr('#mpErr', 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.');
    if (n !== n2) return showErr('#mpErr', 'تأكيد كلمة المرور غير مطابق.');
    const b = $('#mpBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    const r = await mcall('memberChangePassword', { oldPassword: o, newPassword: n }, 60000);
    b.disabled = false; b.textContent = '💾 حفظ كلمة المرور';
    if (!r.ok) return showErr('#mpErr', r.error);
    mSave(r.token); PM.mustChange = false; paintWho(); toast('تم تغيير كلمة المرور ✔', 'ok'); renderAccount();
  };
  loadMemberCard();
}
async function loadMemberCard() {
  const host = $('#memCardBox'); if (!host) return;
  const r = await mcall('memberMe', { card: true }, 60000);
  if (!host.isConnected) return;
  if (!r.ok) { host.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
  paintCard(host, { name: r.card.name, code: r.card.code, photo: r.card.photo, why: r.card.why }, loadMemberCard);
}

/* =====================================================================
   الأدمن: الأخبار
   ===================================================================== */
async function loadNewsAdmin() {
  const box = $('#admNews'); box.innerHTML = pSpin;
  const r = await adm('newsAdminList');
  if (!r.ok) { box.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
  PA.news = r.items; renderNewsAdmin();
}
function renderNewsAdmin() {
  const box = $('#admNews');
  box.innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn ok" data-n="new">➕ خبر جديد</button></div>` +
    (PA.news.length ? PA.news.map(n => `<div class="post${n.pinned ? ' pin' : ''}" data-id="${esc(n.id)}">
      <div class="row" style="justify-content:space-between"><h4>${n.pinned ? '📌 ' : ''}${esc(n.title)}</h4>${n.published ? '<span class="badge o">منشور</span>' : '<span class="badge g">مسودة</span>'}</div>
      <div class="meta">${esc((n.createdAt || '').slice(0, 16))} · ${esc(n.createdBy || '')}${n.imgCount ? ' · 🖼️ ' + n.imgCount : ''}</div>
      ${n.body ? `<div class="body" style="max-height:4.8em;overflow:hidden">${esc(n.body)}</div>` : ''}
      <div class="acts" style="margin-top:8px"><button class="btn sm" data-n="edit">✎ تعديل</button><button class="btn sm" data-n="pin">${n.pinned ? 'إلغاء التثبيت' : '📌 تثبيت'}</button><button class="btn sm" data-n="pub">${n.published ? '🙈 إخفاء' : '👁 نشر'}</button><button class="btn sm bad" data-n="del">🗑 حذف</button></div></div>`).join('')
      : '<div class="empty">مفيش أخبار. اضغط «خبر جديد».</div>');
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#admNews [data-n]'); if (!b) return;
  const card = b.closest('.post'), n = card ? PA.news.find(x => x.id === card.dataset.id) : null, act = b.dataset.n;
  if (act === 'new') return openNewsEditor(null);
  if (!n) return;
  if (act === 'edit') return openNewsEditor(n);
  if (act === 'del') {
    if (!await ask({ title: 'حذف الخبر', msg: `حذف «${n.title}» وصوره نهائيًا؟`, okText: 'حذف' })) return;
    const r = await adm('newsDelete', { id: n.id }); if (r.ok) { PA.news = r.items; renderNewsAdmin(); toast('تم الحذف', 'ok'); } else toast(r.error, 'err');
  } else {
    const r = await adm('newsSave', { id: n.id, title: n.title, body: n.body, pinned: act === 'pin' ? !n.pinned : n.pinned, published: act === 'pub' ? !n.published : n.published, keep: Array.from({ length: n.imgCount }, (_, i) => i) });
    if (r.ok) { PA.news = r.items; renderNewsAdmin(); } else toast(r.error, 'err');
  }
});

function openNewsEditor(n) {
  const ed = { keep: [], add: [] };                          // keep: {i, src}  add: dataUrl
  const m = pModal(n ? 'تعديل الخبر' : 'خبر جديد', `
    <div class="field"><label>العنوان *</label><input data-e="title" maxlength="120"></div>
    <div class="field"><label>النص</label><textarea data-e="body" rows="6" maxlength="4000" placeholder="اكتب الخبر..."></textarea></div>
    <div class="field"><label>الصور (حتى 4)</label><div class="nimgs" data-e="imgs"></div><input type="file" accept="image/*" multiple hidden data-e="file"></div>
    <label class="chk"><input type="checkbox" data-e="pinned"> 📌 تثبيت في أول الأخبار</label>
    <label class="chk"><input type="checkbox" data-e="published"> 👁 منشور للأعضاء (لو مش معلّم يتحفظ كمسودة)</label>
    <div class="formerr" data-e="err" hidden></div>`,
    '<button class="btn pri" data-e="save">💾 حفظ</button><button class="btn" data-e="cancel">إلغاء</button>', { tag: 'admin' });
  const e = k => m.q(`[data-e="${k}"]`);
  e('title').value = n ? n.title : ''; e('body').value = n ? n.body : ''; e('pinned').checked = n ? n.pinned : false; e('published').checked = n ? n.published : true;
  const paint = () => {
    const tot = ed.keep.length + ed.add.length;
    e('imgs').innerHTML = ed.keep.map((k, j) => `<div class="ni">${k.src ? `<img src="${k.src}" alt="">` : '⏳'}<button type="button" data-rk="${j}">×</button></div>`).join('') +
      ed.add.map((s, j) => `<div class="ni"><img src="${s}" alt=""><button type="button" data-ra="${j}">×</button></div>`).join('') +
      (tot < 4 ? '<button type="button" class="ni add" data-addimg>+</button>' : '');
  };
  if (n) for (let i = 0; i < n.imgCount; i++) { const k = { i, src: '' }; ed.keep.push(k); adm('newsImage', { id: n.id, i }, 60000).then(r => { if (r.ok) { k.src = r.image; if (m.el.isConnected) paint(); } }); }
  paint();
  e('imgs').onclick = ev => {
    const bk = ev.target.closest('[data-rk]'), ba = ev.target.closest('[data-ra]');
    if (bk) { ed.keep.splice(+bk.dataset.rk, 1); paint(); } else if (ba) { ed.add.splice(+ba.dataset.ra, 1); paint(); } else if (ev.target.closest('[data-addimg]')) e('file').click();
  };
  e('file').onchange = async ev => {
    const files = Array.from(ev.target.files); ev.target.value = '';
    for (const f of files) {
      if (ed.keep.length + ed.add.length >= 4) { toast('أقصى عدد صور 4', 'err'); break; }
      try { ed.add.push(resizeToJpeg(await loadBitmap(f), 1000, 0.75)); } catch (x) { toast('تعذر قراءة صورة', 'err'); }
    }
    paint();
  };
  e('cancel').onclick = m.close;
  e('save').onclick = async () => {
    const title = e('title').value.trim(), err = e('err'); err.hidden = true;
    if (!title) { err.textContent = 'اكتب عنوان الخبر.'; err.hidden = false; return; }
    const b = e('save'); b.disabled = true; b.innerHTML = '<span class="spin"></span> جاري الحفظ...';
    const r = await adm('newsSave', { id: n ? n.id : undefined, title, body: e('body').value, pinned: e('pinned').checked, published: e('published').checked, keep: ed.keep.map(k => k.i), add: ed.add }, 180000);
    b.disabled = false; b.textContent = '💾 حفظ';
    if (!r.ok) { err.textContent = r.error; err.hidden = false; return; }
    PA.news = r.items; renderNewsAdmin(); m.close(); toast('تم حفظ الخبر ✔', 'ok');
  };
}

/* =====================================================================
   الأدمن: الرحلات
   ===================================================================== */
const TRIP_ST = { draft: ['مسودة', 'g'], open: ['مفتوحة للحجز', 'o'], closed: ['مغلقة', 'p'] };
async function loadTripsAdmin() {
  const box = $('#admTrips'); box.innerHTML = pSpin;
  const r = await adm('tripAdminList');
  if (!r.ok) { box.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
  PA.trips = r.items; renderTripsAdmin();
}
function renderTripsAdmin() {
  $('#admTrips').innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn ok" data-t="new">➕ رحلة جديدة</button></div>` +
    (PA.trips.length ? PA.trips.map(t => { const s = TRIP_ST[t.status] || ['', 'g'];
      return `<div class="trip" data-id="${esc(t.id)}"><div class="row" style="justify-content:space-between"><h4>🚌 ${esc(t.title)}</h4><span class="badge ${s[1]}">${s[0]}</span></div>
      <div class="tmeta"><span>📅 ${esc(pDate(t.tripDate))}${t.tripTime ? ' · ' + esc(t.tripTime) : ''}</span>${t.place ? `<span>📍 ${esc(t.place)}</span>` : ''}</div>
      <div class="tmeta"><span>🕓 طلبات جديدة: <b>${t.requested}</b></span><span>✔ مقبولين: <b>${t.accepted}</b></span><span>💺 محجوز: <b>${t.seatsTaken}</b> / ${t.seatsTotal}</span></div>
      <div class="acts"><button class="btn sm pri" data-t="open">📋 إدارة الرحلة</button><button class="btn sm" data-t="edit">✎ تعديل</button></div></div>`; }).join('')
      : '<div class="empty">مفيش رحلات. اضغط «رحلة جديدة».</div>');
}
document.addEventListener('click', e => {
  const b = e.target.closest('#admTrips [data-t]'); if (!b) return;
  const card = b.closest('.trip'), id = card && card.dataset.id;
  if (b.dataset.t === 'new') openTripEditor(null, loadTripsAdmin); else if (b.dataset.t === 'edit') openTripEditor(id, loadTripsAdmin); else if (b.dataset.t === 'open') openTripAdmin(id);
});

// onSaved: بتتنادى بعد الحفظ (عشان نحدّث القايمة أو نافذة الإدارة)
async function openTripEditor(id, onSaved) {
  let t = null;
  if (id) { const r = await adm('tripAdminGet', { id }); if (!r.ok) return toast(r.error, 'err'); t = r.trip; }
  const m = pModal(t ? 'تعديل الرحلة' : 'رحلة جديدة', `
    <div class="grid2"><div class="field"><label>اسم الرحلة *</label><input data-e="title" maxlength="120"></div>
      <div class="field"><label>الحالة</label><select data-e="status"><option value="draft">مسودة (مخفية عن الأعضاء)</option><option value="open">مفتوحة للحجز</option><option value="closed">مغلقة (عرض فقط)</option></select></div></div>
    <div class="grid2"><div class="field"><label>التاريخ *</label><input type="date" data-e="tripDate" dir="ltr"></div><div class="field"><label>الوقت</label><input type="time" data-e="tripTime" dir="ltr"></div></div>
    <div class="grid2"><div class="field"><label>مكان التجمع</label><input data-e="place" maxlength="120"></div><div class="field"><label>السعر / ملاحظة</label><input data-e="price" maxlength="60" placeholder="مثال: 150 جنيه"></div></div>
    <div class="field"><label>تفاصيل الرحلة</label><textarea data-e="description" rows="3" maxlength="1500"></textarea></div>
    <label class="chk"><input type="checkbox" data-e="useCode"> 🔑 الدخول لاختيار المقعد بكود من 4 خانات (بيتولّد لما تقبل اشتراك الشخص وبتبعته له)</label>
    <h4 style="margin:12px 0 4px;color:var(--navy)">شكل الأتوبيس</h4><div data-e="bus"></div>
    <div class="formerr" data-e="err" hidden></div>`,
    '<button class="btn pri" data-e="save">💾 حفظ الرحلة</button><button class="btn" data-e="cancel">إلغاء</button>', { tag: 'admin' });
  const e = k => m.q(`[data-e="${k}"]`);
  e('title').value = t ? t.title : ''; e('status').value = t ? t.status : 'draft'; e('tripDate').value = t ? t.tripDate : ''; e('tripTime').value = t ? t.tripTime : '';
  e('place').value = t ? t.place : ''; e('price').value = t ? t.price : ''; e('description').value = t ? t.description : ''; e('useCode').checked = t ? t.useCode : true;
  const bus = BusEditor(e('bus'), t && t.layout ? { cells: t.layout.cells, nums: t.layout.nums, locked: t.locked } : null);
  e('cancel').onclick = m.close;
  e('save').onclick = async () => {
    const err = e('err'); err.hidden = true;
    const body = { id: t ? t.id : undefined, title: e('title').value.trim(), status: e('status').value, tripDate: e('tripDate').value, tripTime: e('tripTime').value,
      place: e('place').value.trim(), price: e('price').value.trim(), description: e('description').value, useCode: e('useCode').checked, layout: bus.getLayout() };
    if (!body.title) { err.textContent = 'اكتب اسم الرحلة.'; err.hidden = false; return; }
    if (!body.tripDate) { err.textContent = 'اختر تاريخ الرحلة.'; err.hidden = false; return; }
    const b = e('save'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    const r = await adm('tripSave', body, 60000);
    b.disabled = false; b.textContent = '💾 حفظ الرحلة';
    if (!r.ok) { err.textContent = r.error; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    m.close(); toast('تم حفظ الرحلة ✔', 'ok'); if (onSaved) onSaved();
  };
}

const BK_ST = { requested: ['طلب جديد', 'p'], accepted: ['مقبول', 'o'], rejected: ['مرفوض', 'n'], cancelled: ['ملغي', 'g'] };
// نافذة إدارة رحلة: الطلبات + أكواد الرحلة + خريطة الأتوبيس بأسماء الركاب
async function openTripAdmin(id) {
  const m = pModal('إدارة الرحلة', pSpin, '', { tag: 'admin' });
  const body = m.q('.bd'); let D = null;
  const load = async () => { const r = await adm('tripAdminGet', { id }); if (!r.ok) { body.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return false; } D = r; draw(); return true; };
  const act = async (action, payload, okMsg) => { const r = await adm(action, payload, 60000); if (!r.ok) toast(r.error, 'err'); else if (okMsg) toast(okMsg, 'ok'); await load(); loadTripsAdmin(); };
  const draw = () => {
    const t = D.trip, L = t.layout, B = D.bookings, s = TRIP_ST[t.status] || ['', 'g'];
    const occ = {}, names = {}, byNum = {};
    B.forEach(b => { if (b.status === 'accepted' && b.seat) { occ[b.seat] = 1; names[b.seat] = b.name; byNum[b.seat] = b; } });
    const seatsOpts = (cur) => { const o = ['<option value="0">— بدون مقعد —</option>']; L.cells.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const ch = row.charAt(c), n = L.nums[r][c];
      if ((ch === 'S' || ch === 'X') && n) o.push(`<option value="${n}"${n === cur ? ' selected' : ''}${occ[n] && n !== cur ? ' disabled' : ''}>مقعد ${n}${ch === 'X' ? ' (غير متاح للأعضاء)' : ''}${occ[n] && n !== cur ? ' - محجوز' : ''}</option>`); } }); return o.join(''); };
    const rows = B.map(b => { const st = BK_ST[b.status] || ['', 'g'];
      const wa = 'https://wa.me/2' + b.whatsapp + '?text=' + encodeURIComponent(`سلام ونعمة ${b.name.split(' ')[0]} 🙏\nتم قبول اشتراكك في رحلة «${t.title}» (${t.tripDate}).\nكود الرحلة الخاص بيك: ${b.tripCode}\nادخل موقع الأعضاء ← الرحلات ← اكتب الكود واختار مقعدك.`);
      let a = '';
      if (b.status === 'requested') a = `<button class="btn sm ok" data-d="accept">✔ قبول</button><button class="btn sm bad" data-d="reject">✖ رفض</button>`;
      else if (b.status === 'accepted') a = `${b.tripCode ? `<a class="btn sm wa" style="text-decoration:none" target="_blank" rel="noopener" href="${wa}">📲 إرسال الكود</a>` : ''}<button class="btn sm" data-d="cancel">إلغاء</button>`;
      else a = `<button class="btn sm ok" data-d="accept">✔ قبول</button>`;
      return `<tr data-b="${esc(b.id)}"><td><b>${esc(b.name)}</b><br><small class="ltr" style="display:inline-block">${esc(b.code)} · ${esc(b.whatsapp)}</small>${b.note ? `<br><small style="color:var(--bad)">${esc(b.note)}</small>` : ''}</td>
        <td><span class="badge ${st[1]}">${st[0]}</span>${b.status === 'accepted' && t.useCode ? `<br><b class="ltr" style="display:inline-block;letter-spacing:2px">${esc(b.tripCode)}</b><br><small>${b.verified ? '✔ دخل بالكود' : 'لسه ما دخلش'}</small>` : ''}</td>
        <td>${b.status === 'accepted' ? `<select data-seat style="min-width:120px">${seatsOpts(b.seat)}</select>` : '—'}</td><td><div class="acts">${a}</div></td></tr>`; }).join('');
    body.innerHTML = `<div class="row" style="justify-content:space-between"><div><b>${esc(t.title)}</b> <span class="badge ${s[1]}">${s[0]}</span><div class="hint">${esc(pDate(t.tripDate))}${t.tripTime ? ' · ' + esc(t.tripTime) : ''}${t.place ? ' · ' + esc(t.place) : ''} · المقاعد: ${Object.keys(occ).length}/${t.seatsTotal}</div></div>
      <div class="acts"><button class="btn sm" data-t2="edit">✎ تعديل الرحلة</button><button class="btn sm" data-t2="xls">⬇ Excel</button><button class="btn sm bad" data-t2="del">🗑 حذف الرحلة</button></div></div>
      <h4 style="margin:12px 0 4px;color:var(--navy)">🚌 خريطة الأتوبيس <small class="hint" style="display:inline">(اضغط على مقعد محجوز لتحريره)</small></h4>
      <div style="text-align:center">${BUS_LEGEND}${busHTML(L, { mode: 'admin', occupied: occ, names })}</div>
      <h4 style="margin:14px 0 4px;color:var(--navy)">👥 المشتركين والطلبات (${B.length})</h4>
      <div class="row" style="margin-bottom:8px"><input data-addcode inputmode="numeric" maxlength="7" dir="ltr" placeholder="كود العضو (7 أرقام) لإضافته مباشرة" style="flex:1;min-width:200px"><button class="btn sm ok" data-t2="add">➕ إضافة عضو</button></div>
      <div class="tbl-wrap" style="max-height:50vh"><table class="tblB"><thead><tr><th>العضو</th><th>الحالة / الكود</th><th>المقعد</th><th>إجراءات</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">مفيش طلبات لسه</td></tr>'}</tbody></table></div>`;
    m._D = { occ, byNum };
  };
  body.addEventListener('change', async e => {
    const sel = e.target.closest('[data-seat]'); if (!sel) return;
    await act('tripAssignSeat', { id: sel.closest('tr').dataset.b, seat: +sel.value }, 'تم');
  });
  body.addEventListener('click', async e => {
    const seat = e.target.closest('.bus.adm .c.taken');
    if (seat) { const b = m._D.byNum[+seat.dataset.n]; if (b && await ask({ title: 'تحرير المقعد ' + seat.dataset.n, msg: `المقعد محجوز لـ ${b.name}. تحريره؟`, okText: 'تحرير' })) act('tripAssignSeat', { id: b.id, seat: 0 }, 'تم تحرير المقعد'); return; }
    const d = e.target.closest('[data-d]');
    if (d) {
      const bid = d.closest('tr').dataset.b, kind = d.dataset.d;
      if (kind === 'reject') { const reason = await ask({ title: 'رفض الاشتراك', msg: 'سبب الرفض (هيظهر للعضو):', input: true, okText: 'رفض' }); if (!reason) return; return act('tripDecide', { id: bid, decision: 'reject', reason }, 'تم الرفض'); }
      if (kind === 'cancel' && !await ask({ title: 'إلغاء الاشتراك', msg: 'إلغاء اشتراك الشخص وتحرير مقعده؟', okText: 'إلغاء الاشتراك' })) return;
      return act('tripDecide', { id: bid, decision: kind }, kind === 'accept' ? 'تم القبول — ابعت له الكود' : 'تم');
    }
    const x = e.target.closest('[data-t2]'); if (!x) return;
    if (x.dataset.t2 === 'edit') return openTripEditor(id, () => { load(); loadTripsAdmin(); });
    if (x.dataset.t2 === 'del') { if (!await ask({ title: 'حذف الرحلة', msg: 'حذف الرحلة وكل الحجوزات نهائيًا؟', okText: 'حذف' })) return; const r = await adm('tripDelete', { id }); if (r.ok) { m.close(); loadTripsAdmin(); toast('تم الحذف', 'ok'); } else toast(r.error, 'err'); return; }
    if (x.dataset.t2 === 'add') { const code = toEn(m.q('[data-addcode]').value).replace(/\D/g, ''); if (code.length !== 7) return toast('الكود 7 أرقام', 'err'); return act('tripAddMember', { tripId: id, code }, 'تمت الإضافة — ابعت له الكود'); }
    if (x.dataset.t2 === 'xls') {
      if (!window.XLSX) return toast('مكتبة Excel لم تُحمّل', 'err');
      const aoa = [['الاسم', 'كود العضو', 'الواتساب', 'الحالة', 'كود الرحلة', 'المقعد']].concat(D.bookings.map(b => [b.name, b.code, b.whatsapp, (BK_ST[b.status] || [''])[0], b.tripCode || '', b.seat || '']));
      const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'الرحلة'); XLSX.writeFile(wb, `trip_${D.trip.tripDate}.xlsx`);
    }
  });
  load();
}


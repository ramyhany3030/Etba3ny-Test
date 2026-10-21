/* =====================================================================
   conferences.js — موديول المؤتمرات (واجهة العضو + واجهة الأدمن)
   بيتحمّل بعد portal.js. التابات والحاويات (#memConf / #admConf) موجودة في index.html، والملف ده بيعرّف window.confModule
   وبيستخدم الدوال الموجودة (pModal / busHTML / BusEditor / mcall / adm / ask / toast ...).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__confModule) return; window.__confModule = true;

  const CSS = `
  .cf-room{border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:10px;background:#fff}
  .cf-room.rs{background:#fafafa}
  .cf-rh{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
  .cf-rh small{color:var(--mut)}
  .cf-beds{display:flex;gap:8px;flex-wrap:wrap}
  .cf-bed{flex:1 1 84px;min-width:84px;max-width:130px;border-radius:10px;border:2px solid var(--ok);background:#e8f6ee;padding:4px 6px;font:inherit;font-size:12.5px;color:#16653a;cursor:pointer;text-align:center;line-height:1.35}
  .cf-bed .n{display:block;font-weight:700;font-size:14px}
  .cf-bed .w{display:block;min-height:1.35em;word-break:break-word}
  .cf-bed.taken{background:#eceff3;border-color:#cbd0d8;color:#374151;cursor:default}
  .cf-bed.mine{background:var(--gold);border-color:#a8841f;color:#fff;cursor:default}
  .cf-bed.sel{outline:3px solid var(--navy);background:#dbeafe;color:#1e3a8a}
  .cf-bed.lock{background:repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 4px,#e5e7eb 4px,#e5e7eb 8px);border-color:#cbd0d8;color:#9aa3af;cursor:not-allowed}
  .cf-bed.adm.taken{cursor:pointer}
  .cf-mine{display:inline-block;margin-top:4px;background:#fff8dc;border:1px solid var(--gold);border-radius:999px;padding:2px 12px;font-size:13.5px}
  .cf-span{display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:10px;padding:4px 12px;font-weight:700;margin:2px 0 8px}
  .cf-span.bad{background:#fdecea;border-color:#f5c6c1;color:var(--bad)}
  .cf-rrow{display:grid;grid-template-columns:1.4fr 88px 120px 1.2fr 34px;gap:6px;align-items:center;margin-bottom:6px}
  .cf-rrow input,.cf-rrow select{padding:7px 8px}
  .cf-rrow button{border:0;background:#fdecea;color:var(--bad);border-radius:8px;height:34px;cursor:pointer;font-size:18px}
  .cf-rrow button:disabled{background:#eee;color:#aaa;cursor:not-allowed}
  .cf-rrow .lk{grid-column:1/-1;font-size:12px;color:var(--warn);margin-top:-4px}
  .cf-quick{background:#f5f8fd;border:1px solid var(--line);border-radius:12px;padding:8px;margin:6px 0 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .cf-quick input,.cf-quick select{width:auto;padding:6px 8px}
  .cf-sec{margin:14px 0 4px;color:var(--navy)}
  @media(max-width:640px){.cf-rrow{grid-template-columns:1fr 1fr}.cf-rrow button{grid-column:2}.cf-rrow [data-r=name]{grid-column:1/-1}.cf-rrow [data-r=note]{grid-column:1/-1}}
  `;

  /* ---------------- تنسيق ---------------- */
  const AR = {
    days: n => n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? n + ' أيام' : n + ' يومًا',
    nights: n => n === 0 ? 'بدون مبيت' : n === 1 ? 'ليلة واحدة' : n === 2 ? 'ليلتان' : n <= 10 ? n + ' ليالٍ' : n + ' ليلة'
  };
  const spanText = (d, n) => AR.days(+d) + ' / ' + AR.nights(+n);
  function calcSpan(from, to) {                                    // نفس حساب الخادم: الليالي = الفرق، الأيام = الليالي + 1
    const re = /^(\d{4})-(\d{2})-(\d{2})$/, a = re.exec(from || ''), b = re.exec(to || '');
    if (!a || !b) return null;
    const n = Math.round(Date.UTC(+b[1], +b[2] - 1, +b[3]) / 864e5 - Date.UTC(+a[1], +a[2] - 1, +a[3]) / 864e5);
    return n < 0 ? null : { days: n + 1, nights: n };
  }
  const range = c => c.dateFrom === c.dateTo ? pDate(c.dateFrom) : 'من ' + pDate(c.dateFrom) + ' إلى ' + pDate(c.dateTo);
  const shortName = n => String(n || '').split(' ').slice(0, 2).join(' ');
  const gLabel = g => g === 'ذكر' ? 'للشباب' : g === 'أنثى' ? 'للبنات' : 'للجميع';
  const gBadge = g => g === 'ذكر' ? 'b' : g === 'أنثى' ? 's' : 'g';
  const ST = { draft: ['مسودة', 'g'], open: ['مفتوح للحجز', 'o'], closed: ['مغلق', 'p'] };
  const BK = { requested: ['طلب جديد', 'p'], accepted: ['مقبول', 'o'], rejected: ['مرفوض', 'n'], cancelled: ['ملغي', 'g'] };
  let probed = false;
  async function probe() {                                          // بيتأكد إن Conferences.gs منشور على الخادم (من غير ما يسجّل خروج لو لأ)
    if (probed) return true;
    const r = await api('confInfo', {}, 20000);
    probed = !!(r && r.ok && r.conf);
    return probed;
  }
  const staleHTML = () => `<div class="notice bad">موديول المؤتمرات مش شغال على الخادم. تأكد إنك: (1) ضفت ملف <b>Conferences</b> في Apps Script، (2) لصقت Code.gs الجديد، (3) عملت Deploy ← Manage deployments ← ✏️ ← <b>New version</b>.</div><button class="btn" data-retry>إعادة المحاولة</button>`;
  const bind = (box, fn) => { const b = box.querySelector('[data-retry]'); if (b) b.onclick = fn; };

  /* =====================================================================
     العضو
     ===================================================================== */
  const CM = { items: [] };

  function memState(c) {
    const my = c.my || { status: 'none' }, open = c.status === 'open';
    const cancel = open ? ' <button class="btn sm" data-act="cancel">إلغاء الاشتراك</button>' : '';
    if (my.status === 'requested') return `<span class="badge p">طلبك قيد المراجعة من الإدارة</span>${open ? ' <button class="btn sm" data-act="cancel">إلغاء الطلب</button>' : ''}`;
    if (my.status === 'accepted' && my.needsCode) return `<div class="notice good">تم قبول اشتراكك ✔ الإدارة هتبعتلك <b>كود المؤتمر</b> (4 أرقام وحروف). اكتبه هنا عشان تفتح اختيار المقعد والسرير.</div>
      <div class="row"><input class="tcode" maxlength="4" placeholder="XXXX" data-tc autocomplete="off" autocapitalize="characters"><button class="btn pri" data-act="verify">فتح</button>${cancel}</div>`;
    if (my.status === 'accepted') {
      const bits = [];
      if (c.useBus) bits.push(my.seat ? `🚌 مقعد <b>${my.seat}</b>` : '🚌 لسه ما اخترتش مقعد');
      if (c.bedsTotal) bits.push(my.bed ? `🛏️ ${esc(my.roomName || 'غرفة')} · سرير <b>${my.bed}</b>` : '🛏️ لسه ما اخترتش سرير');
      return `<div class="cf-mine">${bits.join(' &nbsp;·&nbsp; ') || 'تم قبولك'}</div><div class="row" style="margin-top:8px">
        <button class="btn gold" data-act="open">${open ? ((my.seat || my.bed) ? '✎ تعديل حجزي' : '🏨 اختيار المقعد والسرير') : '👁 عرض حجزي'}</button>${cancel}</div>`;
    }
    if (my.status === 'rejected') return `<div class="notice bad">تم رفض طلب الاشتراك${my.reason ? ': ' + esc(my.reason) : ''}</div>${open ? '<button class="btn pri" data-act="join">إعادة الطلب</button>' : ''}`;
    return open ? `${my.status === 'cancelled' ? '<span class="badge g">ألغيت اشتراكك</span> ' : ''}<button class="btn pri" data-act="join">🙋 طلب الاشتراك في المؤتمر</button>` : '<span class="badge g">التسجيل مغلق</span>';
  }
  function memCard(c) {
    return `<div class="trip${c.past ? ' past' : ''}" data-id="${esc(c.id)}">
      <div class="row" style="justify-content:space-between"><h4>🏨 ${esc(c.title)}</h4>${c.status === 'closed' ? '<span class="badge g">الحجز مغلق</span>' : '<span class="badge o">الحجز مفتوح</span>'}</div>
      <div class="tmeta"><span>📍 ${esc(c.destination)}</span><span>📅 ${esc(range(c))}</span><span>⏱ ${esc(spanText(c.days, c.nights))}</span>${c.price ? `<span>💰 ${esc(c.price)}</span>` : ''}</div>
      ${c.details ? `<div style="margin:0 0 6px;white-space:pre-wrap;word-break:break-word">${esc(c.details)}</div>` : ''}
      <div class="tmeta">${c.useBus ? `<span>🚌 الأتوبيس: ${c.seatsTaken}/${c.seatsTotal}</span>` : ''}${c.bedsTotal ? `<span>🛏️ الأسرّة: ${c.bedsTaken}/${c.bedsTotal} (${c.roomsCount} غرفة)</span>` : ''}</div>
      <div class="tstate">${memState(c)}</div></div>`;
  }
  function renderMember() {
    $('#memConf').innerHTML = CM.items.length ? CM.items.map(memCard).join('') : '<div class="empty">مفيش مؤتمرات متاحة دلوقتي 🏨</div>';
  }
  async function loadMember() {
    const box = $('#memConf'); box.innerHTML = pSpin;
    if (!(await probe())) { box.innerHTML = staleHTML(); bind(box, loadMember); return; }
    const r = await mcall('confList');
    if (!r.ok) { box.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
    CM.items = r.items;
    if (!r.items.length) { applyMemberTabs({ ...(PM.tabs || {}), conf: 0 }); return; }      // مفيش مؤتمرات: التاب يختفي
    renderMember();
  }
  async function onMemberClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('.trip'), id = card.dataset.id, act = btn.dataset.act, c = CM.items.find(x => x.id === id);
    if (act === 'open') return openSelect(id);
    btn.disabled = true;
    try {
      if (act === 'join') { const r = await mcall('confJoin', { confId: id }); toast(r.ok ? 'تم إرسال طلب الاشتراك ✔' : r.error, r.ok ? 'ok' : 'err'); }
      else if (act === 'cancel') {
        if (!await ask({ title: 'إلغاء الاشتراك', msg: `إلغاء اشتراكك في «${c ? c.title : 'المؤتمر'}»؟ مقعدك وسريرك (لو حجزت) هيتحرروا.`, okText: 'إلغاء الاشتراك' })) return;
        const r = await mcall('confCancel', { confId: id }); toast(r.ok ? 'تم الإلغاء' : r.error, r.ok ? 'ok' : 'err');
      } else if (act === 'verify') {
        const code = toEn(card.querySelector('[data-tc]').value).replace(/\s+/g, '').toUpperCase();
        if (code.length !== 4) { toast('كود المؤتمر 4 خانات.', 'err'); return; }
        const r = await mcall('confVerifyCode', { confId: id, code });
        if (!r.ok) { toast(r.error, 'err'); return; }
        toast('تم فتح المؤتمر ✔ اختار مقعدك وسريرك', 'ok'); await loadMember(); return openSelect(id);
      }
      await loadMember();
    } finally { btn.disabled = false; }
  }

  // نافذة اختيار المقعد والسرير: بتتحدّث كل 15 ثانية، والخادم هو اللي بيقرر لو اتنين اختاروا نفس المكان
  async function openSelect(confId) {
    let v = '', st = null, tab = '', selSeat = 0, selBed = null, busy = false, timer = null, dirty = false;
    const m = pModal('اختيار المقعد والسرير', pSpin, '', { tag: 'member', onClose: () => { clearInterval(timer); const b = $('#memConf'); if (dirty && b && !b.hidden) loadMember(); } });
    const body = m.q('.bd');

    const roomHTML = r => {
      const restricted = !!(r.gender && r.gender !== st.myGender), taken = Object.keys(r.occ).length, open = st.conf.status === 'open';
      const beds = [];
      for (let b = 1; b <= r.beds; b++) {
        const o = r.occ[b]; let cls = 'cf-bed', nm = '', title = '';
        if (o) { cls += o.me ? ' mine' : ' taken'; nm = o.me ? 'أنت' : shortName(o.n); title = o.n; }
        else if (restricted || !open) cls += ' lock';
        else { cls += ' free'; if (selBed && selBed.room === r.id && selBed.bed === b) cls += ' sel'; }
        beds.push(`<button type="button" class="${cls}" data-room="${esc(r.id)}" data-bed="${b}" title="${esc(title)}"><span class="n">${b}</span><span class="w">${esc(nm)}</span></button>`);
      }
      return `<div class="cf-room${restricted ? ' rs' : ''}"><div class="cf-rh"><b>🛏️ ${esc(r.name)}</b><span class="badge ${gBadge(r.gender)}">${gLabel(r.gender)}</span><small>${taken}/${r.beds} محجوز${restricted ? ' · مش لنوعك' : ''}</small></div>
        ${r.note ? `<div class="hint">${esc(r.note)}</div>` : ''}<div class="cf-beds">${beds.join('')}</div></div>`;
    };

    const draw = () => {
      if (!st) return;
      const c = st.conf, my = st.my, open = c.status === 'open', sc = m.el.scrollTop;
      if (!my.unlocked) { body.innerHTML = '<div class="empty">لازم اشتراكك يتقبل وتدخل كود المؤتمر الأول.</div>'; return; }
      const hasBus = !!(c.useBus && st.layout), hasRooms = !!(st.rooms && st.rooms.length), myRoom = (st.rooms || []).find(r => r.id === my.roomId);
      if (!hasBus && !hasRooms) { body.innerHTML = '<div class="empty">الأدمن لسه ما حددش أتوبيس ولا غرف للمؤتمر ده.</div>'; return; }
      if (!tab || (tab === 'bus' && !hasBus) || (tab === 'rooms' && !hasRooms)) tab = hasBus ? 'bus' : 'rooms';
      const head = `<div style="text-align:center"><b>${esc(c.title)}</b><div class="hint">${esc(range(c))} · ${esc(spanText(c.days, c.nights))} · 📍 ${esc(c.destination)}</div>
        <div class="cf-mine">${hasBus ? '🚌 مقعدك: ' + (my.seat ? '<b>' + my.seat + '</b>' : '—') : ''}${hasBus && hasRooms ? ' &nbsp;·&nbsp; ' : ''}${hasRooms ? '🛏️ سريرك: ' + (myRoom ? '<b>' + esc(myRoom.name) + ' / ' + my.bed + '</b>' : '—') : ''}</div></div>`;
      const tabs = hasBus && hasRooms ? `<div class="subtabs" data-tabs><button data-t="bus" class="${tab === 'bus' ? 'on' : ''}">🚌 الأتوبيس</button><button data-t="rooms" class="${tab === 'rooms' ? 'on' : ''}">🛏️ الغرف (${st.rooms.length})</button></div>` : '';
      const note = open ? '' : '<div class="notice warn" style="margin-top:8px">الحجز مغلق حاليًا. تقدر تشوف حجزك بس.</div>';
      let main = '';
      if (tab === 'bus') {
        const act = open ? `<div class="row" style="justify-content:center;margin-top:8px">${selSeat && selSeat !== my.seat ? `<button class="btn gold" data-do="takeSeat">${my.seat ? 'نقل حجزي إلى المقعد ' + selSeat : 'احجز المقعد ' + selSeat}</button>` : ''}${my.seat ? '<button class="btn" data-do="relSeat">إلغاء حجز مقعدي</button>' : ''}</div>` : '';
        main = `<div style="text-align:center">${open ? '<div class="hint">اضغط على مقعد أخضر، وبعدين اضغط «احجز».</div>' : ''}${BUS_LEGEND}${busHTML(st.layout, { mode: 'pick', occupied: st.occupied, mine: my.seat, sel: selSeat })}${act}</div>`;
      } else {
        const sel = selBed && st.rooms.find(r => r.id === selBed.room);
        const act = open ? `<div class="row" style="justify-content:center;margin:8px 0">${selBed && !(selBed.room === my.roomId && selBed.bed === my.bed) ? `<button class="btn gold" data-do="takeBed">${my.bed ? 'نقل حجزي' : 'احجز'} · ${esc(sel ? sel.name : '')} · سرير ${selBed.bed}</button>` : ''}${my.bed ? '<button class="btn" data-do="relBed">إلغاء حجز سريري</button>' : ''}</div>` : '';
        main = `${open ? '<div class="hint" style="text-align:center">اضغط على سرير أخضر، وبعدين اضغط «احجز». الأسماء ظاهرة عشان تعرف مين حاجز فين.</div>' : ''}
          <div class="legend"><span><i style="background:#e8f6ee;border-color:#1f8a4c"></i>متاح</span><span><i style="background:#eceff3;border-color:#cbd0d8"></i>محجوز</span><span><i style="background:#c8a24a;border-color:#a8841f"></i>سريرك</span><span><i style="background:#f3f4f6;border-color:#cbd0d8"></i>مش لنوعك</span></div>
          ${act}${st.rooms.map(roomHTML).join('')}`;
      }
      body.innerHTML = head + tabs + note + main;
      m.el.scrollTop = sc;
    };

    const refresh = async force => {
      if (busy) return; busy = true;
      const r = await mcall('confState', { confId, v: force ? '' : v }); busy = false;
      if (!m.el.isConnected) return;
      if (!r.ok) { body.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
      if (r.same) return;
      v = r.v; st = r;
      if (selSeat && st.occupied && st.occupied[selSeat]) { selSeat = 0; toast('المقعد اللي اخترته اتحجز لشخص تاني', 'err'); }
      if (selBed) { const rm = (st.rooms || []).find(x => x.id === selBed.room); if (!rm || (rm.occ[selBed.bed] && !rm.occ[selBed.bed].me)) { selBed = null; toast('السرير اللي اخترته اتحجز لشخص تاني', 'err'); } }
      draw();
    };

    body.onclick = async e => {
      if (!st) return;
      const tb = e.target.closest('[data-tabs] [data-t]'); if (tb) { tab = tb.dataset.t; return draw(); }
      const seat = e.target.closest('.bus .c.S.free');
      if (seat && st.conf.status === 'open') { const n = +seat.dataset.n; selSeat = selSeat === n ? 0 : n; return draw(); }
      const bed = e.target.closest('.cf-bed.free');
      if (bed && st.conf.status === 'open') { const k = { room: bed.dataset.room, bed: +bed.dataset.bed }; selBed = selBed && selBed.room === k.room && selBed.bed === k.bed ? null : k; return draw(); }
      const d = e.target.closest('[data-do]'); if (!d || busy) return;
      d.disabled = true; busy = true;
      const w = d.dataset.do;
      const r = w === 'takeSeat' ? await mcall('confSelectSeat', { confId, seat: selSeat })
        : w === 'relSeat' ? await mcall('confReleaseSeat', { confId })
        : w === 'takeBed' ? await mcall('confSelectBed', { confId, roomId: selBed.room, bed: selBed.bed })
        : await mcall('confReleaseBed', { confId });
      busy = false;
      if (!r.ok) toast(r.error, 'err'); else { toast(w.indexOf('rel') === 0 ? 'تم إلغاء الحجز' : 'تم الحجز ✔', 'ok'); dirty = true; }
      if (w === 'takeSeat' || w === 'relSeat') selSeat = 0; else selBed = null;
      refresh(true);
    };
    timer = setInterval(() => { if (!document.hidden && m.el.isConnected) refresh(false); }, 15000);
    refresh(true);
  }

  /* =====================================================================
     الأدمن
     ===================================================================== */
  const CA = { items: [] };

  async function loadAdmin() {
    const box = $('#admConf'); box.innerHTML = pSpin;
    if (!(await probe())) { box.innerHTML = staleHTML(); bind(box, loadAdmin); return; }
    const r = await adm('confAdminList');
    if (!r.ok) { box.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return; }
    CA.items = r.items; renderAdmin();
  }
  function renderAdmin() {
    $('#admConf').innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn ok" data-c="new">➕ مؤتمر جديد</button></div>` +
      (CA.items.length ? CA.items.map(c => { const s = ST[c.status] || ['', 'g'];
        return `<div class="trip" data-id="${esc(c.id)}"><div class="row" style="justify-content:space-between"><h4>🏨 ${esc(c.title)}</h4><span class="badge ${s[1]}">${s[0]}</span></div>
          <div class="tmeta"><span>📍 ${esc(c.destination)}</span><span>📅 ${esc(range(c))}</span><span>⏱ ${esc(spanText(c.days, c.nights))}</span></div>
          <div class="tmeta"><span>🕓 طلبات جديدة: <b>${c.requested}</b></span><span>✔ مقبولين: <b>${c.accepted}</b></span>${c.useBus ? `<span>🚌 ${c.seatsTaken}/${c.seatsTotal}</span>` : ''}${c.bedsTotal ? `<span>🛏️ ${c.bedsTaken}/${c.bedsTotal} (${c.roomsCount} غرفة)</span>` : ''}${c.unplaced ? `<span style="color:var(--warn)">⚠ بدون سكن: <b>${c.unplaced}</b></span>` : ''}</div>
          <div class="acts"><button class="btn sm pri" data-c="open">📋 إدارة المؤتمر</button><button class="btn sm" data-c="edit">✎ تعديل</button></div></div>`; }).join('')
        : '<div class="empty">مفيش مؤتمرات. اضغط «مؤتمر جديد».</div>');
  }

  /* ---------- محرر المؤتمر ---------- */
  async function openEditor(id, onSaved) {
    let c = null;
    if (id) { const r = await adm('confAdminGet', { id }); if (!r.ok) return toast(r.error, 'err'); c = r.conf; }
    const rooms = c ? c.rooms.map(r => Object.assign({}, r)) : [], occ = c ? c.occBeds : {};
    const m = pModal(c ? 'تعديل المؤتمر' : 'مؤتمر جديد', `
      <div class="grid2"><div class="field"><label>اسم المؤتمر *</label><input data-e="title" maxlength="120"></div>
        <div class="field"><label>الحالة</label><select data-e="status"><option value="draft">مسودة (مخفي عن الأعضاء)</option><option value="open">مفتوح للحجز</option><option value="closed">مغلق (عرض فقط)</option></select></div></div>
      <div class="grid2"><div class="field"><label>الوجهة *</label><input data-e="destination" maxlength="120" placeholder="مثال: دير الأنبا بيشوي - وادي النطرون"></div>
        <div class="field"><label>السعر / ملاحظة</label><input data-e="price" maxlength="60" placeholder="مثال: 1200 جنيه"></div></div>
      <div class="grid2"><div class="field"><label>من تاريخ *</label><input type="date" data-e="dateFrom" dir="ltr"></div>
        <div class="field"><label>إلى تاريخ *</label><input type="date" data-e="dateTo" dir="ltr"></div></div>
      <div data-e="span"></div>
      <div class="field"><label>تفاصيل المؤتمر</label><textarea data-e="details" rows="4" maxlength="2000" placeholder="البرنامج، المطلوب من المشترك، مواعيد الحركة..."></textarea></div>
      <label class="chk"><input type="checkbox" data-e="useCode"> 🔑 الدخول لاختيار المقعد والسرير بكود من 4 خانات (بيتولّد لما تقبل اشتراك الشخص وبتبعته له)</label>
      <h4 class="cf-sec">🚌 الأتوبيس</h4>
      <label class="chk"><input type="checkbox" data-e="useBus"> فيه حجز أتوبيس للمؤتمر ده</label>
      <div data-e="busBox"><div data-e="bus"></div></div>
      <h4 class="cf-sec">🛏️ الغرف</h4>
      <div class="hint">كل غرفة بتتعمل لوحدها بعدد أسرّتها واسمها. الأعضاء بيشوفوا كل الغرف ومين حاجز فين ويختاروا سريرهم.</div>
      <div class="cf-quick">⚡ إنشاء سريع: <input type="number" data-q="count" min="1" max="40" value="5" style="width:68px"> غرفة × <input type="number" data-q="beds" min="1" max="12" value="2" style="width:62px"> سرير
        <select data-q="gender"><option value="">للجميع</option><option value="ذكر">للشباب</option><option value="أنثى">للبنات</option></select><button type="button" class="btn sm pri" data-q="go">إنشاء</button></div>
      <div data-e="rooms"></div>
      <div class="row"><button type="button" class="btn sm ok" data-q="add">➕ إضافة غرفة</button><span class="hint" data-e="rsum"></span></div>
      <div class="formerr" data-e="err" hidden></div>`,
      '<button class="btn pri" data-e="save">💾 حفظ المؤتمر</button><button class="btn" data-e="cancel">إلغاء</button>', { tag: 'admin' });
    const e = k => m.q(`[data-e="${k}"]`), q = k => m.q(`[data-q="${k}"]`);
    e('title').value = c ? c.title : ''; e('status').value = c ? c.status : 'draft'; e('destination').value = c ? c.destination : ''; e('price').value = c ? c.price : '';
    e('dateFrom').value = c ? c.dateFrom : ''; e('dateTo').value = c ? c.dateTo : ''; e('details').value = c ? c.details : '';
    e('useCode').checked = c ? c.useCode : true; e('useBus').checked = c ? c.useBus : true;

    const spanBox = () => {                                                              // المدة بتتحسب لحظيًا
      const f = e('dateFrom').value, t = e('dateTo').value, s = calcSpan(f, t);
      e('span').innerHTML = !f || !t ? '' : s ? `<span class="cf-span">⏱ المدة: ${esc(spanText(s.days, s.nights))}</span>` : '<span class="cf-span bad">تاريخ النهاية قبل تاريخ البداية</span>';
    };
    e('dateFrom').onchange = e('dateTo').onchange = e('dateFrom').oninput = e('dateTo').oninput = spanBox; spanBox();

    const bus = BusEditor(e('bus'), c && c.layout ? { cells: c.layout.cells, nums: c.layout.nums, locked: c.seatsBooked } : null);
    const busToggle = () => { e('busBox').hidden = !e('useBus').checked; }; e('useBus').onchange = busToggle; busToggle();

    const gOpts = g => `<option value=""${g === '' ? ' selected' : ''}>للجميع</option><option value="ذكر"${g === 'ذكر' ? ' selected' : ''}>للشباب</option><option value="أنثى"${g === 'أنثى' ? ' selected' : ''}>للبنات</option>`;
    const drawRooms = () => {
      e('rooms').innerHTML = rooms.map((r, i) => { const o = r.id && occ[r.id] ? occ[r.id] : [], mx = o.length ? Math.max.apply(null, o) : 0;
        return `<div class="cf-rrow" data-i="${i}"><input data-r="name" maxlength="40" placeholder="اسم الغرفة" value="${esc(r.name)}">
          <input data-r="beds" type="number" min="${Math.max(mx, 1)}" max="12" value="${esc(r.beds)}" title="عدد الأسرّة"><select data-r="gender">${gOpts(r.gender || '')}</select>
          <input data-r="note" maxlength="80" placeholder="ملاحظة (اختياري)" value="${esc(r.note || '')}"><button type="button" data-r="del" title="${o.length ? 'فيها محجوزين' : 'حذف'}"${o.length ? ' disabled' : ''}>×</button>
          ${o.length ? `<div class="lk">🔒 ${o.length} سرير محجوز (آخر سرير محجوز رقم ${mx}) — مينفعش تحذفها ولا تقلل أسرّتها لأقل من كده</div>` : ''}</div>`; }).join('');
      let beds = 0; rooms.forEach(r => { beds += (+r.beds || 0); });
      e('rsum').textContent = rooms.length ? `الإجمالي: ${rooms.length} غرفة · ${beds} سرير` : 'مفيش غرف (المؤتمر من غير سكن)';
    };
    e('rooms').oninput = ev => { const row = ev.target.closest('.cf-rrow'); if (!row) return; const r = rooms[+row.dataset.i], k = ev.target.dataset.r; if (!r || !k || k === 'del') return; r[k] = ev.target.value; if (k === 'beds') { let b = 0; rooms.forEach(x => { b += (+x.beds || 0); }); e('rsum').textContent = `الإجمالي: ${rooms.length} غرفة · ${b} سرير`; } };
    e('rooms').onclick = ev => { const b = ev.target.closest('[data-r="del"]'); if (!b || b.disabled) return; rooms.splice(+b.closest('.cf-rrow').dataset.i, 1); drawRooms(); };
    q('add').onclick = () => { const last = rooms[rooms.length - 1]; rooms.push({ name: 'غرفة ' + (rooms.length + 1), beds: last ? +last.beds || 2 : 2, gender: last ? last.gender || '' : '', note: '' }); drawRooms(); };
    q('go').onclick = () => {
      const n = Math.min(40, Math.max(1, parseInt(q('count').value, 10) || 0)), bd = Math.min(12, Math.max(1, parseInt(q('beds').value, 10) || 0)), g = q('gender').value;
      if (rooms.length + n > 80) return toast('أقصى عدد غرف 80', 'err');
      for (let i = 0; i < n; i++) rooms.push({ name: 'غرفة ' + (rooms.length + 1), beds: bd, gender: g, note: '' });
      drawRooms();
    };
    drawRooms();
    e('cancel').onclick = m.close;
    e('save').onclick = async () => {
      const err = e('err'); err.hidden = true; const bad = t => { err.textContent = t; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
      const body = { id: c ? c.id : undefined, title: e('title').value.trim(), status: e('status').value, destination: e('destination').value.trim(), price: e('price').value.trim(),
        dateFrom: e('dateFrom').value, dateTo: e('dateTo').value, details: e('details').value, useCode: e('useCode').checked, useBus: e('useBus').checked,
        layout: e('useBus').checked ? bus.getLayout() : null,
        rooms: rooms.map(r => ({ id: r.id, name: String(r.name || '').trim(), beds: parseInt(r.beds, 10), gender: r.gender || '', note: String(r.note || '').trim() })) };
      if (!body.title) return bad('اكتب اسم المؤتمر.');
      if (!body.destination) return bad('اكتب الوجهة.');
      if (!body.dateFrom || !body.dateTo) return bad('اختر تاريخ البداية والنهاية.');
      if (!calcSpan(body.dateFrom, body.dateTo)) return bad('تاريخ النهاية لازم يكون بعد تاريخ البداية (أو نفس اليوم).');
      for (let i = 0; i < body.rooms.length; i++) { const r = body.rooms[i]; if (!r.name) return bad('اكتب اسم الغرفة رقم ' + (i + 1) + '.'); if (!(r.beds >= 1 && r.beds <= 12)) return bad('عدد الأسرّة في «' + r.name + '» من 1 إلى 12.'); }
      const b = e('save'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      const r = await adm('confSave', body, 60000);
      b.disabled = false; b.textContent = '💾 حفظ المؤتمر';
      if (!r.ok) return bad(r.error);
      m.close(); toast('تم حفظ المؤتمر ✔', 'ok'); if (onSaved) onSaved();
    };
  }

  /* ---------- نافذة إدارة المؤتمر: الطلبات + الأتوبيس + التسكين ---------- */
  async function openManage(id) {
    const m = pModal('إدارة المؤتمر', pSpin, '', { tag: 'admin' });
    const body = m.q('.bd'); let D = null;
    const load = async () => { const r = await adm('confAdminGet', { id }); if (!r.ok) { body.innerHTML = `<div class="formerr">${esc(r.error)}</div>`; return false; } D = r; draw(); return true; };
    const act = async (action, payload, okMsg) => { const r = await adm(action, payload, 60000); if (!r.ok) toast(r.error, 'err'); else if (okMsg) toast(okMsg, 'ok'); await load(); loadAdmin(); };

    const pickPerson = (room, bedNo) => {
      const cand = D.bookings.filter(b => b.status === 'accepted' && !(b.roomId && b.bed)).sort((a, b) => a.name < b.name ? -1 : 1);
      if (!cand.length) return toast('مفيش حد مقبول من غير سرير', 'err');
      const pm = pModal('تسكين: ' + room.name + ' — سرير ' + bedNo, `<div class="field"><label>اختر الشخص</label><select data-p="who">${cand.map(b => `<option value="${esc(b.id)}">${esc(b.name)} (${b.gender === 'أنثى' ? 'أنثى' : 'ذكر'})${room.gender && room.gender !== b.gender ? ' ⚠' : ''}</option>`).join('')}</select></div><div class="hint">⚠ = نوعه مختلف عن نوع الغرفة (الأدمن يقدر يتخطى القيد ده).</div>`,
        '<button class="btn pri" data-p="ok">تسكين</button><button class="btn" data-p="no">إلغاء</button>', { narrow: true, tag: 'admin' });
      pm.q('[data-p="no"]').onclick = pm.close;
      pm.q('[data-p="ok"]').onclick = async () => { const who = pm.q('[data-p="who"]').value; pm.close(); await act('confAssignBed', { id: who, roomId: room.id, bed: bedNo }, 'تم التسكين'); };
    };

    const draw = () => {
      const c = D.conf, B = D.bookings, rooms = c.rooms || [], L = c.layout, s = ST[c.status] || ['', 'g'];
      const occSeat = {}, names = {}, bySeat = {}, byBed = {};
      B.forEach(b => { if (b.status !== 'accepted') return; if (b.seat) { occSeat[b.seat] = 1; names[b.seat] = b.name; bySeat[b.seat] = b; } if (b.roomId && b.bed) byBed[b.roomId + ':' + b.bed] = b; });
      const accepted = B.filter(b => b.status === 'accepted'), placed = accepted.filter(b => b.roomId && b.bed).length, unplaced = accepted.length - placed;
      const seatOpts = cur => { if (!L) return ''; const o = ['<option value="0">— بدون مقعد —</option>']; L.cells.forEach((row, r) => { for (let k = 0; k < row.length; k++) { const ch = row.charAt(k), n = L.nums[r][k];
        if ((ch === 'S' || ch === 'X') && n) o.push(`<option value="${n}"${n === cur ? ' selected' : ''}${occSeat[n] && n !== cur ? ' disabled' : ''}>مقعد ${n}${ch === 'X' ? ' (غير متاح للأعضاء)' : ''}${occSeat[n] && n !== cur ? ' - محجوز' : ''}</option>`); } }); return o.join(''); };
      const bedOpts = (cur, person) => { let o = '<option value="">— بدون سرير —</option>'; rooms.forEach(r => { o += `<optgroup label="${esc(r.name)} (${r.beds} · ${gLabel(r.gender)})">`;
        for (let i = 1; i <= r.beds; i++) { const k = r.id + ':' + i, who = byBed[k], me = cur === k, mis = r.gender && r.gender !== person.gender ? ' ⚠' : '';
          o += `<option value="${k}"${me ? ' selected' : ''}${who && !me ? ' disabled' : ''}>سرير ${i}${mis}${who && !me ? ' - ' + esc(shortName(who.name)) : ''}</option>`; } o += '</optgroup>'; }); return o; };
      const rows = B.map(b => { const st = BK[b.status] || ['', 'g'];
        const wa = 'https://wa.me/2' + b.whatsapp + '?text=' + encodeURIComponent(`سلام ونعمة ${b.name.split(' ')[0]} 🙏\nتم قبول اشتراكك في مؤتمر «${c.title}» (${range(c)}) - ${c.destination}.\nكود المؤتمر الخاص بيك: ${b.confCode}\nادخل موقع الأعضاء ← المؤتمرات ← اكتب الكود واختار مقعدك وسريرك.`);
        let a = '';
        if (b.status === 'requested') a = `<button class="btn sm ok" data-d="accept">✔ قبول</button><button class="btn sm bad" data-d="reject">✖ رفض</button>`;
        else if (b.status === 'accepted') a = `${b.confCode ? `<a class="btn sm wa" style="text-decoration:none" target="_blank" rel="noopener" href="${wa}">📲 إرسال الكود</a>` : ''}<button class="btn sm" data-d="cancel">إلغاء</button>`;
        else a = `<button class="btn sm ok" data-d="accept">✔ قبول</button>`;
        return `<tr data-b="${esc(b.id)}"><td><b>${esc(b.name)}</b> <span class="badge ${b.gender === 'أنثى' ? 's' : 'g'}">${b.gender === 'أنثى' ? 'أنثى' : 'ذكر'}</span><br><small class="ltr" style="display:inline-block">${esc(b.code)} · ${esc(b.whatsapp)}</small>${b.note ? `<br><small style="color:var(--bad)">${esc(b.note)}</small>` : ''}</td>
          <td><span class="badge ${st[1]}">${st[0]}</span>${b.status === 'accepted' && c.useCode ? `<br><b class="ltr" style="display:inline-block;letter-spacing:2px">${esc(b.confCode)}</b><br><small>${b.verified ? '✔ دخل بالكود' : 'لسه ما دخلش'}</small>` : ''}</td>
          <td>${b.status === 'accepted' ? (c.useBus ? `<select data-seat style="min-width:110px">${seatOpts(b.seat)}</select>` : '—') : '—'}</td>
          <td>${b.status === 'accepted' ? (rooms.length ? `<select data-bed style="min-width:150px">${bedOpts(b.roomId && b.bed ? b.roomId + ':' + b.bed : '', b)}</select>` : '—') : '—'}</td><td><div class="acts">${a}</div></td></tr>`; }).join('');
      const roomsBoard = rooms.map(r => { const beds = []; let taken = 0;
        for (let i = 1; i <= r.beds; i++) { const w = byBed[r.id + ':' + i]; if (w) taken++;
          beds.push(`<button type="button" class="cf-bed adm ${w ? 'taken' : 'free'}" data-room="${esc(r.id)}" data-bed="${i}" title="${w ? esc(w.name) : 'سرير فاضي — اضغط للتسكين'}"><span class="n">${i}</span><span class="w">${w ? esc(shortName(w.name)) : ''}</span></button>`); }
        return `<div class="cf-room"><div class="cf-rh"><b>🛏️ ${esc(r.name)}</b><span class="badge ${gBadge(r.gender)}">${gLabel(r.gender)}</span><small>${taken}/${r.beds}</small></div>${r.note ? `<div class="hint">${esc(r.note)}</div>` : ''}<div class="cf-beds">${beds.join('')}</div></div>`; }).join('');
      body.innerHTML = `<div class="row" style="justify-content:space-between"><div><b>${esc(c.title)}</b> <span class="badge ${s[1]}">${s[0]}</span>
        <div class="hint">📍 ${esc(c.destination)} · ${esc(range(c))} · ⏱ ${esc(spanText(c.days, c.nights))}${c.price ? ' · 💰 ' + esc(c.price) : ''}</div></div>
        <div class="acts"><button class="btn sm" data-t2="edit">✎ تعديل المؤتمر</button><button class="btn sm" data-t2="xls">⬇ Excel</button><button class="btn sm bad" data-t2="del">🗑 حذف المؤتمر</button></div></div>
        ${c.useBus && L ? `<h4 class="cf-sec">🚌 خريطة الأتوبيس <small class="hint" style="display:inline">(اضغط على مقعد محجوز لتحريره) · ${Object.keys(occSeat).length}/${c.seatsTotal}</small></h4><div style="text-align:center">${BUS_LEGEND}${busHTML(L, { mode: 'admin', occupied: occSeat, names })}</div>` : ''}
        ${rooms.length ? `<h4 class="cf-sec">🛏️ التسكين <small class="hint" style="display:inline">(${placed}/${c.bedsTotal} سرير مشغول${unplaced ? ' · <b style="color:var(--warn)">' + unplaced + ' مقبول من غير سرير</b>' : ''})</small></h4>
          <div class="hint">اضغط على سرير فاضي لتسكين شخص، أو على سرير مشغول لتحريره.</div>${roomsBoard}` : ''}
        <h4 class="cf-sec">👥 المشتركين والطلبات (${B.length})</h4>
        <div class="row" style="margin-bottom:8px"><input data-addcode inputmode="numeric" maxlength="7" dir="ltr" placeholder="كود العضو (7 أرقام) لإضافته مباشرة" style="flex:1;min-width:200px"><button class="btn sm ok" data-t2="add">➕ إضافة عضو</button></div>
        <div class="tbl-wrap" style="max-height:50vh"><table class="tblB"><thead><tr><th>العضو</th><th>الحالة / الكود</th><th>المقعد</th><th>السرير</th><th>إجراءات</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">مفيش طلبات لسه</td></tr>'}</tbody></table></div>`;
      m._D = { bySeat, byBed };
    };

    body.addEventListener('change', async ev => {
      const tr = ev.target.closest('tr[data-b]'); if (!tr) return;
      if (ev.target.matches('[data-seat]')) await act('confAssignSeat', { id: tr.dataset.b, seat: +ev.target.value }, 'تم');
      else if (ev.target.matches('[data-bed]')) { const v = ev.target.value, p = v ? v.split(':') : ['', 0]; await act('confAssignBed', { id: tr.dataset.b, roomId: p[0], bed: +p[1] || 0 }, v ? 'تم التسكين' : 'تم تحرير السرير'); }
    });
    body.addEventListener('click', async ev => {
      const seat = ev.target.closest('.bus.adm .c.taken');
      if (seat) { const b = m._D.bySeat[+seat.dataset.n]; if (b && await ask({ title: 'تحرير المقعد ' + seat.dataset.n, msg: `المقعد محجوز لـ ${b.name}. تحريره؟`, okText: 'تحرير' })) act('confAssignSeat', { id: b.id, seat: 0 }, 'تم تحرير المقعد'); return; }
      const bed = ev.target.closest('.cf-bed.adm');
      if (bed) {
        const roomId = bed.dataset.room, n = +bed.dataset.bed, room = D.conf.rooms.find(r => r.id === roomId), w = m._D.byBed[roomId + ':' + n];
        if (w) { if (await ask({ title: 'تحرير السرير', msg: `السرير ${n} في «${room.name}» محجوز لـ ${w.name}. تحريره؟`, okText: 'تحرير' })) act('confAssignBed', { id: w.id, roomId: '', bed: 0 }, 'تم تحرير السرير'); }
        else pickPerson(room, n);
        return;
      }
      const d = ev.target.closest('[data-d]');
      if (d) {
        const bid = d.closest('tr').dataset.b, kind = d.dataset.d;
        if (kind === 'reject') { const reason = await ask({ title: 'رفض الاشتراك', msg: 'سبب الرفض (هيظهر للعضو):', input: true, okText: 'رفض' }); if (!reason) return; return act('confDecide', { id: bid, decision: 'reject', reason }, 'تم الرفض'); }
        if (kind === 'cancel' && !await ask({ title: 'إلغاء الاشتراك', msg: 'إلغاء اشتراك الشخص وتحرير مقعده وسريره؟', okText: 'إلغاء الاشتراك' })) return;
        return act('confDecide', { id: bid, decision: kind }, kind === 'accept' ? 'تم القبول — ابعت له الكود' : 'تم');
      }
      const x = ev.target.closest('[data-t2]'); if (!x) return;
      const t2 = x.dataset.t2;
      if (t2 === 'edit') return openEditor(id, () => { load(); loadAdmin(); });
      if (t2 === 'del') { if (!await ask({ title: 'حذف المؤتمر', msg: 'حذف المؤتمر وحجوزاته؟ هيتنقل لسلة المحذوفات.', okText: 'حذف' })) return; const r = await adm('confDelete', { id }); if (r.ok) { m.close(); loadAdmin(); toast('تم الحذف (في سلة المحذوفات)', 'ok'); if (typeof refreshTrashCount === 'function') refreshTrashCount(); } else toast(r.error, 'err'); return; }
      if (t2 === 'add') { const code = toEn(m.q('[data-addcode]').value).replace(/\D/g, ''); if (code.length !== 7) return toast('الكود 7 أرقام', 'err'); return act('confAddMember', { confId: id, code }, 'تمت الإضافة — ابعت له الكود'); }
      if (t2 === 'xls') {
        if (!window.XLSX) return toast('مكتبة Excel لم تُحمّل', 'err');
        const roomName = {}; (D.conf.rooms || []).forEach(r => { roomName[r.id] = r.name; });
        const aoa = [['الاسم', 'النوع', 'كود العضو', 'الواتساب', 'الحالة', 'كود المؤتمر', 'المقعد', 'الغرفة', 'السرير']].concat(D.bookings.map(b => [b.name, b.gender, b.code, b.whatsapp, (BK[b.status] || [''])[0], b.confCode || '', b.seat || '', roomName[b.roomId] || '', b.bed || '']));
        const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'المؤتمر'); XLSX.writeFile(wb, `conference_${D.conf.dateFrom}.xlsx`);
      }
    });
    load();
  }

  /* ---------- تشغيل ---------- */
  function init() {
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    const mb = document.getElementById('memConf'); if (mb) mb.addEventListener('click', onMemberClick);
    const ab = document.getElementById('admConf');
    if (ab) ab.addEventListener('click', ev => {
      const b = ev.target.closest('[data-c]'); if (!b) return;
      const card = b.closest('.trip'), id = card && card.dataset.id, k = b.dataset.c;
      if (k === 'new') openEditor(null, loadAdmin); else if (k === 'edit') openEditor(id, loadAdmin); else if (k === 'open') openManage(id);
    });
  }
  window.confModule = { loadMember, loadAdmin };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

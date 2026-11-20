/* 이사 탭 부품(2026-11-20) — 범용판(/my/)과 개인판(/)이 같이 쓴다. 저장 방식만 갈아 끼운다.
 * 출처: 효니 말 «응 그렇게 해주고»(이사 체크리스트 틀을 범용판에, 원래 세션이 전달),
 *       개인판 «이사» 탭 «남친도 체크해도 됨», «특약 유의사항 메모 칸에 계약서 사진도 올릴게»(2026-11-20).
 *
 * 쓰는 법:  window.HH_MOVE = HHMove.create({ load, save, toast, template, extras, who, assets, open })
 *   load()      → 저장된 MoveData(없으면 null). 부품이 고친 뒤에는 save(data)를 부른다(통째로 넘김).
 *   save(data)  → 저장(Promise여도 됨). 실패하면 throw → 토스트로 알리고 다시 그린다.
 *   toast(text) → 앱의 토스트(없으면 조용히).
 *   template    → 기본 할 일 틀([id, off, 제목] 목록). 없으면 아래 TEMPLATE. 개인판은 [](할 일은 시트에 들어 있음).
 *   extras      → true면 «돈 흐름»·«계약·메모(사진)» 칸도 그린다(개인판).
 *   who()       → 체크한 사람 이름(개인판은 의견에 쓰는 이름). 비면 이름을 안 남긴다.
 *   assets      → { upload(file) → {id}, delete(id), src(id) → 주소 } 메모 사진용(없으면 사진 단추 숨김).
 *   open(list, i, alt) → 사진 크게 보기(앱의 넘겨 보기). list = [{src}]
 *   반환: { mount(el), render(), normalize, merge, blank }
 *
 * MoveData v1 (칸을 더할 때는 빈 값으로 읽히게만 더한다):
 *   { v: 1, date: "YYYY-MM-DD" 또는 "", dateAt: 이사 날을 바꾼 때(ISO),
 *     tasks:  [{ id, title, off: 이사 날 기준 날 수(-90 = D-90, 0 = 당일, 7 = 이사 뒤), done, by: 체크한 사람, memo, custom(내가 더한 일), del(숨김·지움), at }],
 *     quotes: [{ id, company, price: 만 원 숫자 또는 null, how: "방문"|"전화"|"앱", memo, pick, del, at }],
 *     money:  [{ id, label, amt: 만 원(들어오면 +, 나가면 −), done: 이미 오간 돈, del, at }],
 *     notes:  [{ id, title, text, photos: [사진 id], del, at }] }
 *   기본 할 일은 id가 «m-»로 시작해 기기마다 같다(합치기 때 같은 일로 묶임). 지운 것은 del 표시만 남긴다(합칠 때 되살아나지 않게).
 *   합치기: 할 일·견적·돈·메모는 id마다 at이 나중인 쪽, 이사 날은 dateAt이 나중인 쪽. 개인판은 서버(Code.gs mergeMove_)가 같은 규칙으로 합친다.
 */
(function () {
  "use strict";
  const TEMPLATE = [
    ["m-movers", -90, "이삿짐센터 견적 받기(두세 곳 비교)"],
    ["m-registry", -90, "새 집 등기부등본 확인(소유자·근저당)"],
    ["m-senior", -90, "선순위 보증금·집주인 세금 체납 확인"],
    ["m-notice", -60, "지금 집 계약 해지 통지 — 문자로 남겨 두기"],
    ["m-internet", -30, "인터넷·TV 이전 신청"],
    ["m-gas", -30, "도시가스 이전(철거·설치) 예약"],
    ["m-address", -30, "주소 바꾸기(은행·카드·택배 앱)"],
    ["m-photo", -1, "새 집 사진 찍어 두기(흠집·곰팡이·계량기)"],
    ["m-deposit", 0, "① 지금 집 보증금 돌려받기"],
    ["m-loan", 0, "② (전세대출이 있으면) 대출 갚기"],
    ["m-balance", 0, "③ 새 집 잔금 보내기"],
    ["m-register", 0, "④ 전입신고·확정일자 받기"],
    ["m-receipt", 7, "대출 상환 확인서 받아 두기"]
  ];
  const GROUPS = [[-90, "D-90"], [-60, "D-60"], [-30, "D-30"], [-1, "D-1"], [0, "이사 날"], [7, "이사 뒤"]];
  const now = () => new Date().toISOString();
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const okId = (id) => /^[a-z0-9-]{1,60}$/.test(String(id || ""));
  const tm = (s) => Date.parse(s || 0) || 0;
  // 고친 때: 지금, 단 고치기 전 값보다는 꼭 나중(다른 기기 시계가 앞서 있어도 방금 고친 쪽이 합치기에서 이긴다)
  const tick = (prev) => new Date(Math.max(Date.now(), tm(prev) + 1)).toISOString();
  const DAY = 86400000;
  const todayUTC = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const dateUTC = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const ymd = (t) => { const d = new Date(t); return (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일"; };
  // 만 원 → «1억 8천»·«9,720»(앱의 won과 같은 모양)
  const won = (n) => { const a = Math.abs(n), e = Math.floor(a / 10000), r = Math.round((a % 10000) * 10) / 10; return (e ? e + "억" + (r ? " " : "") : "") + (r ? (r % 1000 === 0 && e ? (r / 1000) + "천" : r.toLocaleString("ko-KR")) : (e ? "" : "0")); };
  const okPhoto = (p) => typeof p === "string" && /^[a-z]{1,4}:[A-Za-z0-9_-]{1,200}$/.test(p);

  function blank(tpl) {
    const t = now();
    return { v: 1, date: "", dateAt: t, tasks: (tpl || TEMPLATE).map((x) => ({ id: x[0], title: x[2], off: x[1], done: false, by: "", memo: "", custom: false, del: false, at: t })), quotes: [], money: [], notes: [] };
  }
  // 받은 데이터(파일·서버)를 거른다. 모양이 다른 칸은 버린다
  function normalize(d, tpl) {
    tpl = tpl || TEMPLATE;
    if (!d || typeof d !== "object") return blank(tpl);
    const s = (v, n) => String(v == null ? "" : v).slice(0, n);
    const out = { v: 1, date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") ? d.date : "", dateAt: s(d.dateAt, 40), tasks: [], quotes: [], money: [], notes: [] };
    const each = (arr, fn) => (Array.isArray(arr) ? arr : []).forEach((x) => { if (x && okId(x.id)) fn(x); });
    each(d.tasks, (x) => {
      if (out.tasks.some((y) => y.id === x.id)) return;
      const off = Math.max(-365, Math.min(365, Math.round(Number(x.off) || 0)));
      out.tasks.push({ id: x.id, title: s(x.title, 120) || "할 일", off: off, done: !!x.done, by: s(x.by, 20), memo: s(x.memo, 300), custom: !!x.custom, del: !!x.del, at: s(x.at, 40) });
    });
    // 새 기본 할 일이 생겼으면(부품을 고친 뒤) 빠진 것만 더한다
    tpl.forEach((x) => { if (!out.tasks.some((y) => y.id === x[0])) out.tasks.push({ id: x[0], title: x[2], off: x[1], done: false, by: "", memo: "", custom: false, del: false, at: "" }); });
    each(d.quotes, (q) => {
      if (out.quotes.some((y) => y.id === q.id)) return;
      const p = Number(q.price);
      out.quotes.push({ id: q.id, company: s(q.company, 40) || "업체", price: q.price != null && q.price !== "" && Number.isFinite(p) && p >= 0 ? Math.round(p * 10) / 10 : null, how: ["방문", "전화", "앱"].includes(q.how) ? q.how : "방문", memo: s(q.memo, 300), pick: !!q.pick, del: !!q.del, at: s(q.at, 40) });
    });
    each(d.money, (m) => {
      if (out.money.some((y) => y.id === m.id)) return;
      const a = Number(m.amt);
      out.money.push({ id: m.id, label: s(m.label, 60) || "돈", amt: Number.isFinite(a) ? Math.max(-1e7, Math.min(1e7, Math.round(a * 10) / 10)) : 0, done: !!m.done, del: !!m.del, at: s(m.at, 40) });
    });
    each(d.notes, (n) => {
      if (out.notes.some((y) => y.id === n.id)) return;
      out.notes.push({ id: n.id, title: s(n.title, 60) || "메모", text: s(n.text, 4000), photos: (Array.isArray(n.photos) ? n.photos : []).filter(okPhoto).slice(0, 30), del: !!n.del, at: s(n.at, 40) });
    });
    return out;
  }
  function merge(mine, theirs, tpl) {
    const a = normalize(mine, tpl), b = normalize(theirs, tpl);
    const pick = (x, y) => tm(y.at) > tm(x.at) ? y : x;
    const join = (xs, ys) => { const m = new Map(xs.map((x) => [x.id, x])); ys.forEach((y) => m.set(y.id, m.has(y.id) ? pick(m.get(y.id), y) : y)); return [...m.values()]; };
    const out = { v: 1, date: a.date, dateAt: a.dateAt, tasks: join(a.tasks, b.tasks), quotes: join(a.quotes, b.quotes), money: join(a.money, b.money), notes: join(a.notes, b.notes) };
    if (tm(b.dateAt) > tm(a.dateAt)) { out.date = b.date; out.dateAt = b.dateAt; }
    return out;
  }

  function create(opt) {
    opt = opt || {};
    const TPL = Array.isArray(opt.template) ? opt.template : TEMPLATE;
    let D = null, root = null, busy = 0, editing = null;
    const toast = (t) => { try { if (opt.toast) opt.toast(t); } catch (e) { /* 토스트 없음 */ } };
    const get = () => { if (!D) D = normalize(opt.load ? opt.load() : null, TPL); return D; };
    const who = () => { try { return String(opt.who ? opt.who() || "" : "").slice(0, 20); } catch (e) { return ""; } };
    // 저장이 되면 true(사진 파일 지우기처럼 저장 뒤에만 할 일이 쓴다)
    async function commit(msg) {
      let ok = true;
      try { await (opt.save && opt.save(JSON.parse(JSON.stringify(D)))); if (msg) toast(msg); }
      catch (e) { ok = false; toast("저장하지 못했어요: " + (e && e.message || "오류")); }
      render();
      return ok;
    }
    function h(tag, attrs, kids) { const e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach((k) => { const v = attrs[k]; if (v == null || v === false) return; if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }); (kids || []).forEach((c) => c != null && c !== false && e.append(c)); return e; }

    function head(d) {
      const t0 = dateUTC(d.date), left = isNaN(t0) ? null : Math.round((t0 - todayUTC()) / DAY);
      const inp = h("input", { type: "date", id: "mvDate", value: d.date || "" });
      inp.addEventListener("change", () => { D.date = inp.value || ""; D.dateAt = tick(D.dateAt); commit(D.date ? "이사 날을 정했어요" : "이사 날을 지웠어요"); });
      const live = d.tasks.filter((x) => !x.del), done = live.filter((x) => x.done).length;
      const big = left == null ? "이사 날을 넣어 주세요" : left > 0 ? "D-" + left : left === 0 ? "오늘 이사!" : "이사 " + (-left) + "일 지남";
      return h("section", { class: "mv-head" }, [
        h("div", { class: "mv-dday" }, [h("b", { class: "num", text: big }), h("span", { class: "small muted", text: "할 일 " + live.length + "개 중 " + done + "개 끝" })]),
        h("div", { class: "mv-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(live.length || 1), "aria-valuenow": String(done), "aria-label": "끝낸 할 일" }, [h("i", { style: "width:" + (live.length ? Math.round(done / live.length * 100) : 0) + "%" })]),
        h("label", { class: "field", for: "mvDate" }, [h("span", { class: "small muted", text: "이사 날" }), inp]),
        // 체크한 사람 이름: 개인판에서 아직 이름이 없는 기기(의견을 안 남긴 폰)면 여기서 한 번 받는다
        opt.setWho && !who() ? h("label", { class: "field mv-who", for: "mvWho" }, [h("span", { class: "small muted", text: "내 이름(체크할 때 같이 남아요)" }), (() => { const w = h("input", { id: "mvWho", maxlength: "20", placeholder: "예: 효니" }); w.addEventListener("change", () => { const v = w.value.trim(); if (!v) return; try { opt.setWho(v.slice(0, 20)); } catch (e) { /* 저장 안 돼도 이번엔 씀 */ } toast(v + " 이름으로 남겨요"); render(); }); return w; })()]) : null,
        opt.extras ? null : h("p", { class: "hint", text: "이사 날을 넣으면 D-90·D-60처럼 날짜를 거꾸로 세서 할 일마다 날짜가 붙어요. 순서·날짜는 흔히 하는 틀이니 내 사정에 맞게 고치거나 지워 주세요." })
      ]);
    }
    function taskRow(x, t0) {
      const cb = h("input", { type: "checkbox", id: "mv_" + x.id, checked: x.done });
      cb.addEventListener("change", () => { x.done = cb.checked; x.by = cb.checked ? who() : ""; x.at = tick(x.at); commit(); });
      const memoIn = h("input", { class: "mv-memo", id: "mvm_" + x.id, value: x.memo || "", placeholder: "메모", "aria-label": x.title + " 메모" });
      memoIn.addEventListener("change", () => { x.memo = memoIn.value.trim().slice(0, 300); x.at = tick(x.at); commit(); });
      // 메모가 없으면 칸 대신 작은 «메모» 단추(할 일이 많아 칸이 늘 보이면 빽빽함). 누르면 칸이 열린다
      const memo = x.memo ? memoIn : h("button", { type: "button", class: "btn ghost mv-memo-add", text: "+ 메모", "aria-label": x.title + " 메모 쓰기", onclick: (e) => { e.currentTarget.replaceWith(memoIn); memoIn.focus(); } });
      const del = h("button", { type: "button", class: "btn ghost mv-x", "aria-label": x.title + " 지우기", title: x.custom ? "지우기" : "숨기기", text: "✕", onclick: () => { x.del = true; x.at = tick(x.at); commit(x.custom ? "지웠어요" : "숨겼어요 · «숨긴 일 다시 보기»로 되살릴 수 있어요"); } });
      const when = isNaN(t0) ? null : h("span", { class: "small muted num", text: ymd(t0 + x.off * DAY) });
      const by = x.done && x.by ? h("span", { class: "mv-by", text: x.by + " 체크" }) : null;
      if (editing === x.id) return editRow(x);
      const ed = h("button", { type: "button", class: "btn ghost mv-ed", "aria-label": x.title + " 고치기", title: "고치기", text: "✎", onclick: () => { editing = x.id; render(); const n = root.querySelector("#mveT"); if (n) n.focus(); } });
      return h("li", { class: "mv-task" + (x.done ? " done" : "") }, [cb, h("label", { for: "mv_" + x.id, class: "mv-title" }, [document.createTextNode(x.title), x.custom ? h("span", { class: "mv-mine", text: "내 할 일" }) : null, by]), when, memo, del, ed]);
    }
    // 할 일 고치기(2026-11-20 효니 «할 일 수정할 수 있게»): 제목·때(묶음)·메모. 묶음을 안 바꾸면 원래 날 수(예: D-92)를 그대로 둔다
    function editRow(x) {
      const gi = (() => { let k = 0; GROUPS.forEach((g, i) => { if (x.off >= g[0]) k = i; }); return k; })();
      const ti = h("input", { id: "mveT", value: x.title, maxlength: "120", "aria-label": "할 일 제목" });
      const sel = h("select", { id: "mveG", "aria-label": "언제" }, GROUPS.map((g, i) => h("option", { value: String(i), text: g[1] })));
      sel.value = String(gi);
      const me = h("input", { id: "mveM", value: x.memo || "", maxlength: "300", placeholder: "메모", "aria-label": "메모" });
      const save = () => {
        const t = ti.value.trim(); if (!t) { ti.focus(); return; }
        x.title = t.slice(0, 120); x.memo = me.value.trim().slice(0, 300);
        if (Number(sel.value) !== gi) x.off = GROUPS[Number(sel.value)][0];
        x.at = tick(x.at); editing = null; commit("고쳤어요");
      };
      const cancel = () => { editing = null; render(); };
      [ti, me].forEach((n) => n.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } else if (e.key === "Escape") { e.preventDefault(); cancel(); } }));
      return h("li", { class: "mv-task mv-editing" }, [h("div", { class: "mv-edit" }, [ti, h("div", { class: "mv-addrow" }, [sel, me]), h("div", { class: "mv-addrow" }, [h("button", { type: "button", class: "btn primary", text: "저장", onclick: save }), h("button", { type: "button", class: "btn ghost", text: "취소", onclick: cancel })])])]);
    }
    // 접기(2026-11-20 효니 «토글로 접게»): 기기마다 기억(localStorage, 주소별). 기본은 펼침, 다 끝난 지난 묶음만 접힘
    const FOLD_KEY = "mvfold:" + location.pathname;
    let FOLD = {}; try { FOLD = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}") || {}; } catch (e) { FOLD = {}; }
    const isOpen = (key, def) => (key in FOLD ? !!FOLD[key] : def);
    function foldBox(key, def, cls, sum, kids, force) {
      const dt = h("details", { class: cls, open: force || isOpen(key, def) }, [h("summary", null, sum)].concat(kids));
      const first = dt.open; let seen = false;
      // 처음 그릴 때 open 때문에 나는 toggle은 사람이 누른 게 아니라 기억하지 않는다(안 그러면 «다 끝난 묶음 접힘» 기본값이 굳어 버림)
      dt.addEventListener("toggle", () => { if (!seen && dt.open === first) { seen = true; return; } seen = true; FOLD[key] = dt.open; try { localStorage.setItem(FOLD_KEY, JSON.stringify(FOLD)); } catch (e) { /* 기억 못 해도 됨 */ } });
      return dt;
    }
    function tasks(d) {
      const t0 = dateUTC(d.date), today = todayUTC();
      const box = h("section", { class: "mv-tasks" }, [h("h3", { text: "할 일" })]);
      GROUPS.forEach((g, gi) => {
        const nextOff = gi + 1 < GROUPS.length ? GROUPS[gi + 1][0] : Infinity;
        // D-90보다 이른 일(off < -90)도 첫 묶음에 넣는다
        const list = d.tasks.filter((x) => !x.del && (x.off >= g[0] || gi === 0) && x.off < nextOff).sort((a, b) => a.off - b.off || (a.custom - b.custom));
        if (!list.length) return;
        const gStart = t0 + g[0] * DAY, gEnd = t0 + Math.min(nextOff, 366) * DAY;
        const state = isNaN(t0) ? "" : today >= gEnd ? "지난 때" : today >= gStart ? "지금" : "";
        const left = list.filter((x) => !x.done).length;
        const tag = state === "지난 때" && left ? "남은 일 " + left : state ? state : left === 0 ? "다 끝" : left + "개 남음";
        const hasEdit = list.some((x) => x.id === editing);
        const g0 = foldBox("g" + g[0], left > 0 || state === "지금", "mv-group" + (state === "지금" ? " now" : ""),
          [h("span", { class: "mv-gh" }, [h("b", { text: g[1] }), isNaN(t0) ? null : h("span", { class: "small muted num", text: ymd(gStart) + (g[0] === 0 ? "" : " 즈음") }), h("span", { class: "mv-state" + (state === "지난 때" && left ? " late" : "") + (left === 0 ? " done" : ""), text: tag })])],
          [h("ul", null, list.map((x) => taskRow(x, t0)))], hasEdit);
        box.append(g0);
      });
      // 내 할 일 더하기
      const title = h("input", { id: "mvNewT", placeholder: "예: 에어컨 이전 설치 예약", maxlength: "120" });
      const sel = h("select", { id: "mvNewG", "aria-label": "언제" }, GROUPS.map((g) => h("option", { value: String(g[0]), text: g[1] })));
      sel.value = "-30";
      const add = () => { const v = title.value.trim(); if (!v) { title.focus(); return; } D.tasks.push({ id: rid("t"), title: v.slice(0, 120), off: Number(sel.value), done: false, by: "", memo: "", custom: true, del: false, at: now() }); commit("할 일을 더했어요"); setTimeout(() => { const n = root && root.querySelector("#mvNewT"); if (n) n.focus(); }, 0); };
      title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      box.append(h("div", { class: "mv-add" }, [h("label", { class: "small muted", for: "mvNewT", text: "내 할 일 더하기" }), h("div", { class: "mv-addrow" }, [title, sel, h("button", { type: "button", class: "btn primary", text: "더하기", onclick: add })])]));
      const hidden = d.tasks.filter((x) => x.del && !x.custom);
      if (hidden.length) box.append(h("button", { type: "button", class: "btn ghost small", text: "숨긴 기본 할 일 다시 보기(" + hidden.length + ")", onclick: () => { hidden.forEach((x) => { x.del = false; x.at = tick(x.at); }); commit("다시 보이게 했어요"); } }));
      return box;
    }
    function quotes(d) {
      const live = d.quotes.filter((q) => !q.del);
      const prices = live.map((q) => q.price).filter((p) => p != null);
      const low = prices.length > 1 ? Math.min(...prices) : null;
      const box = h("section", { class: "mv-quotes" }, [h("h3", { text: "이삿짐센터 견적 비교" }), h("p", { class: "hint", text: "견적을 받을 때마다 적어 두고, 고른 곳에 ★를 눌러요. 금액은 만 원 단위." })]);
      const list = h("div", { class: "mv-qlist" });
      live.sort((a, b) => (b.pick - a.pick) || ((a.price == null) - (b.price == null)) || (a.price - b.price)).forEach((q) => {
        const star = h("button", { type: "button", class: "btn ghost mv-star" + (q.pick ? " on" : ""), "aria-pressed": String(q.pick), "aria-label": q.company + " 고르기", text: q.pick ? "★" : "☆", onclick: () => { const on = !q.pick; live.forEach((o) => { if (o.pick) { o.pick = false; o.at = tick(o.at); } }); q.pick = on; q.at = tick(q.at); commit(on ? q.company + "(으)로 골랐어요" : ""); } });
        const memo = h("input", { class: "mv-memo", id: "mvq_" + q.id, value: q.memo || "", placeholder: "메모(포장·사다리차 등)", "aria-label": q.company + " 메모" });
        memo.addEventListener("change", () => { q.memo = memo.value.trim().slice(0, 300); q.at = tick(q.at); commit(); });
        const del = h("button", { type: "button", class: "btn ghost mv-x", "aria-label": q.company + " 지우기", text: "✕", onclick: () => { q.del = true; q.at = tick(q.at); commit("지웠어요"); } });
        list.append(h("div", { class: "mv-q" + (q.pick ? " pick" : "") }, [star,
          h("div", { class: "mv-qn" }, [h("b", { text: q.company }), h("span", { class: "small muted", text: q.how + " 견적" })]),
          h("div", { class: "mv-qp num" }, [h("b", { text: q.price == null ? "–" : q.price.toLocaleString("ko-KR") }), document.createTextNode(q.price == null ? "" : "만 원"), q.price != null && q.price === low ? h("span", { class: "mv-low", text: "제일 쌈" }) : null]),
          memo, del]));
      });
      if (!live.length) list.append(h("p", { class: "small muted", text: "아직 적은 견적이 없어요." }));
      box.append(list);
      const co = h("input", { id: "mvQc", placeholder: "업체 이름", maxlength: "40" });
      const pr = h("input", { id: "mvQp", placeholder: "금액(만 원)", inputmode: "decimal" });
      const how = h("select", { id: "mvQh", "aria-label": "견적 방식" }, ["방문", "전화", "앱"].map((x) => h("option", { text: x })));
      const add = () => { const c = co.value.trim(); if (!c) { co.focus(); return; } const p = Number(String(pr.value).replace(/[, 만원]/g, "")); D.quotes.push({ id: rid("q"), company: c.slice(0, 40), price: pr.value.trim() && Number.isFinite(p) ? p : null, how: how.value, memo: "", pick: false, del: false, at: now() }); commit("견적을 적었어요"); };
      [co, pr].forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }));
      box.append(h("div", { class: "mv-add" }, [h("label", { class: "small muted", for: "mvQc", text: "견적 더하기" }), h("div", { class: "mv-addrow" }, [co, pr, how, h("button", { type: "button", class: "btn primary", text: "더하기", onclick: add })])]));
      return box;
    }
    // 돈 흐름(개인판): 줄마다 들어오는 돈(+)·나가는 돈(−)을 적으면 위에서부터 더해 «남는 돈»을 보인다. 이미 오간 돈은 체크
    function money(d) {
      const live = d.money.filter((m) => !m.del);
      const box = h("section", { class: "mv-money" }, [h("h3", { text: "돈 흐름" }), h("p", { class: "hint", text: "위에서부터 차례로 더해요. 금액은 만 원 단위, 나가는 돈은 −. 이미 오간 돈은 체크." })]);
      let run = 0;
      const list = h("ol", { class: "mv-mlist" });
      live.forEach((m) => {
        run = Math.round((run + m.amt) * 10) / 10;
        const cb = h("input", { type: "checkbox", id: "mvd_" + m.id, checked: m.done, "aria-label": m.label + " 오갔음" });
        cb.addEventListener("change", () => { m.done = cb.checked; m.at = tick(m.at); commit(); });
        const lab = h("input", { class: "mv-mlabel", id: "mvl_" + m.id, value: m.label, "aria-label": "돈 이름", maxlength: "60" });
        lab.addEventListener("change", () => { const v = lab.value.trim(); if (!v) { lab.value = m.label; return; } m.label = v.slice(0, 60); m.at = tick(m.at); commit(); });
        const amt = h("input", { class: "mv-mamt num", id: "mva_" + m.id, value: String(m.amt), inputmode: "decimal", "aria-label": m.label + " 금액(만 원)" });
        amt.addEventListener("change", () => { const n = Number(String(amt.value).replace(/[, 만원]/g, "").replace("−", "-")); if (!Number.isFinite(n)) { amt.value = String(m.amt); toast("숫자로 적어 주세요(나가는 돈은 −)"); return; } m.amt = n; m.at = tick(m.at); commit(); });
        const del = h("button", { type: "button", class: "btn ghost mv-x", "aria-label": m.label + " 지우기", text: "✕", onclick: () => { m.del = true; m.at = tick(m.at); commit("지웠어요"); } });
        list.append(h("li", { class: "mv-m" + (m.done ? " done" : "") + (m.amt < 0 ? " out" : " in") }, [cb, lab, amt, h("span", { class: "mv-run num small muted", text: "→ " + (run < 0 ? "−" : "") + won(run) }), del]));
      });
      if (!live.length) list.append(h("li", { class: "small muted", text: "아직 적은 돈이 없어요." }));
      box.append(list);
      if (live.length) box.append(h("div", { class: "mv-left" + (run < 0 ? " neg" : "") }, [h("span", { text: "남는 돈" }), h("b", { class: "num", text: (run < 0 ? "−" : "") + won(run) + "만 원" })]));
      const lb = h("input", { id: "mvMl", placeholder: "예: 이사 비용", maxlength: "60" });
      const am = h("input", { id: "mvMa", placeholder: "금액(만 원)", inputmode: "decimal" });
      const dir = h("select", { id: "mvMd", "aria-label": "들어오는 돈인지 나가는 돈인지" }, [h("option", { value: "-1", text: "나감" }), h("option", { value: "1", text: "들어옴" })]);
      const add = () => { const l = lb.value.trim(); if (!l) { lb.focus(); return; } const n = Math.abs(Number(String(am.value).replace(/[, 만원−-]/g, ""))); if (!Number.isFinite(n)) { am.focus(); return; } D.money.push({ id: rid("d"), label: l.slice(0, 60), amt: n * Number(dir.value), done: false, del: false, at: now() }); commit("적었어요"); };
      [lb, am].forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }));
      box.append(h("div", { class: "mv-add" }, [h("label", { class: "small muted", for: "mvMl", text: "돈 더하기" }), h("div", { class: "mv-addrow" }, [lb, am, dir, h("button", { type: "button", class: "btn primary", text: "더하기", onclick: add })])]));
      return box;
    }
    // 계약·메모(개인판): 특약·유의사항 같은 긴 글 + 계약서·집 구조 사진
    function notes(d) {
      const A = opt.assets || null;
      const box = h("section", { class: "mv-notes" }, [h("h3", { text: "계약·메모" }), h("p", { class: "hint", text: A ? "특약·유의사항처럼 긴 글과 계약서·집 사진을 같이 둬요. 둘 다 고칠 수 있어요." : "특약·유의사항처럼 긴 글을 적어 둬요." })]);
      d.notes.filter((n) => !n.del).forEach((n) => {
        const ta = h("textarea", { class: "mv-ntext", id: "mvn_" + n.id, rows: String(Math.min(14, Math.max(3, (n.text.match(/\n/g) || []).length + 2))), "aria-label": n.title + " 글", maxlength: "4000" });
        ta.value = n.text;
        ta.addEventListener("change", () => { n.text = ta.value.slice(0, 4000); n.at = tick(n.at); commit("저장했어요"); });
        const tt = h("input", { class: "mv-ntitle", id: "mvt_" + n.id, value: n.title, "aria-label": "메모 제목", maxlength: "60" });
        tt.addEventListener("change", () => { const v = tt.value.trim(); if (!v) { tt.value = n.title; return; } n.title = v.slice(0, 60); n.at = tick(n.at); commit(); });
        const del = h("button", { type: "button", class: "btn ghost mv-x", "aria-label": n.title + " 메모 지우기", text: "✕", onclick: () => { n.del = true; n.at = tick(n.at); commit("메모를 지웠어요 · «지운 메모 다시 보기»로 되살릴 수 있어요"); } });
        const pics = h("div", { class: "mv-pics" });
        if (A) {
          const imgs = n.photos.filter((p) => !/^(gdp|lpp):/.test(p));
          n.photos.forEach((p) => {
            const pdf = /^(gdp|lpp):/.test(p);
            const src = A.src(p);
            const open = pdf ? h("a", { class: "mv-pic pdf", href: src, target: "_blank", rel: "noopener", text: "PDF" })
              : h("button", { type: "button", class: "mv-pic", "aria-label": n.title + " 사진 크게 보기", onclick: () => { if (opt.open) opt.open(imgs.map((q) => ({ src: A.src(q) })), imgs.indexOf(p), n.title); else window.open(src, "_blank", "noopener"); } }, [h("img", { src: src, alt: "", loading: "lazy" })]);
            const rm = h("button", { type: "button", class: "mv-picx", "aria-label": "이 사진 빼기", text: "✕", onclick: async () => { n.photos = n.photos.filter((q) => q !== p); n.at = tick(n.at); if (!(await commit("사진을 뺐어요"))) return; try { await A.delete(p); } catch (e) { /* 이미 없으면 넘어감 */ } } });
            pics.append(h("div", { class: "mv-picw" }, [open, rm]));
          });
          const fi = h("input", { type: "file", accept: "image/*,application/pdf", multiple: true, hidden: true, id: "mvf_" + n.id });
          fi.addEventListener("change", async () => {
            const files = [...fi.files]; fi.value = ""; if (!files.length) return;
            busy++; let ok = 0;
            for (let i = 0; i < files.length; i++) {
              toast("사진 올리는 중 " + (i + 1) + "/" + files.length);
              try { const r = await A.upload(files[i]); const cur = get().notes.find((x) => x.id === n.id); if (cur) { cur.photos.push(r.id); cur.at = tick(cur.at); } ok++; }
              catch (e) { toast("사진을 올리지 못했어요: " + (e && e.message || "오류")); }
            }
            busy--;
            if (ok) await commit("사진 " + ok + "장을 올렸어요"); else render();
          });
          pics.append(fi, h("label", { class: "btn ghost mv-picadd", for: "mvf_" + n.id, text: "+ 사진·PDF" }));
        }
        box.append(h("div", { class: "mv-note" }, [h("div", { class: "mv-nhead" }, [tt, del]), ta, pics]));
      });
      const nt = h("input", { id: "mvNt", placeholder: "예: 집 구조·치수", maxlength: "60" });
      const add = () => { const v = nt.value.trim(); if (!v) { nt.focus(); return; } D.notes.push({ id: rid("n"), title: v.slice(0, 60), text: "", photos: [], del: false, at: now() }); commit("메모를 만들었어요"); };
      nt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      box.append(h("div", { class: "mv-add" }, [h("label", { class: "small muted", for: "mvNt", text: "메모 더하기" }), h("div", { class: "mv-addrow" }, [nt, h("button", { type: "button", class: "btn primary", text: "더하기", onclick: add })])]));
      // 지운 메모는 표시만 남아 있어(사진 파일도 드라이브에 그대로) 되살릴 수 있다
      const gone = d.notes.filter((n) => n.del);
      if (gone.length) box.append(h("button", { type: "button", class: "btn ghost small", text: "지운 메모 다시 보기(" + gone.length + ")", onclick: () => { gone.forEach((n) => { n.del = false; n.at = tick(n.at); }); commit("다시 보이게 했어요"); } }));
      return box;
    }
    function render() {
      if (!root) return;
      D = null; stale = false; const d = get();
      const y = window.scrollY, act = document.activeElement && document.activeElement.id;
      const wrap = (sec, key) => { if (!sec) return null; const h3 = sec.querySelector("h3"); const kids = [...sec.childNodes].filter((n) => n !== h3); return foldBox("s-" + key, true, sec.className + " mv-sec", [h3], kids, key === "tasks" && editing); };
      root.replaceChildren(head(d), wrap(tasks(d), "tasks"), opt.extras ? wrap(money(d), "money") : null, wrap(quotes(d), "quotes"), opt.extras ? wrap(notes(d), "notes") : null);
      if (act && act.indexOf("mv") === 0) { const n = root.querySelector("#" + act); if (n) n.focus({ preventScroll: true }); }
      window.scrollTo(0, y);
      try { document.dispatchEvent(new CustomEvent("hh-move-render")); } catch (e) { /* 앱이 큰 탭 글씨(D-day)를 다시 씀 */ }
    }
    // 바깥(30초 다시 읽기)에서 부를 때: 글을 쓰는 중이거나 사진을 올리는 중이면 건너뛴다(쓰던 글이 지워지지 않게)
    // 건너뛰면 stale로 적어 두고, 칸에서 나가거나 올리기가 끝나면 그때 그린다(안 그러면 다음 읽기에 차이가 없어 영영 안 그려짐, 검토 2026-11-20)
    let stale = false;
    const typing = () => { const a = document.activeElement; return !!(a && root && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"); };
    function refresh() {
      if (!root || root.hidden) return false;
      if (busy || typing()) { stale = true; return false; }
      render(); return true;
    }
    function later() { setTimeout(() => { if (stale && root && !root.hidden && !busy && !typing()) render(); }, 0); }
    let bound = null;
    function mount(el) {
      root = el; style();
      if (bound !== el) { bound = el; el.addEventListener("focusout", later); }
      render();
    }
    // 큰 탭 글씨용: 이사까지 남은 날(날짜 없으면 null)·할 일 수
    function info() { const d = normalize(opt.load ? opt.load() : null, TPL), t0 = dateUTC(d.date), live = d.tasks.filter((x) => !x.del); return { left: isNaN(t0) ? null : Math.round((t0 - todayUTC()) / DAY), total: live.length, done: live.filter((x) => x.done).length }; }
    return { mount: mount, render: render, refresh: refresh, info: info, normalize: (x) => normalize(x, TPL), merge: (a, b) => merge(a, b, TPL), blank: () => blank(TPL) };
  }
  // 모양: 앱의 :root 토큰(--space-*·색)을 그대로 쓴다. 할 일을 끝내면 줄이 옅어지고 글자에 줄이 그어진다(짧은 전환)
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const css = [
      ".mv-head{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:var(--space-3);display:grid;gap:var(--space-2)}",
      ".mv-dday{display:flex;align-items:baseline;gap:var(--space-2);flex-wrap:wrap}.mv-dday b{font-size:1.6rem;color:var(--accent)}",
      ".mv-bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden}.mv-bar i{display:block;height:100%;background:var(--accent);transition:width .3s ease-out}",
      ".mv-head .field{max-width:240px}",
      ".mv-tasks,.mv-quotes,.mv-money,.mv-notes{margin-top:var(--space-4)}.mv-tasks h3,.mv-quotes h3,.mv-money h3,.mv-notes h3{margin:0 0 var(--space-2);font-size:1.05rem}",
      ".mv-group{border:1px solid var(--line);border-radius:12px;background:var(--surface);margin-bottom:var(--space-2);overflow:hidden}",
      ".mv-group.now{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}",
      ".mv-group>summary{list-style:none;cursor:pointer;background:var(--bg);border-bottom:1px solid var(--line)}.mv-group:not([open])>summary{border-bottom:0}.mv-group>summary::-webkit-details-marker,.mv-sec>summary::-webkit-details-marker{display:none}",
      ".mv-gh{display:flex;gap:var(--space-2);align-items:baseline;padding:var(--space-2) var(--space-3)}.mv-gh::before,.mv-sec>summary h3::before{content:\"▸\";display:inline-block;color:var(--sub);transition:transform .2s ease-out}.mv-group[open] .mv-gh::before,.mv-sec[open]>summary h3::before{transform:rotate(90deg)}",
      ".mv-sec>summary{list-style:none;cursor:pointer}.mv-sec>summary h3{display:flex;gap:var(--space-2);align-items:center}.mv-sec>summary:hover h3,.mv-group>summary:hover b{color:var(--accent)}",
      ".mv-state.done{color:var(--sub);font-weight:500}",
      ".mv-ed{grid-column:4;grid-row:2;padding:var(--space-1) var(--space-2);color:var(--sub)}.mv-task .mv-x,.mv-task .mv-ed{border-color:transparent;background:transparent}.mv-task .mv-x:hover,.mv-task .mv-ed:hover{border-color:var(--line)}",
      ".mv-editing{display:block}.mv-edit{display:grid;gap:var(--space-2)}.mv-edit>input{border:1px solid var(--accent);border-radius:8px;padding:var(--space-2);background:var(--bg);font:inherit;font-weight:600}",
      ".mv-state{font-size:.75rem;font-weight:600;color:var(--accent);margin-left:auto}.mv-state.late{color:var(--warn)}",
      ".mv-group ul{list-style:none;margin:0;padding:0}",
      ".mv-task{display:grid;grid-template-columns:auto 1fr auto auto;gap:var(--space-1) var(--space-2);align-items:center;padding:var(--space-2) var(--space-3);border-top:1px solid var(--line);transition:opacity .2s}",
      ".mv-task:first-child{border-top:0}.mv-task input[type=checkbox],.mv-m input[type=checkbox]{width:20px;height:20px;accent-color:var(--accent)}",
      ".mv-task.done{opacity:.55}.mv-task.done .mv-title{text-decoration:line-through}",
      ".mv-title{cursor:pointer}.mv-mine{font-size:.7rem;color:var(--sub);border:1px solid var(--line);border-radius:4px;padding:0 var(--space-1);margin-left:var(--space-1)}",
      ".mv-by{display:inline-block;font-size:.7rem;color:var(--sub);margin-left:var(--space-1)}",
      ".mv-memo{grid-column:2/4;border:1px solid var(--line);border-radius:8px;padding:var(--space-1) var(--space-2);background:var(--bg);font:inherit;font-size:.85rem;min-width:0}",
      ".mv-memo-add{grid-column:2/4;justify-self:start;padding:0 var(--space-1);font-size:.75rem;color:var(--sub);border:0}",
      ".mv-x{grid-row:1;grid-column:4;padding:var(--space-1) var(--space-2);color:var(--sub)}",
      ".mv-add{margin-top:var(--space-2);display:grid;gap:var(--space-1)}.mv-addrow{display:flex;gap:var(--space-2);flex-wrap:wrap}",
      ".mv-addrow input,.mv-addrow select{border:1px solid var(--line);border-radius:8px;padding:var(--space-2);background:var(--bg);font:inherit;min-width:0;flex:1 1 140px}",
      ".mv-addrow select{flex:0 0 auto}.mv-addrow .btn{flex:0 0 auto}",
      ".mv-qlist{display:grid;gap:var(--space-2)}",
      ".mv-q{display:grid;grid-template-columns:auto 1fr auto auto;gap:var(--space-1) var(--space-2);align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:var(--space-2) var(--space-3)}",
      ".mv-q.pick{border-color:var(--accent)}.mv-qn{display:flex;flex-direction:column}.mv-qp{text-align:right}.mv-qp b{font-size:1.1rem}",
      ".mv-low{display:block;font-size:.7rem;color:var(--ok);font-weight:600}",
      ".mv-q .mv-memo{grid-column:2/5}.mv-q .mv-x{grid-column:4;grid-row:1}.mv-q .mv-qp{grid-column:3}",
      ".mv-star{font-size:1.2rem;padding:var(--space-1) var(--space-2);color:var(--sub)}.mv-star.on{color:var(--accent)}",
      /* 돈 흐름: 체크 · 이름 · 금액 · 누적 · 지우기. 폰에선 누적이 아래 줄로 */
      ".mv-mlist{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}",
      ".mv-m{display:grid;grid-template-columns:auto 1fr 112px 104px auto;gap:var(--space-1) var(--space-2);align-items:center;padding:var(--space-2) var(--space-3);border-top:1px solid var(--line)}",
      ".mv-m:first-child{border-top:0}.mv-mlist>li.small{padding:var(--space-2) var(--space-3)}",
      ".mv-m input.mv-mlabel,.mv-m input.mv-mamt{border:1px solid transparent;border-radius:8px;padding:var(--space-1) var(--space-2);background:transparent;font:inherit;min-width:0}",
      ".mv-m input.mv-mlabel:hover,.mv-m input.mv-mamt:hover,.mv-m input:focus{border-color:var(--line);background:var(--bg)}",
      ".mv-m .mv-mamt{text-align:right;font-weight:600}.mv-m.in .mv-mamt{color:var(--ok)}.mv-m.done{opacity:.6}",
      ".mv-run{text-align:right}.mv-m .mv-x{grid-row:auto;grid-column:auto}",
      ".mv-left{display:flex;justify-content:space-between;align-items:baseline;margin-top:var(--space-2);padding:var(--space-2) var(--space-3);border-radius:12px;background:var(--bg);border:1px solid var(--accent)}",
      ".mv-left b{font-size:1.2rem;color:var(--accent)}.mv-left.neg{border-color:var(--warn)}.mv-left.neg b{color:var(--warn)}",
      "@media (max-width:560px){.mv-m{grid-template-columns:auto 112px 1fr auto}.mv-m .mv-mlabel{grid-column:2/4;grid-row:1}.mv-m .mv-x{grid-column:4;grid-row:1}.mv-m .mv-mamt{grid-column:2;grid-row:2;text-align:left}.mv-m .mv-run{grid-column:3/5;grid-row:2}}",
      /* 계약·메모 */
      ".mv-note{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:var(--space-2) var(--space-3);margin-bottom:var(--space-2);display:grid;gap:var(--space-2)}",
      ".mv-nhead{display:flex;gap:var(--space-2);align-items:center}.mv-ntitle{flex:1;min-width:0;border:1px solid transparent;border-radius:8px;padding:var(--space-1) var(--space-2);background:transparent;font:inherit;font-weight:700}",
      ".mv-ntitle:hover,.mv-ntitle:focus{border-color:var(--line);background:var(--bg)}",
      ".mv-ntext{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:var(--space-2);background:var(--bg);font:inherit;font-size:.9rem;line-height:1.55;resize:vertical}",
      ".mv-pics{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center}",
      ".mv-picw{position:relative}.mv-pic{display:grid;place-items:center;width:72px;height:72px;border:1px solid var(--line);border-radius:8px;overflow:hidden;padding:0;background:var(--bg);cursor:zoom-in;color:var(--sub);font-weight:700;text-decoration:none}",
      ".mv-pic img{width:100%;height:100%;object-fit:cover}.mv-picx{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--sub);font-size:.7rem;cursor:pointer;padding:0}",
      ".mv-picadd{font-size:.85rem}",
      "@media (prefers-reduced-motion: reduce){.mv-bar i,.mv-task,.mv-gh::before,.mv-sec>summary h3::before{transition:none}}"
    ].join("");
    const s = document.createElement("style"); s.textContent = css; document.head.append(s);
  }
  window.HHMove = { create: create, normalize: normalize, merge: merge, blank: blank, TEMPLATE: TEMPLATE, GROUPS: GROUPS };
})();

/* 이사 탭 부품(2026-11-20) — 범용판(/my/)이 먼저 쓰고, 개인판도 저장 방식만 바꿔 다시 쓰도록 따로 둔 파일.
 * 출처: 효니 말 «응 그렇게 해주고»(이사 체크리스트 틀을 범용판에, 원래 세션이 전달).
 *
 * 쓰는 법:  window.HH_MOVE = HHMove.create({ load, save, toast })
 *   load()      → 저장된 MoveData(없으면 null). 부품이 고친 뒤에는 save(data)를 부른다(통째로 넘김).
 *   save(data)  → 저장(Promise여도 됨). 실패하면 throw → 토스트로 알림.
 *   toast(text) → 앱의 토스트(없으면 조용히).
 *   반환: { mount(el) 그 칸에 그린다, render() 다시 그린다, normalize(data) 받은 데이터 거르기, merge(mine, theirs) 합치기, blank() 새 틀 }
 *
 * MoveData v1 (칸 이름을 개인판에서도 그대로 쓴다):
 *   { v: 1, date: "YYYY-MM-DD" 또는 "", dateAt: 이사 날을 바꾼 때(ISO),
 *     tasks:  [{ id, title, off: 이사 날 기준 날 수(-90 = D-90, 0 = 당일, 7 = 이사 뒤), done: bool, memo: "", custom: bool(내가 더한 일), del: bool(숨김·지움), at: 마지막으로 바꾼 때 }],
 *     quotes: [{ id, company, price: 만 원 숫자 또는 null, how: "방문"|"전화"|"앱", memo: "", pick: bool, del: bool, at }] }
 *   기본 할 일은 id가 «m-»로 시작해 기기마다 같다(합치기 때 같은 일로 묶임). 지운 것은 del 표시만 남긴다(합칠 때 되살아나지 않게).
 *   합치기: 할 일·견적은 id마다 at이 나중인 쪽, 이사 날은 dateAt이 나중인 쪽.
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
  const DAY = 86400000;
  const todayUTC = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const dateUTC = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const ymd = (t) => { const d = new Date(t); return (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일"; };
  const groupOf = (off) => { let g = GROUPS[0]; for (const x of GROUPS) if (off >= x[0]) g = x; return g; };

  function blank() {
    const t = now();
    return { v: 1, date: "", dateAt: t, tasks: TEMPLATE.map((x) => ({ id: x[0], title: x[2], off: x[1], done: false, memo: "", custom: false, del: false, at: t })), quotes: [] };
  }
  // 받은 데이터(파일·서버)를 거른다. 모양이 다른 칸은 버린다
  function normalize(d) {
    if (!d || typeof d !== "object") return blank();
    const s = (v, n) => String(v == null ? "" : v).slice(0, n);
    const out = { v: 1, date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") ? d.date : "", dateAt: s(d.dateAt, 40), tasks: [], quotes: [] };
    (Array.isArray(d.tasks) ? d.tasks : []).forEach((x) => {
      if (!x || !okId(x.id) || out.tasks.some((y) => y.id === x.id)) return;
      const off = Math.max(-365, Math.min(365, Math.round(Number(x.off) || 0)));
      out.tasks.push({ id: x.id, title: s(x.title, 120) || "할 일", off: off, done: !!x.done, memo: s(x.memo, 300), custom: !!x.custom, del: !!x.del, at: s(x.at, 40) });
    });
    // 새 기본 할 일이 생겼으면(부품을 고친 뒤) 빠진 것만 더한다
    TEMPLATE.forEach((x) => { if (!out.tasks.some((y) => y.id === x[0])) out.tasks.push({ id: x[0], title: x[2], off: x[1], done: false, memo: "", custom: false, del: false, at: "" }); });
    (Array.isArray(d.quotes) ? d.quotes : []).forEach((q) => {
      if (!q || !okId(q.id) || out.quotes.some((y) => y.id === q.id)) return;
      const p = Number(q.price);
      out.quotes.push({ id: q.id, company: s(q.company, 40) || "업체", price: Number.isFinite(p) && p >= 0 ? Math.round(p * 10) / 10 : null, how: ["방문", "전화", "앱"].includes(q.how) ? q.how : "방문", memo: s(q.memo, 300), pick: !!q.pick, del: !!q.del, at: s(q.at, 40) });
    });
    return out;
  }
  function merge(mine, theirs) {
    const a = normalize(mine), b = normalize(theirs);
    const pick = (x, y) => tm(y.at) > tm(x.at) ? y : x;
    const join = (xs, ys) => { const m = new Map(xs.map((x) => [x.id, x])); ys.forEach((y) => m.set(y.id, m.has(y.id) ? pick(m.get(y.id), y) : y)); return [...m.values()]; };
    const out = { v: 1, date: a.date, dateAt: a.dateAt, tasks: join(a.tasks, b.tasks), quotes: join(a.quotes, b.quotes) };
    if (tm(b.dateAt) > tm(a.dateAt)) { out.date = b.date; out.dateAt = b.dateAt; }
    return out;
  }

  function create(opt) {
    opt = opt || {};
    let D = null, root = null;
    const toast = (t) => { try { if (opt.toast) opt.toast(t); } catch (e) { /* 토스트 없음 */ } };
    const get = () => { if (!D) D = normalize(opt.load ? opt.load() : null); return D; };
    async function commit(msg) {
      try { await (opt.save && opt.save(JSON.parse(JSON.stringify(D)))); if (msg) toast(msg); }
      catch (e) { toast("저장하지 못했어요: " + (e && e.message || "오류")); }
      render();
    }
    function h(tag, attrs, kids) { const e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach((k) => { const v = attrs[k]; if (v == null || v === false) return; if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }); (kids || []).forEach((c) => c != null && c !== false && e.append(c)); return e; }

    function head(d) {
      const t0 = dateUTC(d.date), left = isNaN(t0) ? null : Math.round((t0 - todayUTC()) / DAY);
      const inp = h("input", { type: "date", id: "mvDate", value: d.date || "" });
      inp.addEventListener("change", () => { D.date = inp.value || ""; D.dateAt = now(); commit(D.date ? "이사 날을 정했어요" : "이사 날을 지웠어요"); });
      const live = d.tasks.filter((x) => !x.del), done = live.filter((x) => x.done).length;
      const big = left == null ? "이사 날을 넣어 주세요" : left > 0 ? "D-" + left : left === 0 ? "오늘 이사!" : "이사 " + (-left) + "일 지남";
      return h("section", { class: "mv-head" }, [
        h("div", { class: "mv-dday" }, [h("b", { class: "num", text: big }), h("span", { class: "small muted", text: "할 일 " + live.length + "개 중 " + done + "개 끝" })]),
        h("div", { class: "mv-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(live.length || 1), "aria-valuenow": String(done), "aria-label": "끝낸 할 일" }, [h("i", { style: "width:" + (live.length ? Math.round(done / live.length * 100) : 0) + "%" })]),
        h("label", { class: "field", for: "mvDate" }, [h("span", { class: "small muted", text: "이사 날" }), inp]),
        h("p", { class: "hint", text: "이사 날을 넣으면 D-90·D-60처럼 날짜를 거꾸로 세서 할 일마다 날짜가 붙어요. 순서·날짜는 흔히 하는 틀이니 내 사정에 맞게 고치거나 지워 주세요." })
      ]);
    }
    function taskRow(x, t0) {
      const cb = h("input", { type: "checkbox", id: "mv_" + x.id, checked: x.done });
      cb.addEventListener("change", () => { x.done = cb.checked; x.at = now(); commit(); });
      const memoIn = h("input", { class: "mv-memo", value: x.memo || "", placeholder: "메모", "aria-label": x.title + " 메모" });
      memoIn.addEventListener("change", () => { x.memo = memoIn.value.trim().slice(0, 300); x.at = now(); commit(); });
      // 메모가 없으면 칸 대신 작은 «메모» 단추(할 일이 많아 칸이 늘 보이면 빽빽함). 누르면 칸이 열린다
      const memo = x.memo ? memoIn : h("button", { type: "button", class: "btn ghost mv-memo-add", text: "+ 메모", "aria-label": x.title + " 메모 쓰기", onclick: (e) => { e.currentTarget.replaceWith(memoIn); memoIn.focus(); } });
      const del = h("button", { type: "button", class: "btn ghost mv-x", "aria-label": x.title + " 지우기", title: x.custom ? "지우기" : "숨기기", text: "✕", onclick: () => { x.del = true; x.at = now(); commit(x.custom ? "지웠어요" : "숨겼어요 · «숨긴 일 다시 보기»로 되살릴 수 있어요"); } });
      const when = isNaN(t0) ? null : h("span", { class: "small muted num", text: ymd(t0 + x.off * DAY) });
      return h("li", { class: "mv-task" + (x.done ? " done" : "") }, [cb, h("label", { for: "mv_" + x.id, class: "mv-title" }, [document.createTextNode(x.title), x.custom ? h("span", { class: "mv-mine", text: "내 할 일" }) : null]), when, memo, del]);
    }
    function tasks(d) {
      const t0 = dateUTC(d.date), today = todayUTC();
      const box = h("section", { class: "mv-tasks" }, [h("h3", { text: "할 일" })]);
      GROUPS.forEach((g, gi) => {
        const nextOff = gi + 1 < GROUPS.length ? GROUPS[gi + 1][0] : Infinity;
        const list = d.tasks.filter((x) => !x.del && x.off >= g[0] && x.off < nextOff).sort((a, b) => a.off - b.off || (a.custom - b.custom));
        if (!list.length) return;
        const gStart = t0 + g[0] * DAY, gEnd = t0 + Math.min(nextOff, 366) * DAY;
        const state = isNaN(t0) ? "" : today >= gEnd ? "지난 때" : today >= gStart ? "지금" : "";
        const left = list.filter((x) => !x.done).length;
        box.append(h("div", { class: "mv-group" + (state === "지금" ? " now" : "") }, [
          h("div", { class: "mv-gh" }, [h("b", { text: g[1] }), isNaN(t0) ? null : h("span", { class: "small muted num", text: ymd(gStart) + (g[0] === 0 ? "" : " 즈음") }), state ? h("span", { class: "mv-state" + (state === "지난 때" && left ? " late" : ""), text: state === "지난 때" && left ? "남은 일 " + left : state }) : null]),
          h("ul", null, list.map((x) => taskRow(x, t0)))
        ]));
      });
      // 내 할 일 더하기
      const title = h("input", { id: "mvNewT", placeholder: "예: 에어컨 이전 설치 예약", maxlength: "120" });
      const sel = h("select", { id: "mvNewG", "aria-label": "언제" }, GROUPS.map((g) => h("option", { value: String(g[0]), text: g[1] })));
      sel.value = "-30";
      const add = () => { const v = title.value.trim(); if (!v) { title.focus(); return; } D.tasks.push({ id: rid("t"), title: v.slice(0, 120), off: Number(sel.value), done: false, memo: "", custom: true, del: false, at: now() }); commit("할 일을 더했어요"); setTimeout(() => { const n = root && root.querySelector("#mvNewT"); if (n) n.focus(); }, 0); };
      title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      box.append(h("div", { class: "mv-add" }, [h("label", { class: "small muted", for: "mvNewT", text: "내 할 일 더하기" }), h("div", { class: "mv-addrow" }, [title, sel, h("button", { type: "button", class: "btn primary", text: "더하기", onclick: add })])]));
      const hidden = d.tasks.filter((x) => x.del && !x.custom);
      if (hidden.length) box.append(h("button", { type: "button", class: "btn ghost small", text: "숨긴 기본 할 일 다시 보기(" + hidden.length + ")", onclick: () => { hidden.forEach((x) => { x.del = false; x.at = now(); }); commit("다시 보이게 했어요"); } }));
      return box;
    }
    function quotes(d) {
      const live = d.quotes.filter((q) => !q.del);
      const prices = live.map((q) => q.price).filter((p) => p != null);
      const low = prices.length > 1 ? Math.min(...prices) : null;
      const box = h("section", { class: "mv-quotes" }, [h("h3", { text: "이삿짐센터 견적 비교" }), h("p", { class: "hint", text: "견적을 받을 때마다 적어 두고, 고른 곳에 ★를 눌러요. 금액은 만 원 단위." })]);
      const list = h("div", { class: "mv-qlist" });
      live.sort((a, b) => (b.pick - a.pick) || ((a.price == null) - (b.price == null)) || (a.price - b.price)).forEach((q) => {
        const star = h("button", { type: "button", class: "btn ghost mv-star" + (q.pick ? " on" : ""), "aria-pressed": String(q.pick), "aria-label": q.company + " 고르기", text: q.pick ? "★" : "☆", onclick: () => { const on = !q.pick; live.forEach((o) => { if (o.pick) { o.pick = false; o.at = now(); } }); q.pick = on; q.at = now(); commit(on ? q.company + "(으)로 골랐어요" : ""); } });
        const memo = h("input", { class: "mv-memo", value: q.memo || "", placeholder: "메모(포장·사다리차 등)", "aria-label": q.company + " 메모" });
        memo.addEventListener("change", () => { q.memo = memo.value.trim().slice(0, 300); q.at = now(); commit(); });
        const del = h("button", { type: "button", class: "btn ghost mv-x", "aria-label": q.company + " 지우기", text: "✕", onclick: () => { q.del = true; q.at = now(); commit("지웠어요"); } });
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
    function render() {
      if (!root) return;
      D = null; const d = get();
      const y = window.scrollY, act = document.activeElement && document.activeElement.id;
      root.replaceChildren(head(d), tasks(d), quotes(d));
      if (act && act.indexOf("mv") === 0) { const n = root.querySelector("#" + act); if (n) n.focus({ preventScroll: true }); }
      window.scrollTo(0, y);
    }
    function mount(el) { root = el; style(); render(); }
    return { mount: mount, render: render, normalize: normalize, merge: merge, blank: blank };
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
      ".mv-tasks,.mv-quotes{margin-top:var(--space-4)}.mv-tasks h3,.mv-quotes h3{margin:0 0 var(--space-2);font-size:1.05rem}",
      ".mv-group{border:1px solid var(--line);border-radius:12px;background:var(--surface);margin-bottom:var(--space-2);overflow:hidden}",
      ".mv-group.now{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}",
      ".mv-gh{display:flex;gap:var(--space-2);align-items:baseline;padding:var(--space-2) var(--space-3);background:var(--bg);border-bottom:1px solid var(--line)}",
      ".mv-state{font-size:.75rem;font-weight:600;color:var(--accent);margin-left:auto}.mv-state.late{color:var(--warn)}",
      ".mv-group ul{list-style:none;margin:0;padding:0}",
      ".mv-task{display:grid;grid-template-columns:auto 1fr auto auto;gap:var(--space-1) var(--space-2);align-items:center;padding:var(--space-2) var(--space-3);border-top:1px solid var(--line);transition:opacity .2s}",
      ".mv-task:first-child{border-top:0}.mv-task input[type=checkbox]{width:20px;height:20px;accent-color:var(--accent)}",
      ".mv-task.done{opacity:.55}.mv-task.done .mv-title{text-decoration:line-through}",
      ".mv-title{cursor:pointer}.mv-mine{font-size:.7rem;color:var(--sub);border:1px solid var(--line);border-radius:4px;padding:0 var(--space-1);margin-left:var(--space-1)}",
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
      "@media (prefers-reduced-motion: reduce){.mv-bar i,.mv-task{transition:none}}"
    ].join("");
    const s = document.createElement("style"); s.textContent = css; document.head.append(s);
  }
  window.HHMove = { create: create, normalize: normalize, merge: merge, blank: blank, TEMPLATE: TEMPLATE, GROUPS: GROUPS };
})();

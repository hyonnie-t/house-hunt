/* 집 비교판 범용판(/my/) 저장층 — 2026-11-20
 * 서버 없이 이 기기 브라우저에만 저장한다. 앱(index.html에서 만든 my/index.html)은 원래 앱스 스크립트에 보내던 요청을
 * window.HH_LOCAL.call(action, extra)로 보내고, 여기서 같은 모양의 답을 돌려준다. 그래서 화면 코드는 개인판과 같다.
 * - 글 데이터(집·조건·의견·중개사·위치): localStorage «hhmy_data» 하나
 * - 사진·PDF: IndexedDB «hhmy_photos»(사진은 긴 쪽 1600px JPEG로 줄여 저장). 집에는 «lp:id»(그림)·«lpp:id»(PDF)만 적는다
 * - 위치: 주소를 OpenStreetMap 노미나팀 검색에 보내 좌표를 얻는다(1초에 한 번, 이 기기에 저장). 주소 글자 말고는 보내지 않는다
 * - 이사 탭: ../move.js(HHMove)를 D.move에 저장한다. 백업 파일에도 들어가고, 합치기는 HHMove.merge(할 일·견적마다 나중에 고친 쪽)
 * - 둘이 같이 쓰기: «백업» 창에서 파일로 내보내 상대에게 보내고, 상대는 «가져오기 → 합치기»(집마다 나중에 고친 쪽이 이김)
 */
(function () {
  "use strict";
  const DATA_KEY = "hhmy_data", PHOTO_DB = "hhmy_photos", NOTE_KEY = "hhmy_intro";
  const V = 1;
  const nowIso = () => new Date().toISOString();
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const defaultCond = { minArea: 33, minRooms: 2, selfFunds: 5000, maxDeposit: 30000, monthlyTarget: 100, rate: 4, moveBy: "", near: "" };

  /* ---------- 예시 데이터(지어낸 집) ----------
   * 기준 장소는 서울시청 근처 좌표를 빌려 쓰고, 집 주소는 «예시동»처럼 없는 이름이라 위치 검색을 하지 않도록 좌표를 미리 넣는다. */
  function sample() {
    const t = Date.now(), at = (h) => new Date(t - h * 3600000).toISOString();
    const items = [
      { id: "ex-1", name: "[예시] 햇살빌라 3층", alias: "햇살집", kind: "매물", deal: "전세", station: "예시역", walkMin: 6, address: "예시구 예시동 12-3", area: 42.5, rooms: 2, baths: 1, deposit: 26000, rent: 0, mgmt: 8, parking: "가능", parkingFee: 0, moveIn: "", status: "후보", priority: "최우선", rank: 1, agent: "예시공인중개사", memo: "남향이라 밝음. 싱크대가 낡았음.", images: [], source: "예시", createdAt: at(50), updatedAt: at(5) },
      { id: "ex-2", name: "[예시] 숲속맨션 502호", alias: "숲 앞", kind: "매물", deal: "반전세", station: "예시역", walkMin: 12, address: "예시구 초록동 45", area: 49.6, rooms: 3, baths: 1, deposit: 15000, rent: 40, mgmt: 12, parking: "불가", status: "후보", priority: "높음", rank: 2, agent: "초록부동산", memo: "넓은데 역에서 멀다.", images: [], source: "예시", createdAt: at(40), updatedAt: at(30) },
      { id: "ex-3", name: "[예시] 행복주택 청년·신혼", kind: "공고", deal: "공공임대", station: "예시역", walkMin: 9, address: "예시구 공고동 7", area: 36, rooms: 2, deposit: 9000, rent: 22, mgmt: 6, parking: "가능", deadline: "", status: "신청함", priority: "보통", memo: "모집 공고 예시. 신청 마감을 칸에 적어 두면 «마감 빠른 순»으로 볼 수 있어요.", images: [], source: "예시", createdAt: at(80), updatedAt: at(70) },
      { id: "ex-4", name: "[예시] 오르막원룸 2층", kind: "매물", deal: "월세", station: "예시역", walkMin: 15, address: "예시구 언덕동 99", area: 26.4, rooms: 1, deposit: 1000, rent: 65, mgmt: 7, parking: "미확인", status: "탈락", priority: "낮음", memo: "방이 하나라 탈락.", images: [], source: "예시", createdAt: at(90), updatedAt: at(60) }
    ];
    const ref = { name: "예시 회사", lat: 37.5663, lng: 126.9779, q: "정확", addr: "" };
    const geo = { "ex-1": { lat: 37.5701, lng: 126.9832, q: "정확", addr: items[0].address }, "ex-2": { lat: 37.5742, lng: 126.9705, q: "정확", addr: items[1].address }, "ex-3": { lat: 37.5615, lng: 126.9868, q: "대략", addr: items[2].address }, "ex-4": { lat: 37.5589, lng: 126.9692, q: "정확", addr: items[3].address } };
    return {
      v: V, items: items, cond: Object.assign({}, defaultCond), ref: ref, geo: geo,
      comments: [{ id: "cex-1", itemId: "ex-1", who: "예시", text: "주차 가능하고 1순위로 보고 싶어요", at: at(4) }, { id: "cex-2", itemId: "ex-2", who: "예시", text: "넓다! 그런데 역까지 멀어요", at: at(28) }],
      agents: [{ id: "aex-1", name: "예시공인중개사", tel: "", rating: 4, note: "설명이 친절함(예시)", updatedAt: at(20) }]
    };
  }

  /* ---------- 글 데이터 ---------- */
  let D = null;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(DATA_KEY); } catch (e) { raw = null; }
    if (raw) { try { D = JSON.parse(raw); } catch (e) { D = null; } }
    if (!D || typeof D !== "object") { D = sample(); D.firstRun = true; persist(); }
    ["items", "comments", "agents"].forEach((k) => { if (!Array.isArray(D[k])) D[k] = []; });
    if (!D.geo || typeof D.geo !== "object") D.geo = {};
    if (!D.cond) D.cond = Object.assign({}, defaultCond);
  }
  function persist() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(D)); }
    catch (e) { const er = new Error("이 기기 저장 공간이 꽉 찼어요"); er.code = "quota_exceeded"; throw er; }
  }
  // 같은 기기의 다른 탭·홈 화면 앱이 그사이 저장했을 수 있으니, 고치기 전에 저장본을 다시 읽는다(검토 2026-11-20 B)
  function reload() {
    let raw = null; try { raw = localStorage.getItem(DATA_KEY); } catch (e) { return; }
    if (!raw) return;
    try { const x = JSON.parse(raw); if (x && typeof x === "object") { D = x; ["items", "comments", "agents"].forEach((k) => { if (!Array.isArray(D[k])) D[k] = []; }); if (!D.geo || typeof D.geo !== "object") D.geo = {}; if (!D.cond) D.cond = Object.assign({}, defaultCond); } } catch (e) { /* 깨진 저장본이면 메모리 것을 씀 */ }
  }
  // 고치고 저장하다 실패하면 메모리도 고치기 전으로 되돌린다(화면에 «저장된 척» 남지 않게, 검토 2026-11-20 D)
  function change(fn) {
    reload(); const before = JSON.stringify(D);
    try { const r = fn(); persist(); return r; } catch (e) { D = JSON.parse(before); throw e; }
  }
  const okId = (id) => /^[a-z0-9-]{1,80}$/.test(String(id || ""));

  /* ---------- 사진(IndexedDB) ---------- */
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise((ok, no) => {
      if (!window.indexedDB) { no(new Error("no_idb")); return; }
      const r = indexedDB.open(PHOTO_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("p");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await idb();
    return new Promise((ok, no) => { const t = db.transaction("p", mode); const s = t.objectStore("p"); let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => ok(out); t.onerror = () => no(t.error); t.onabort = () => no(t.error || new Error("abort")); });
  }
  const URLS = new Map();
  function urlFor(id, blob) { if (URLS.has(id)) return URLS.get(id); const u = URL.createObjectURL(blob); URLS.set(id, u); return u; }
  async function preload(ids) {
    for (const id of ids) {
      if (URLS.has(id)) continue;
      try { const b = await tx("readonly", (s) => s.get(id)); if (b) urlFor(id, b); } catch (e) { /* 사진 하나 못 읽어도 목록은 보인다 */ }
    }
  }
  const photoIds = () => { const out = new Set(); D.items.forEach((it) => (Array.isArray(it.images) ? it.images : []).forEach((p) => { if (/^lpp?:/.test(p)) out.add(p); })); return [...out]; };
  // 사진은 긴 쪽 1600px JPEG로 줄인다(이 기기 저장 공간과 백업 파일 크기 때문). 브라우저가 못 여는 형식(아이폰 밖의 heic 등)은 원본 그대로
  async function shrink(f) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) && !/^image\/hei[cf]$/.test(f.type)) return f;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
      return b && b.size < f.size ? b : f;
    } catch (e) { return f; }
  }
  const assets = {
    async upload(f) {
      const pdf = f.type === "application/pdf";
      const blob = pdf ? f : await shrink(f);
      const id = (pdf ? "lpp:" : "lp:") + rid("p");
      try { await tx("readwrite", (s) => s.put(blob, id)); }
      catch (e) { const er = new Error("사진 저장 실패"); er.code = /quota/i.test(String(e && e.name)) ? "quota_exceeded" : "사진 저장 실패"; throw er; }
      urlFor(id, blob);
      return { id: id, contentType: blob.type || f.type || "image/jpeg" };
    },
    async delete(id) {
      try { await tx("readwrite", (s) => s.delete(id)); } catch (e) { /* 이미 없으면 넘어감 */ }
      const u = URLS.get(id); if (u) { URL.revokeObjectURL(u); URLS.delete(id); }
    }
  };

  /* ---------- 위치(OpenStreetMap 노미나팀) ----------
   * 1초에 한 번만 묻는다(노미나팀 이용 규칙). 결과는 이 기기 D.geo에 주소 글자와 함께 둬서, 주소가 바뀔 때만 다시 묻는다. */
  const ROUGH = /^(city|town|village|suburb|quarter|neighbourhood|city_district|district|borough|county|state|province|region|hamlet|postcode|country)$/;
  let lastAsk = 0;
  async function geocode(q) {
    q = String(q || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (!q) return null;
    const wait = lastAsk + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAsk = Date.now();
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&addressdetails=1&accept-language=ko&q=" + encodeURIComponent(q));
    if (!r.ok) { const e = new Error("위치 검색 " + r.status); e.status = r.status; throw e; }
    const j = await r.json(); const x = j && j[0];
    if (!x) return { none: true };
    const a = x.address || {};
    return { lat: Number(x.lat), lng: Number(x.lon), q: ROUGH.test(x.addresstype || "") ? "대략" : "정확", name: x.name || "", building: (x.category === "building" || x.addresstype === "building") ? (x.name || "") : "", dong: a.quarter || a.suburb || a.neighbourhood || a.village || "" };
  }
  let geoBusy = false, geoErr = null;
  async function geoQueue() {
    if (geoBusy) return; geoBusy = true;
    try {
      for (;;) {
        const it = D.items.find((x) => !x.deleted && x.address && (!D.geo[x.id] || D.geo[x.id].addr !== x.address));
        if (!it) break;
        let g;
        try { g = await geocode(it.address); geoErr = null; }
        catch (e) { geoErr = e.status ? String(e.status) : "연결 안 됨"; break; }
        reload(); // 위치를 묻는 사이 다른 탭이 저장했을 수 있음
        D.geo[it.id] = g && !g.none ? { lat: g.lat, lng: g.lng, q: g.q, addr: it.address } : { lat: null, lng: null, q: "없음", addr: it.address };
        try { persist(); } catch (e) { break; }
        if (H) H.refresh();
      }
    } finally { geoBusy = false; }
  }

  /* ---------- 앱이 부르는 요청 ---------- */
  function listOut() {
    const items = D.items.filter((it) => !it.deleted).map(clone);
    const geo = {}; items.forEach((it) => { const g = D.geo[it.id]; if (g && g.addr === (it.address || "") && g.lat != null) geo[it.id] = { lat: g.lat, lng: g.lng, q: g.q }; else if (g && g.addr === (it.address || "")) geo[it.id] = { q: "없음" }; });
    return { ok: true, v: V, items: items, cond: clone(D.cond || defaultCond), comments: D.comments.filter((c) => !c.deleted).map(clone), agents: D.agents.filter((a) => !a.deleted).map(clone), geo: geo, ref: D.ref && D.ref.lat != null ? { name: D.ref.name, lat: D.ref.lat, lng: D.ref.lng } : null, geoError: geoErr };
  }
  async function call(action, x) {
    x = x || {};
    if (action === "list") { reload(); await preload(photoIds()); setTimeout(geoQueue, 0); return listOut(); }
    if (action === "addrLookup" || /^video/.test(action)) return callRead(action, x);
    let removed = [];
    const r = change(() => callWrite(action, x, (ids) => { removed = ids; }));
    removed.forEach((id) => assets.delete(id)); // 사진은 저장이 된 뒤에 지운다
    if (action === "save") setTimeout(geoQueue, 0);
    return r;
  }
  function callWrite(action, x, dropPhotos) {
    switch (action) {
      case "save": {
        const it = clone(x.item || {}); if (!okId(it.id)) throw new Error("집 id가 올바르지 않아요");
        const i = D.items.findIndex((o) => o.id === it.id), now = nowIso();
        it.updatedAt = now;
        if (i < 0) { it.createdAt = it.createdAt || now; D.items.push(it); }
        else { const old = D.items[i]; it.createdAt = old.createdAt || it.createdAt || now; it.source = old.source || it.source; D.items[i] = it; }
        delete it.deleted; delete it.videos; delete it.fill;
        return { ok: true, updatedAt: now };
      }
      case "remove": {
        const it = D.items.find((o) => o.id === x.id); if (!it) return { ok: true };
        // 줄은 지운 표시로 남긴다(다른 기기 백업을 합칠 때 지운 집이 되살아나지 않게). 사진은 이 기기에서 지운다
        dropPhotos((Array.isArray(it.images) ? it.images : []).filter((p) => /^lpp?:/.test(p)));
        Object.keys(it).forEach((k) => { if (!/^(id|name|createdAt)$/.test(k)) delete it[k]; });
        it.deleted = true; it.updatedAt = nowIso(); delete D.geo[it.id];
        return { ok: true };
      }
      case "saveConditions": D.cond = clone(x.cond || {}); return { ok: true };
      case "comment": {
        const who = String(x.who || "").slice(0, 20), text = String(x.text || "").slice(0, 500);
        if (!okId(x.itemId) || !who || !text) throw new Error("의견 내용이 올바르지 않아요");
        const c = { id: rid("c"), itemId: String(x.itemId), who: who, text: text, at: nowIso() };
        D.comments.push(c); return { ok: true, comment: clone(c) };
      }
      case "uncomment": { const c = D.comments.find((o) => o.id === x.id); if (c) { c.deleted = true; c.at = c.at || nowIso(); } return { ok: true }; }
      case "saveAgent": {
        const a = x.agent || {}, name = String(a.name || "").trim().slice(0, 40);
        if (!okId(a.id) || !name) throw new Error("중개사 이름이 올바르지 않아요");
        const row = { id: a.id, name: name, tel: String(a.tel || "").slice(0, 30), rating: Math.max(0, Math.min(5, Math.round(Number(a.rating) || 0))), note: String(a.note || "").slice(0, 1000), updatedAt: nowIso() };
        const i = D.agents.findIndex((o) => o.id === a.id); if (i < 0) D.agents.push(row); else D.agents[i] = row;
        return { ok: true };
      }
      case "removeAgent": { const a = D.agents.find((o) => o.id === x.id); if (a) { a.deleted = true; a.updatedAt = nowIso(); } return { ok: true }; }
    }
    throw new Error("모르는 요청: " + action);
  }
  async function callRead(action, x) {
    switch (action) {
      case "addrLookup": {
        const g = await geocode(String(x.address || "").slice(0, 200));
        if (!g || g.none) return { ok: true, found: false };
        return { ok: true, found: true, rough: g.q === "대략", road: "", jibun: "", building: g.building && !/^\d/.test(g.building) ? g.building : "", dong: g.dong }; // 가게 이름(같은 번지의 식당 등)은 건물 이름으로 넣지 않는다
      }
    }
    if (/^video/.test(action)) throw new Error("범용판은 동영상을 넣을 수 없어요");
    throw new Error("모르는 요청: " + action);
  }

  /* ---------- 백업(내보내기·가져오기) ---------- */
  const blobToData = (b) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(b); });
  const dataToBlob = async (u) => (await fetch(u)).blob();
  async function exportFile() {
    const photos = {};
    for (const id of photoIds()) { try { const b = await tx("readonly", (s) => s.get(id)); if (b) photos[id] = await blobToData(b); } catch (e) { /* 빠진 사진은 넘어감 */ } }
    const out = { app: "house-hunt-my", v: V, exportedAt: nowIso(), data: { items: D.items, cond: D.cond, ref: D.ref || null, geo: D.geo, comments: D.comments, agents: D.agents, move: D.move || null }, photos: photos };
    const b = new Blob([JSON.stringify(out)], { type: "application/json" });
    const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
    const name = "집비교판_" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "_" + p2(d.getHours()) + p2(d.getMinutes()) + ".json";
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { name: name, n: D.items.filter((x) => !x.deleted).length, photos: Object.keys(photos).length };
  }
  // 받은 파일을 거른다: 모양이 다른 칸은 버린다(남이 만든 파일을 그대로 믿지 않음)
  function cleanIn(j) {
    if (!j || j.app !== "house-hunt-my" || !j.data) throw new Error("집 비교판 백업 파일이 아니에요");
    const d = j.data, str = (v, n) => v == null ? undefined : String(v).slice(0, n || 2000);
    const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : undefined; };
    const NUMS = ["walkMin", "area", "rooms", "baths", "deposit", "rent", "mgmt", "parkingFee", "rank"];
    const STRS = ["name", "alias", "kind", "deal", "station", "address", "parking", "moveIn", "deadline", "status", "link", "memo", "source", "createdAt", "updatedAt", "agent", "priority"];
    const items = (Array.isArray(d.items) ? d.items : []).filter((it) => it && okId(it.id)).map((it) => {
      const o = { id: it.id };
      STRS.forEach((k) => { const v = str(it[k]); if (v !== undefined && v !== "") o[k] = v; });
      NUMS.forEach((k) => { const v = num(it[k]); if (v !== undefined && it[k] !== "" && it[k] != null) o[k] = v; });
      o.images = (Array.isArray(it.images) ? it.images : []).filter((p) => typeof p === "string" && /^lpp?:p[a-z0-9]{1,40}$/.test(p));
      if (it.deleted) o.deleted = true;
      return o;
    });
    const comments = (Array.isArray(d.comments) ? d.comments : []).filter((c) => c && okId(String(c.id)) && okId(String(c.itemId))).map((c) => ({ id: String(c.id), itemId: String(c.itemId), who: str(c.who, 20) || "?", text: str(c.text, 500) || "", at: str(c.at, 40) || "", deleted: c.deleted ? true : undefined }));
    const agents = (Array.isArray(d.agents) ? d.agents : []).filter((a) => a && okId(String(a.id)) && a.name).map((a) => ({ id: String(a.id), name: str(a.name, 40), tel: str(a.tel, 30) || "", rating: Math.max(0, Math.min(5, Math.round(Number(a.rating) || 0))), note: str(a.note, 1000) || "", updatedAt: str(a.updatedAt, 40) || "", deleted: a.deleted ? true : undefined }));
    const geo = {}; if (d.geo && typeof d.geo === "object") Object.keys(d.geo).forEach((id) => { const g = d.geo[id]; if (okId(id) && g && typeof g === "object") geo[id] = { lat: num(g.lat) == null ? null : num(g.lat), lng: num(g.lng) == null ? null : num(g.lng), q: g.q === "대략" ? "대략" : g.q === "없음" ? "없음" : "정확", addr: str(g.addr, 300) || "" }; });
    const cond = Object.assign({}, defaultCond); if (d.cond && typeof d.cond === "object") Object.keys(defaultCond).forEach((k) => { if (d.cond[k] != null) cond[k] = (k === "moveBy" || k === "near") ? str(d.cond[k], 300) : (num(d.cond[k]) == null ? defaultCond[k] : num(d.cond[k])); });
    const ref = d.ref && num(d.ref.lat) != null && num(d.ref.lng) != null ? { name: str(d.ref.name, 40) || "기준 장소", lat: num(d.ref.lat), lng: num(d.ref.lng), q: "정확", addr: str(d.ref.addr, 300) || "" } : null;
    // 받은 사진: 그림 칸(lp:)은 jpeg·png·webp·gif·heic만, PDF 칸(lpp:)은 PDF만. SVG는 스크립트를 품을 수 있어 받지 않는다(검토 2026-11-20 A). 한 장 약 15MB까지
    const photos = {}; if (j.photos && typeof j.photos === "object") Object.keys(j.photos).forEach((id) => { const u = j.photos[id]; if (typeof u !== "string" || u.length > 20e6) return;
      if (/^lp:p[a-z0-9]{1,40}$/.test(id) && /^data:image\/(jpeg|png|webp|gif|heic|heif);base64,/.test(u)) photos[id] = u;
      else if (/^lpp:p[a-z0-9]{1,40}$/.test(id) && /^data:application\/pdf;base64,/.test(u)) photos[id] = u; });
    if (items.length > 2000) throw new Error("집이 너무 많은 파일이에요(2000곳까지)");
    const move = d.move && window.HHMove ? window.HHMove.normalize(d.move) : null;
    return { items: items, comments: comments, agents: agents, geo: geo, cond: cond, ref: ref, photos: photos, move: move };
  }
  const tm = (s) => Date.parse(s || 0) || 0;
  async function importFile(file, mode) {
    let j; try { j = JSON.parse(await file.text()); } catch (e) { throw new Error("파일을 읽지 못했어요(JSON이 아니에요)"); }
    const inc = cleanIn(j);
    reload(); const before = JSON.stringify(D);
    let added = 0, changed = 0;
    if (mode === "replace") {
      D = { v: V, items: inc.items, comments: inc.comments, agents: inc.agents, geo: inc.geo, cond: inc.cond, ref: inc.ref, move: inc.move || undefined };
      added = inc.items.filter((x) => !x.deleted).length;
    } else {
      // 합치기: 집·중개사는 나중에 고친 쪽, 의견은 모두 모으고 지운 표시는 남긴다. 조건·기준 장소는 이 기기 것을 그대로 둔다
      inc.items.forEach((it) => {
        const i = D.items.findIndex((o) => o.id === it.id);
        if (i < 0) { D.items.push(it); if (!it.deleted) added++; if (inc.geo[it.id]) D.geo[it.id] = inc.geo[it.id]; }
        else if (tm(it.updatedAt) > tm(D.items[i].updatedAt)) { D.items[i] = it; changed++; if (inc.geo[it.id]) D.geo[it.id] = inc.geo[it.id]; }
      });
      inc.comments.forEach((c) => { const o = D.comments.find((x) => x.id === c.id); if (!o) D.comments.push(c); else if (c.deleted) o.deleted = true; });
      inc.agents.forEach((a) => { const i = D.agents.findIndex((o) => o.id === a.id); if (i < 0) D.agents.push(a); else if (tm(a.updatedAt) > tm(D.agents[i].updatedAt)) D.agents[i] = a; });
      if (!D.ref && inc.ref && inc.ref.name !== "예시 회사") D.ref = inc.ref; // 예시 기준 장소는 합치기로 되살리지 않음
      if (inc.move) D.move = D.move && window.HHMove ? window.HHMove.merge(D.move, inc.move) : inc.move;
    }
    const old = mode === "replace" ? new Set(JSON.parse(before).items.flatMap((it) => Array.isArray(it.images) ? it.images : [])) : null;
    try { persist(); } catch (e) { D = JSON.parse(before); throw e; }
    const used = new Set(photoIds());
    for (const id of Object.keys(inc.photos)) { if (!used.has(id)) continue; try { const b = await dataToBlob(inc.photos[id]); await tx("readwrite", (s) => s.put(b, id)); } catch (e) { /* 사진 하나 실패해도 계속 */ } }
    if (old) for (const id of old) if (!used.has(id)) await assets.delete(id);
    if (MV) MV.render();
    return { added: added, changed: changed };
  }

  /* ---------- 화면에 붙이는 것: 백업 창·처음 안내·기준 장소 칸 ---------- */
  let H = null;
  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, kids) { const e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach((k) => { if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }); (kids || []).forEach((c) => c && e.append(c)); return e; }
  const exampleCount = () => D.items.filter((x) => !x.deleted && /^ex-/.test(x.id)).length;
  function ask(box, text, yesText, onYes) {
    box.replaceChildren(h("div", { class: "confirm" }, [h("span", { text: text }), h("button", { class: "btn danger", type: "button", text: yesText, onclick: async () => { box.replaceChildren(); await onYes(); } }), h("button", { class: "btn ghost", type: "button", text: "그만두기", onclick: () => box.replaceChildren() })]));
  }
  function drawData(note) {
    const body = $("myBody"); body.replaceChildren();
    const live = D.items.filter((x) => !x.deleted).length, ex = exampleCount();
    const msg = h("p", { class: "small", role: "status", "aria-live": "polite", text: note || "" });
    const sec = (title, desc, kids) => h("section", { class: "my-sec" }, [h("h3", { text: title }), desc ? h("p", { class: "hint", text: desc }) : null].concat(kids));
    // 내보내기
    const exBtn = h("button", { class: "btn primary", type: "button", text: "파일로 내보내기", onclick: async () => {
      exBtn.disabled = true; msg.textContent = "파일을 만드는 중…";
      try { const r = await exportFile(); msg.textContent = "«" + r.name + "»을 받았어요 · 집 " + r.n + "곳 · 사진 " + r.photos + "장"; }
      catch (e) { msg.textContent = "내보내지 못했어요: " + (e && e.message || "오류"); } finally { exBtn.disabled = false; }
    } });
    // 가져오기
    const pick = h("input", { type: "file", accept: "application/json,.json", hidden: "" });
    const askBox = h("div");
    let mode = "merge";
    const run = async (f) => {
      msg.textContent = "가져오는 중…";
      try { const r = await importFile(f, mode); H.refresh(); drawData(mode === "replace" ? "바꿨어요 · 집 " + r.added + "곳" : "합쳤어요 · 새 집 " + r.added + "곳 · 더 최근에 고친 집 " + r.changed + "곳"); }
      catch (e) { msg.textContent = (e && e.message) || "가져오지 못했어요"; }
    };
    pick.addEventListener("change", () => { const f = pick.files && pick.files[0]; pick.value = ""; if (!f) return;
      if (mode === "replace") ask(askBox, "이 기기의 집 " + live + "곳을 지우고 파일 내용으로 바꿀까요? 되돌릴 수 없어요(먼저 내보내 두면 안전해요).", "바꾸기", () => run(f));
      else run(f); });
    const mergeBtn = h("button", { class: "btn", type: "button", text: "가져와서 합치기", onclick: () => { mode = "merge"; pick.click(); } });
    const replBtn = h("button", { class: "btn ghost", type: "button", text: "가져와서 모두 바꾸기", onclick: () => { mode = "replace"; pick.click(); } });
    // 예시·전체 지우기
    const delBox = h("div");
    const exBtn2 = ex ? h("button", { class: "btn", type: "button", text: "예시 집 " + ex + "곳 지우기", onclick: () => ask(delBox, "예시 집과 그 의견·예시 중개사를 지울까요?", "지우기", async () => {
      reload(); const t = nowIso(); // 지운 표시만 남긴다(상대가 예시가 든 파일을 보내 합쳐도 되살아나지 않게, 검토 2026-11-20 C)
      D.items.forEach((x) => { if (/^ex-/.test(x.id) && !x.deleted) { Object.keys(x).forEach((k) => { if (!/^(id|name|createdAt)$/.test(k)) delete x[k]; }); x.deleted = true; x.updatedAt = t; } });
      D.comments.forEach((c) => { if (/^ex-/.test(c.itemId)) c.deleted = true; }); D.agents.forEach((a) => { if (/^aex-/.test(a.id)) { a.deleted = true; a.updatedAt = t; } });
      Object.keys(D.geo).forEach((k) => { if (/^ex-/.test(k)) delete D.geo[k]; });
      if (D.ref && D.ref.name === "예시 회사") D.ref = null;
      persist(); H.refresh(); drawData("예시를 지웠어요. «조건 고치기»에서 기준 장소(회사·역)를 정해 보세요.");
    }) }) : null;
    const wipeBtn = h("button", { class: "btn danger", type: "button", text: "이 기기 기록 모두 지우기", onclick: () => ask(delBox, "집·의견·중개사·사진·이사 할 일을 이 기기에서 모두 지울까요? 되돌릴 수 없어요.", "모두 지우기", async () => {
      for (const id of photoIds()) await assets.delete(id);
      D = { v: V, items: [], comments: [], agents: [], geo: {}, cond: Object.assign({}, defaultCond), ref: null }; persist(); if (MV) MV.render(); H.refresh(); drawData("모두 지웠어요.");
    }) });
    body.append(
      h("p", { class: "hint", text: "이 판은 회원가입 없이 이 기기 브라우저에만 저장돼요. 서버로 보내지 않아요(지도 위치를 찾을 때 주소 글자만 OpenStreetMap에 보내요). 브라우저 기록을 지우거나 다른 기기에서 열면 비어 있으니, 가끔 파일로 내보내 두세요." }),
      sec("내보내기", "집·의견·중개사·조건·사진·이사 할 일을 파일 하나(.json)로 받아요. 같이 집을 보는 사람에게 카톡·메일로 보내도 돼요.", [h("div", { class: "actions" }, [exBtn])]),
      sec("가져오기", "«합치기»는 집마다 더 최근에 고친 쪽을 남기고, 서로 단 의견은 모두 모아요. 둘이 번갈아 고치고 파일을 주고받으면 같은 판을 볼 수 있어요.", [h("div", { class: "actions" }, [mergeBtn, replBtn, pick]), askBox]),
      sec("정리", null, [h("div", { class: "actions" }, [exBtn2, wipeBtn]), delBox]),
      msg
    );
  }
  function openData() { H.closeSheets(); drawData(); $("mySheet").hidden = false; setTimeout(() => { const b = $("myBody").querySelector("button"); if (b) b.focus(); }, 30); }
  function closeData() { $("mySheet").hidden = true; }
  function intro() {
    let seen = false; try { seen = localStorage.getItem(NOTE_KEY) === "1"; } catch (e) { seen = false; }
    if (seen) return;
    const close = () => { box.remove(); try { localStorage.setItem(NOTE_KEY, "1"); } catch (e) { /* 다음에 또 보여도 됨 */ } };
    const box = h("div", { class: "my-intro", role: "note" }, [
      h("p", null, [h("b", { text: "처음 오셨나요? " }), document.createTextNode("예시 집 4곳이 들어 있어요. 카드를 눌러 둘러본 뒤, «백업» → «예시 집 지우기»로 비우고 내 집을 올려 보세요. 기록은 이 기기에만 저장돼요.")]),
      h("div", { class: "actions" }, [h("button", { class: "btn primary", type: "button", text: "알겠어요", onclick: close }), h("button", { class: "btn ghost", type: "button", text: "백업·예시 열기", onclick: () => { close(); openData(); } })])
    ]);
    const note = $("statusNote"); note.parentNode.insertBefore(box, note);
  }
  // 조건 창에 «기준 장소»(회사·학교·자주 가는 역) 칸을 더한다. 조건과 따로 D.ref에 둔다(앱의 조건 저장은 정해진 칸만 보냄)
  function refField() {
    const form = $("condForm"); if (!form) return;
    const inp = h("input", { id: "c_ref", placeholder: "예: ○○역, 회사 주소", autocomplete: "off" });
    const hint = h("span", { class: "hint", id: "c_refMsg", text: "지도 기준점과 «가까운 순» 정렬에 써요. 저장하면 위치를 찾아요." });
    const box = h("div", { class: "field full" }, [h("label", { for: "c_ref", text: "기준 장소 (회사·학교·자주 가는 역)" }), inp, hint]);
    const first = form.querySelector(".hint.full"); form.insertBefore(box, first || form.lastElementChild);
    $("btnCond").addEventListener("click", () => { inp.value = D.ref ? (D.ref.addr || D.ref.name || "") : ""; hint.textContent = "지도 기준점과 «가까운 순» 정렬에 써요. 저장하면 위치를 찾아요."; });
    form.addEventListener("submit", async () => {
      const v = inp.value.trim();
      if (!v) { if (D.ref) { D.ref = null; persist(); H.refresh(); } return; }
      if (D.ref && (D.ref.addr === v || (!D.ref.addr && D.ref.name === v))) return;
      try {
        const g = await geocode(v);
        if (!g || g.none) { H.toast("«" + v + "» 위치를 못 찾았어요. 역 이름이나 도로명 주소로 다시 적어 보세요"); return; }
        D.ref = { name: v.length > 14 ? (g.name || v.slice(0, 14)) : v, lat: g.lat, lng: g.lng, q: g.q, addr: v }; persist(); H.refresh();
        H.toast("기준 장소를 정했어요: " + D.ref.name + (g.q === "대략" ? " (동까지만 맞음)" : ""));
      } catch (e) { H.toast("위치 검색에 연결하지 못했어요. 잠시 뒤 다시 저장해 주세요"); }
    });
  }
  // 정렬·지도 범례의 «기준 장소» 글자를 정한 이름으로
  function refLabels() {
    const nm = D.ref && D.ref.name ? D.ref.name : "기준 장소";
    const o = document.querySelector('#sortSel option[value="dist"]'); if (o) o.textContent = nm + " 가까운 순";
    const lg = document.querySelector(".map-legend .lg-ref"); if (lg && lg.parentNode) lg.parentNode.lastChild.textContent = nm;
  }
  function ready(hooks) {
    H = Object.assign({}, hooks, { refresh: () => { refLabels(); return hooks.refresh(); } });
    const vf = $("videoField"); if (vf) { vf.hidden = true; vf.style.display = "none"; } // 동영상은 범용판에 없음(칸은 앱 코드가 쓰니 지우지 않고 숨김)
    // 범용판에만 있는 칸 모양(앱의 8pt 토큰·색 토큰을 그대로 씀). 처음 안내는 앱의 rise 움직임으로 살짝 떠오름
    document.head.append(h("style", { text:
      ".my-intro{background:var(--accent-soft);color:var(--ink);border-radius:8px;padding:var(--space-3);margin-bottom:var(--space-3);animation:rise .3s ease-out both}" +
      ".my-intro p{margin:0}.my-intro .actions{margin-top:var(--space-2)}" +
      ".my-sec{margin-top:var(--space-4)}.my-sec h3{margin:0 0 var(--space-1);font-size:1rem}.my-sec .actions{margin-top:var(--space-2)}" +
      ".btn.my-bk{display:inline-flex;align-items:center;gap:var(--space-1)}.btn.my-bk svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}" +
      ".head .btn{white-space:nowrap}@media (max-width:520px){.head{flex-wrap:wrap}.head>div:first-child{flex:1 1 100%}.head h1{white-space:nowrap}}" + // 폰: 제목 한 줄, 단추 줄은 그 아래(단추 글자가 한 글자씩 꺾이지 않게)
      "@media (prefers-reduced-motion: reduce){.my-intro{animation:none}}" }));
    // 폰에서는 머리 단추가 많아 글자가 두 줄로 깨지므로 상자 아이콘만, 넓은 화면은 «백업·예시» 글자도
    const btn = h("button", { class: "btn my-bk", id: "btnMyData", type: "button", "aria-label": "백업·예시·같이 쓰기", title: "백업·예시·같이 쓰기" }, [h("span", { class: "lg-only", text: "백업·예시" })]);
    const ic = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ic.setAttribute("viewBox", "0 0 24 24"); ic.setAttribute("aria-hidden", "true");
    ic.innerHTML = '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>';
    btn.prepend(ic);
    btn.addEventListener("click", openData);
    $("btnAgents").parentNode.insertBefore(btn, $("btnAgents"));
    const sheet = h("div", { class: "sheet", id: "mySheet", hidden: "" }, [h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "myTitle" }, [
      h("div", { class: "panel-head" }, [h("h2", { id: "myTitle", text: "백업 · 예시 · 같이 쓰기" }), h("button", { class: "btn ghost", type: "button", text: "닫기", onclick: closeData })]),
      h("div", { id: "myBody" })])]);
    sheet.addEventListener("click", (e) => { if (e.target === sheet) closeData(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeData(); });
    document.body.append(sheet);
    refField(); refLabels(); intro();
  }

  load();
  window.addEventListener("storage", (e) => { if (e.key === DATA_KEY && H) { reload(); H.refresh(); if (MV) MV.render(); } });
  // 이사 탭(../move.js): 이 기기 D.move에 저장. 앱 코드가 window.HH_MOVE를 보고 «이사» 단추를 켠다
  const MV = window.HHMove ? window.HHMove.create({ load: () => { reload(); return D.move || null; }, save: (m) => { change(() => { D.move = m; }); }, toast: (t) => { if (H) H.toast(t); } }) : null;
  window.HH_MOVE = MV;
  window.HH_LOCAL = { defaultCond: defaultCond, call: call, assets: assets, imgSrc: (p) => URLS.get(p) || "", ready: ready };
})();

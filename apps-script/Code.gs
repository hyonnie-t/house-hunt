/**
 * 집 찾기 백엔드 (시트에 붙은 앱스 스크립트)
 * 시트 탭: 집 / 설정 / 의견 / 중개사.비밀번호는 스크립트 속성 HOUSE_KEY에 효니가 직접 넣는다(코드·레포에 넣지 않는다).
 * 배포: 배포 > 새 배포 > 웹 앱, 실행: 나, 액세스: 모든 사용자. 코드를 고치면 «배포 관리 > 새 버전»(주소 유지).
 * 지우기는 deleted=TRUE 표시만 한다(줄은 남는다). 정기 검색은 deleted·탈락 집을 다시 넣지 않는다.
 * 정기 검색(Claude)은 이 웹 앱이 아니라 구글 시트를 직접 읽고 써서 비밀번호가 필요 없다.
 */
const VERSION = 6; // 2026-11-18 동영상(구글 드라이브 «집 찾기 영상» 폴더)
// 새 칸은 맨 뒤에만 더한다(이미 있는 줄의 칸 위치가 밀리지 않게)
const COLS = ['id', 'name', 'kind', 'deal', 'station', 'walkMin', 'address', 'area', 'rooms', 'baths', 'deposit', 'rent', 'mgmt',
  'parking', 'parkingFee', 'moveIn', 'deadline', 'status', 'link', 'memo', 'images', 'source', 'createdAt', 'updatedAt', 'deleted',
  'alias', 'agent', 'rank', 'priority', // 2026-11-09 별칭·중개사 이름·내 순위(숫자)·우선순위(최우선/높음/보통/낮음)
  'fill', // 2026-11-12 «대기»면 정기 검색(Claude)이 링크를 열어 빈 칸만 채우고 «완료»로 바꾼다
  'videos']; // 2026-11-18 직접 찍은 동영상 [{id(드라이브 파일), name, size, at}] JSON. 정기 검색은 비워 둔다
const NUM = ['walkMin', 'area', 'rooms', 'baths', 'deposit', 'rent', 'mgmt', 'parkingFee', 'rank'];

function doGet(e) {
  if (e && e.parameter && e.parameter.check === 'geo') { try { return out_(geoCheck_()); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  return out_({ ok: true, app: 'house-hunt', hint: 'POST로 요청하세요' });
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const saved = PropertiesService.getScriptProperties().getProperty('HOUSE_KEY');
    if (!saved) return out_({ ok: false, error: '스크립트 속성 HOUSE_KEY에 비밀번호를 넣어 주세요' });
    if (String(d.key || '') !== saved) { Utilities.sleep(800); return out_({ ok: false, error: '비밀번호가 맞지 않아요' }); }
    switch (d.action) {
      case 'list': return out_(list_());
      case 'save': return out_(withLock_(() => save_(d.item || {})));
      case 'remove': return out_(withLock_(() => remove_(String(d.id || ''))));
      case 'saveConditions': return out_(withLock_(() => saveCond_(d.cond || {})));
      case 'comment': return out_(withLock_(() => comment_(d)));
      case 'saveAgent': return out_(withLock_(() => saveAgent_(d.agent || {})));
      case 'removeAgent': return out_(withLock_(() => removeAgent_(String(d.id || ''))));
      case 'uncomment': return out_(withLock_(() => uncomment_(String(d.id || ''))));
      case 'addrLookup': return out_(addrLookup_(String(d.address || '').slice(0, 200)));
      case 'videoStart': return out_(videoStart_(d));
      case 'videoChunk': return out_(videoChunk_(d));
      case 'videoDone': return out_(videoDone_(String(d.id || '')));
      case 'videoTrash': return out_(videoTrash_(String(d.id || '')));
    }
    return out_({ ok: false, error: '모르는 요청: ' + d.action });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('집');
  if (!sh) sh = ss.insertSheet('집');
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#E3EFE9');
    sh.setFrozenRows(1);
    // 날짜·번지처럼 보이는 글자가 바뀌지 않게 숫자 칸 말고는 글자 형식으로
    COLS.forEach((c, i) => { if (NUM.indexOf(c) < 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  }
  ensureCols_(sh, COLS, NUM);
  return sh;
}

// 이미 있는 시트에 새 칸 제목이 없으면 맨 뒤에 더한다(기존 줄의 칸 위치는 밀리지 않는다)
function ensureCols_(sh, cols, numCols) {
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  const head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  cols.forEach((c, i) => {
    if (head[i] === c) return;
    if (head[i] !== '') throw new Error('시트 제목 칸이 달라요: ' + (i + 1) + '번째');
    sh.getRange(1, i + 1).setValue(c).setFontWeight('bold').setBackground('#E3EFE9');
    if ((numCols || []).indexOf(c) < 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

function condSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('설정');
  if (!sh) sh = ss.insertSheet('설정');
  return sh;
}

function rowToItem_(row) {
  const o = {};
  COLS.forEach((c, i) => {
    let v = row[i];
    if (v === '' || v === null || v === undefined) return;
    if (NUM.indexOf(c) >= 0) { const n = Number(v); if (isFinite(n)) o[c] = n; return; }
    if (c === 'deleted') { o[c] = (v === true || String(v).toUpperCase() === 'TRUE'); return; }
    if (c === 'videos') { let a = []; try { a = JSON.parse(v); } catch (e) { a = []; } o[c] = Array.isArray(a) ? a : []; return; }
    if (c === 'images') { try { o[c] = JSON.parse(v); } catch (e) { o[c] = String(v).split(/\s+/).filter(String); } return; }
    if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
    o[c] = String(v);
  });
  return o;
}

function itemToRow_(it) {
  return COLS.map((c) => {
    const v = it[c];
    if (v === undefined || v === null) return '';
    if (c === 'images') return Array.isArray(v) ? JSON.stringify(v) : String(v);
    if (c === 'videos') return Array.isArray(v) ? (v.length ? JSON.stringify(v) : '') : String(v);
    if (c === 'deleted') return v ? 'TRUE' : '';
    return v;
  });
}

function list_() {
  const sh = sheet_();
  const n = sh.getLastRow();
  const items = [];
  if (n > 1) {
    const rows = sh.getRange(2, 1, n - 1, COLS.length).getValues();
    rows.forEach((r) => { if (r[0]) { const it = rowToItem_(r); if (!it.deleted) items.push(it); } });
  }
  let cond = null;
  const cs = condSheet_();
  const raw = cs.getRange(1, 1).getValue();
  if (raw) { try { cond = JSON.parse(raw); } catch (e) { cond = null; } }
  // 위치는 덧붙이는 기능이라, 실패해도 집 목록은 그대로 돌려준다(검토 2026-11-13)
  let g;
  try { g = geo_(items); } catch (err) { g = { geo: {}, ref: null, error: 'geo_fail' }; }
  return { ok: true, v: VERSION, items: items, cond: cond, comments: comments_(), agents: agents_(), geo: g.geo, ref: g.ref, geoError: g.error || null };
}

/* ---------- 위치(2026-11-13): 주소 → 좌표는 카카오 로컬 API ----------
 * 키는 스크립트 속성 KAKAO_REST_KEY(책장 중계와 같은 REST 키, 효니가 넣음). 코드·레포·로그에 넣지 않는다.
 * 결과는 시트에 저장하지 않고 스크립트 캐시에 6시간만 둔다(카카오 API 결과를 따로 쌓지 않음).
 * 보내는 것은 집 주소 글자뿐이다(이름·비밀번호·의견은 보내지 않는다).
 */
const GEO_TTL = 6 * 3600;
const REF_PLACE = '신대방역 2호선';

// 주소 글자를 검색에 맞게 다듬는다: 괄호 속 설명(동 이름·호수·«정확한 번지 미표시»)을 떼고 서울을 붙인다
function geoQuery_(addr) {
  let s = String(addr || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/^[가-힣]{1,4}구\s/.test(s)) s = '서울 ' + s; // «관악구 …»처럼 구로 시작할 때만(경기 등 다른 시·도는 그대로)
  return s;
}

function geo_(items) {
  const key = PropertiesService.getScriptProperties().getProperty('KAKAO_REST_KEY');
  if (!key) return { geo: {}, ref: null, error: 'no_key' };
  const cache = CacheService.getScriptCache();
  const want = {}; // 검색어 → 집 id들
  items.forEach((it) => { const q = geoQuery_(it.address); if (q) (want[q] = want[q] || []).push(it.id); });
  const qs = Object.keys(want).concat(['ref:' + REF_PLACE]);
  const ck = (q) => 'g1:' + Utilities.base64EncodeWebSafe(Utilities.newBlob(q).getBytes()).slice(0, 240);
  const hit = {};
  for (let i = 0; i < qs.length; i += 90) Object.assign(hit, cache.getAll(qs.slice(i, i + 90).map(ck))); // getAll은 한 번에 100개까지
  const res = {}, miss = [];
  qs.forEach((q) => { const v = hit[ck(q)]; if (v) res[q] = JSON.parse(v); else miss.push(q); });
  let error = cache.get('g1:err');
  if (miss.length && !error) { // 키·사용 설정 오류가 나면 10분 동안은 다시 부르지 않는다(30초마다 새로 읽으므로)
    const head = { headers: { Authorization: 'KakaoAK ' + key }, muteHttpExceptions: true };
    const url = (q) => q.indexOf('ref:') === 0
      ? 'https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=' + encodeURIComponent(q.slice(4))
      : 'https://dapi.kakao.com/v2/local/search/address.json?size=1&query=' + encodeURIComponent(q);
    const out = UrlFetchApp.fetchAll(miss.slice(0, 80).map((q) => Object.assign({ url: url(q) }, head)));
    const put = {};
    out.forEach((r, i) => {
      const q = miss[i], code = r.getResponseCode();
      if (code !== 200) { error = 'kakao_' + code; return; }
      const doc = (JSON.parse(r.getContentText()).documents || [])[0];
      // REGION(동·구까지만 맞음)은 «대략», 번지·도로명까지 맞으면 «정확», 못 찾으면 «없음»
      const v = !doc ? { q: '없음' }
        : { lat: Math.round(Number(doc.y) * 1e6) / 1e6, lng: Math.round(Number(doc.x) * 1e6) / 1e6, q: (doc.address_type === 'REGION' || doc.address_type === 'ROAD') ? '대략' : '정확' };
      if (q.indexOf('ref:') === 0) { if (!doc) return; v.q = '정확'; } // 역을 못 찾은 결과는 캐시하지 않는다(아래 기본 좌표 사용)
      res[q] = v; put[ck(q)] = JSON.stringify(v);
    });
    const keys = Object.keys(put);
    for (let i = 0; i < keys.length; i += 90) { const part = {}; keys.slice(i, i + 90).forEach((k) => { part[k] = put[k]; }); cache.putAll(part, GEO_TTL); }
    if (error) cache.put('g1:err', error, 600);
  }
  const geo = {};
  Object.keys(want).forEach((q) => { const v = res[q]; if (v) want[q].forEach((id) => { geo[id] = v; }); });
  const r0 = res['ref:' + REF_PLACE];
  // 키가 있는데 역 검색만 안 될 때는 신대방역(2호선) 대략 좌표로 대신한다
  const ref = r0 && r0.lat ? { name: '신대방역', lat: r0.lat, lng: r0.lng } : (error ? null : { name: '신대방역', lat: 37.48749, lng: 126.91311 });
  return { geo: geo, ref: ref, error: error };
}

// 주소만 넣었을 때(2026-11-18, 효니 «주소만 넣을 수 있어? 네가 찾아주면 좋겠는데»): 카카오 로컬로
// 정식 주소·건물 이름과 가장 가까운 지하철역(직선 거리)을 찾아 준다. 보내는 것은 주소 글자뿐, 결과는 저장하지 않는다.
function addrLookup_(addr) {
  const key = PropertiesService.getScriptProperties().getProperty('KAKAO_REST_KEY');
  if (!key) return { ok: false, error: '카카오 키가 없어요' };
  const q = geoQuery_(addr);
  if (!q) return { ok: false, error: '주소를 적어 주세요' };
  const head = { headers: { Authorization: 'KakaoAK ' + key }, muteHttpExceptions: true };
  const r = UrlFetchApp.fetch('https://dapi.kakao.com/v2/local/search/address.json?size=3&query=' + encodeURIComponent(q), head);
  if (r.getResponseCode() !== 200) return { ok: false, error: '카카오 오류(' + r.getResponseCode() + ')' };
  const doc = (JSON.parse(r.getContentText()).documents || [])[0];
  if (!doc) return { ok: true, found: false };
  const road = doc.road_address || {}, jibun = doc.address || {};
  const out = { ok: true, found: true, rough: doc.address_type === 'REGION' || doc.address_type === 'ROAD',
    road: road.address_name || '', jibun: jibun.address_name || '', building: road.building_name || '', dong: jibun.region_3depth_name || road.region_3depth_name || '' };
  const s = UrlFetchApp.fetch('https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&sort=distance&radius=3000&size=3&x=' + doc.x + '&y=' + doc.y, head);
  if (s.getResponseCode() === 200) {
    const st = (JSON.parse(s.getContentText()).documents || [])[0];
    if (st) { out.station = String(st.place_name).replace(/\s.*$/, ''); out.stationM = Number(st.distance); }
  }
  return out;
}

// 처음 한 번: 편집기에서 이 함수를 골라 «실행» → 권한 허용(외부 서비스 호출). 웹 앱이 카카오를 부르려면 소유자 허락이 필요하다.
// 로그에는 응답 코드만 남긴다(키·주소는 남기지 않음).
function allowKakao() {
  const key = PropertiesService.getScriptProperties().getProperty('KAKAO_REST_KEY');
  if (!key) { console.log('스크립트 속성 KAKAO_REST_KEY가 없어요'); return; }
  const r = UrlFetchApp.fetch('https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=' + encodeURIComponent(REF_PLACE),
    { headers: { Authorization: 'KakaoAK ' + key }, muteHttpExceptions: true });
  console.log('카카오 응답 코드: ' + r.getResponseCode() + (r.getResponseCode() === 200 ? ' (정상)' : ''));
}

// 비밀번호 없이 상태만 보는 점검(집 주소·좌표는 돌려주지 않는다): ?check=geo
function geoCheck_() {
  const key = PropertiesService.getScriptProperties().getProperty('KAKAO_REST_KEY');
  if (!key) return { ok: false, error: 'no_key' };
  const items = sheet_().getLastRow() > 1 ? sheet_().getRange(2, 1, sheet_().getLastRow() - 1, COLS.length).getValues()
    .filter((r) => r[0]).map(rowToItem_).filter((it) => !it.deleted) : [];
  const g = geo_(items);
  const cnt = { 정확: 0, 대략: 0, 없음: 0, 주소없음: 0, 미확인: 0 };
  items.forEach((it) => { if (!geoQuery_(it.address)) cnt.주소없음++; else if (g.geo[it.id]) cnt[g.geo[it.id].q]++; else cnt.미확인++; });
  return { ok: !g.error, error: g.error, ref: !!g.ref, count: cnt };
}

// 의견(둘이 남기는 한 줄 메모): 탭 «의견», 칸 id·itemId·who·text·at·deleted. 지우기는 deleted 표시만 한다.
const C_COLS = ['id', 'itemId', 'who', 'text', 'at', 'deleted'];
function commentSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('의견');
  if (!sh) {
    sh = ss.insertSheet('의견');
    sh.getRange(1, 1, 1, C_COLS.length).setValues([C_COLS]).setFontWeight('bold').setBackground('#E3EFE9');
    sh.setFrozenRows(1);
    C_COLS.forEach((c, i) => sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'));
  }
  return sh;
}
function comments_() {
  const sh = commentSheet_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, C_COLS.length).getValues()
    .filter((r) => r[0] && String(r[5]).toUpperCase() !== 'TRUE')
    .map((r) => ({ id: String(r[0]), itemId: String(r[1]), who: String(r[2]), text: String(r[3]), at: String(r[4]) }));
}
function comment_(d) {
  const itemId = String(d.itemId || ''), who = String(d.who || '').slice(0, 20), text = String(d.text || '').slice(0, 500);
  if (!/^[a-z0-9-]{1,80}$/.test(itemId) || !who || !text) return { ok: false, error: '의견 내용이 올바르지 않아요' };
  const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), itemId: itemId, who: who, text: text, at: new Date().toISOString() };
  commentSheet_().appendRow([c.id, c.itemId, c.who, c.text, c.at, '']);
  return { ok: true, comment: c };
}
function uncomment_(id) {
  const sh = commentSheet_();
  const n = sh.getLastRow();
  if (n < 2) return { ok: true };
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { sh.getRange(i + 2, 6).setValue('TRUE'); break; }
  return { ok: true };
}

// 중개사(부동산) 정리: 탭 «중개사», 칸 id·name·tel·rating·note·updatedAt·deleted.
// 집의 agent(이름)와 name이 같으면 같은 중개사로 본다.
const A_COLS = ['id', 'name', 'tel', 'rating', 'note', 'updatedAt', 'deleted'];
function agentSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('중개사');
  if (!sh) { sh = ss.insertSheet('중개사'); sh.setFrozenRows(1); }
  ensureCols_(sh, A_COLS, ['rating']);
  return sh;
}
function agents_() {
  const sh = agentSheet_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, A_COLS.length).getValues()
    .filter((r) => r[0] && String(r[6]).toUpperCase() !== 'TRUE')
    .map((r) => ({ id: String(r[0]), name: String(r[1]), tel: String(r[2]), rating: Number(r[3]) || 0, note: String(r[4]), updatedAt: String(r[5]) }));
}
function saveAgent_(a) {
  const id = String(a.id || ''), name = String(a.name || '').trim().slice(0, 40);
  if (!/^[a-z0-9-]{1,80}$/.test(id) || !name) return { ok: false, error: '중개사 이름이 올바르지 않아요' };
  const r = Math.max(0, Math.min(5, Math.round(Number(a.rating) || 0)));
  const row = [id, name, String(a.tel || '').slice(0, 30), r, String(a.note || '').slice(0, 1000), new Date().toISOString(), ''];
  const sh = agentSheet_();
  const n = sh.getLastRow();
  let at = -1;
  if (n > 1) { const ids = sh.getRange(2, 1, n - 1, 1).getValues(); for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { at = i + 2; break; } }
  if (at < 0) sh.appendRow(row); else sh.getRange(at, 1, 1, A_COLS.length).setValues([row]);
  return { ok: true };
}
function removeAgent_(id) {
  const sh = agentSheet_();
  const n = sh.getLastRow();
  if (n < 2) return { ok: true };
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { sh.getRange(i + 2, 7).setValue('TRUE'); break; }
  return { ok: true };
}

function findRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function save_(item) {
  const id = String(item.id || '');
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return { ok: false, error: '집 id가 올바르지 않아요' };
  const sh = sheet_();
  const row = findRow_(sh, id);
  const now = new Date().toISOString();
  item.updatedAt = now;
  if (row < 0) {
    item.createdAt = item.createdAt || now;
    sh.appendRow(itemToRow_(item));
  } else {
    const old = rowToItem_(sh.getRange(row, 1, 1, COLS.length).getValues()[0]);
    item.createdAt = old.createdAt || item.createdAt || now;
    item.source = old.source || item.source;
    if (item.videos === undefined && old.videos) item.videos = old.videos; // 동영상 칸을 모르는 옛 화면이 저장해도 지우지 않는다
    sh.getRange(row, 1, 1, COLS.length).setValues([itemToRow_(item)]);
  }
  return { ok: true, updatedAt: now };
}

function remove_(id) {
  const sh = sheet_();
  const row = findRow_(sh, id);
  if (row < 0) return { ok: true };
  sh.getRange(row, COLS.indexOf('deleted') + 1).setValue('TRUE');
  sh.getRange(row, COLS.indexOf('updatedAt') + 1).setValue(new Date().toISOString());
  return { ok: true };
}

function saveCond_(cond) {
  condSheet_().getRange(1, 1).setValue(JSON.stringify(cond));
  return { ok: true };
}

/* ---------- 동영상(2026-11-18): 직접 찍은 영상을 효니 구글 드라이브 «집 찾기 영상» 폴더에 ----------
 * 큰 파일은 드라이브 «이어 올리기» 세션으로 조각조각 올린다. 세션은 이 스크립트가 효니 권한으로 열고(videoStart),
 * 브라우저는 받은 주소로 조각을 바로 보낸다. 바로 보내기가 막히면(CORS) 조각을 이 스크립트에 보내 대신 넘긴다(videoChunk).
 * 다 올라가면 «링크가 있는 사람 보기»로 바꿔 앱 안에서 재생한다(남자친구는 구글 로그인 없이 봄). 시트에는 파일 id만 적는다.
 * 지우기는 휴지통으로(30일 안에 드라이브에서 되살릴 수 있음). 이 폴더 밖 파일은 건드리지 않는다.
 * 권한: 처음 한 번 효니가 편집기에서 authorizeDrive를 실행해 드라이브 권한을 허락해야 한다.
 */
const VIDEO_FOLDER = '집 찾기 영상';
const APP_ORIGIN = 'https://hyonnie-t.github.io';
const VIDEO_MAX = 2 * 1024 * 1024 * 1024; // 2GB
const UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files?';

// 편집기에서 한 번 실행해 드라이브 권한을 허락하는 함수(효니가 «실행 → 허용»)
function authorizeDrive() { const f = videoFolder_(); Logger.log('폴더 준비됨: ' + f.getName()); }

function videoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('VIDEO_FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* 지워졌으면 새로 */ } }
  // 처음 두 영상을 동시에 올려도 폴더가 둘 생기지 않게 잠그고 다시 본다(제미나이 검토 2026-11-18)
  return withLock_(() => {
    const again = props.getProperty('VIDEO_FOLDER_ID');
    if (again && again !== id) { try { const g = DriveApp.getFolderById(again); if (!g.isTrashed()) return g; } catch (e) { /* 새로 */ } }
    const f = DriveApp.createFolder(VIDEO_FOLDER);
    props.setProperty('VIDEO_FOLDER_ID', f.getId());
    return f;
  });
}

function inFolder_(file) {
  const fid = videoFolder_().getId();
  const ps = file.getParents();
  while (ps.hasNext()) if (ps.next().getId() === fid) return true;
  return false;
}

function videoStart_(d) {
  const size = Number(d.size);
  if (!(size > 0) || size > VIDEO_MAX) return { ok: false, error: '동영상은 2GB까지 올릴 수 있어요' };
  // 2026-11-18 사진·PDF도 같은 길로(효니 «사진이 안 올라가는디»): 그림·PDF는 그 형식 그대로, 나머지는 영상으로 본다
  const raw = String(d.mime || '');
  const mime = /^(video|image)\/[\w.+-]+$/.test(raw) || raw === 'application/pdf' ? raw : 'video/mp4';
  const item = String(d.itemName || '').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40).trim();
  const name = (Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd') + ' ' + item + ' ' + String(d.name || 'video').slice(-60)).replace(/\s+/g, ' ').trim();
  const res = UrlFetchApp.fetch(UPLOAD_PREFIX + 'uploadType=resumable&fields=id,name,size', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size), Origin: APP_ORIGIN },
    payload: JSON.stringify({ name: name, mimeType: mime, parents: [videoFolder_().getId()] })
  });
  const h = res.getAllHeaders();
  const url = h.Location || h.location;
  if (res.getResponseCode() !== 200 || !url) return { ok: false, error: '드라이브가 받지 않았어요(' + res.getResponseCode() + ')' };
  return { ok: true, url: url };
}

// 바로 보내기가 막혔을 때: 조각(base64)을 받아 드라이브에 대신 넘긴다
function videoChunk_(d) {
  const url = String(d.url || '');
  if (url.indexOf(UPLOAD_PREFIX) !== 0 || url.indexOf('upload_id=') < 0) return { ok: false, error: '올리기 주소가 이상해요' };
  const start = Number(d.start), total = Number(d.total);
  if (d.status) { // 어디까지 받았는지만 묻기(조각 없이 «bytes */전체»)
    const q = UrlFetchApp.fetch(url, { method: 'put', muteHttpExceptions: true, headers: { 'Content-Range': 'bytes */' + total } });
    const qc = q.getResponseCode();
    if (qc === 308) { const qh = q.getAllHeaders(); const qr = qh.Range || qh.range || ''; return { ok: true, done: false, next: qr ? Number(String(qr).split('-')[1]) + 1 : 0 }; }
    if (qc === 200 || qc === 201) return { ok: true, done: true, id: JSON.parse(q.getContentText()).id };
    return { ok: false, error: '드라이브 상태 확인 실패(' + qc + ')' };
  }
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (!(total > 0) || !(start >= 0) || !bytes.length || start + bytes.length > total) return { ok: false, error: '조각 범위가 이상해요' };
  const res = UrlFetchApp.fetch(url, {
    method: 'put', muteHttpExceptions: true, contentType: 'application/octet-stream', payload: bytes,
    headers: { 'Content-Range': 'bytes ' + start + '-' + (start + bytes.length - 1) + '/' + total }
  });
  const code = res.getResponseCode();
  if (code === 308) { const hh = res.getAllHeaders(); const r = hh.Range || hh.range || ''; return { ok: true, done: false, next: r ? Number(String(r).split('-')[1]) + 1 : 0 }; }
  if (code === 200 || code === 201) { const j = JSON.parse(res.getContentText()); return { ok: true, done: true, id: j.id }; }
  return { ok: false, error: '드라이브 조각 실패(' + code + ')' };
}

// 다 올라간 파일: 폴더 안인지 보고 «링크가 있는 사람 보기»로 바꾼다
function videoDone_(id) {
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, error: '파일 id가 이상해요' };
  const f = DriveApp.getFileById(id);
  if (!inFolder_(f)) return { ok: false, error: '집 찾기 영상 폴더의 파일이 아니에요' };
  let shared = true;
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { shared = false; }
  return { ok: true, id: id, name: f.getName(), size: f.getSize(), shared: shared };
}

function videoTrash_(id) {
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, error: '파일 id가 이상해요' };
  let f; try { f = DriveApp.getFileById(id); } catch (e) { return { ok: true, gone: true }; }
  if (!inFolder_(f)) return { ok: false, error: '집 찾기 영상 폴더의 파일이 아니에요' };
  f.setTrashed(true);
  return { ok: true };
}

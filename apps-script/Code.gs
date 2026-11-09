/**
 * 집 찾기 백엔드 (시트에 붙은 앱스 스크립트)
 * 시트 탭: 집 / 설정. 비밀번호는 스크립트 속성 HOUSE_KEY에 효니가 직접 넣는다(코드·레포에 넣지 않는다).
 * 배포: 배포 > 새 배포 > 웹 앱, 실행: 나, 액세스: 모든 사용자. 코드를 고치면 «배포 관리 > 새 버전»(주소 유지).
 * 지우기는 deleted=TRUE 표시만 한다(줄은 남는다). 정기 검색은 deleted·탈락 집을 다시 넣지 않는다.
 * 정기 검색(Claude)은 이 웹 앱이 아니라 구글 시트를 직접 읽고 써서 비밀번호가 필요 없다.
 */
const VERSION = 1;
// 새 칸은 맨 뒤에만 더한다(이미 있는 줄의 칸 위치가 밀리지 않게)
const COLS = ['id', 'name', 'kind', 'deal', 'station', 'walkMin', 'address', 'area', 'rooms', 'baths', 'deposit', 'rent', 'mgmt',
  'parking', 'parkingFee', 'moveIn', 'deadline', 'status', 'link', 'memo', 'images', 'source', 'createdAt', 'updatedAt', 'deleted'];
const NUM = ['walkMin', 'area', 'rooms', 'baths', 'deposit', 'rent', 'mgmt', 'parkingFee'];

function doGet() { return out_({ ok: true, app: 'house-hunt', hint: 'POST로 요청하세요' }); }

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
      case 'uncomment': return out_(withLock_(() => uncomment_(String(d.id || ''))));
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
  return sh;
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
  return { ok: true, v: VERSION, items: items, cond: cond, comments: comments_() };
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

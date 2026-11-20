// 범용판 만들기(2026-11-20): index.html(개인판) → my/index.html
// 쓰는 법: node tools/build-my.js   (개인판 index.html을 고친 뒤 범용판도 같이 바꾸려면 다시 돌린다)
// - 화면 코드는 개인판과 같고, my/local.js가 저장층(이 기기 저장)을 맡는다(index.html의 LOCAL 고리).
// - 개인 정보(동네·금액·이름·백엔드 주소)가 들어간 글자는 아래 표로 바꾸고, 마지막에 금지어 검사로 하나라도 남으면 멈춘다.
// - 바꿀 글자를 못 찾아도 멈춘다(개인판 문구가 바뀌었다는 뜻이니 표를 고친다).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let s = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");

function rep(a, b, all) {
  const c = s.split(a).length - 1;
  if (!c || (!all && c !== 1)) { console.error("✗ " + c + "번 맞음: " + a.slice(0, 90)); process.exit(1); }
  s = all ? s.split(a).join(b) : s.replace(a, () => b);
}
function repRe(re, b) { if (!re.test(s)) { console.error("✗ 못 찾음: " + re); process.exit(1); } s = s.replace(re, b); }

// 머리: 제목·설명·공유 미리보기·아이콘·manifest
rep('<meta name="robots" content="noindex">', "");
rep("<title>집 비교판</title>", "<title>집 비교판 (누구나 쓰는 판)</title>");
rep('<meta name="description" content="이사 갈 집 후보를 조건·가격·위치로 한눈에 비교하는 판">', '<meta name="description" content="이사 갈 집 후보를 조건·가격·위치로 한눈에 비교하는 판. 가입 없이 이 기기에 저장하고, 파일로 주고받아 둘이 같이 봐요.">');
rep('<meta property="og:title" content="집 비교판">', '<meta property="og:title" content="집 비교판 — 이사 갈 집 한눈에 비교">');
rep('<meta property="og:description" content="이사 갈 집 후보를 조건·가격·위치로 한눈에 비교하는 판">', '<meta property="og:description" content="가입 없이 쓰는 집 후보 비교판. 조건·월 부담·지도·의견을 한곳에.">');
rep('content="https://hyonnie-t.github.io/house-hunt/"', 'content="https://hyonnie-t.github.io/house-hunt/my/"');
rep('href="apple-touch-icon.png"', 'href="../apple-touch-icon.png"');
rep('href="icon-32.png"', 'href="../icon-32.png"');
rep('href="icon-192.png"', 'href="../icon-192.png"');
rep('src="icon-192.png"', 'src="../icon-192.png"');
rep('href: "vendor/leaflet/leaflet.css"', 'href: "../vendor/leaflet/leaflet.css"');
rep('src: "vendor/leaflet/leaflet.js"', 'src: "../vendor/leaflet/leaflet.js"');

// 저장층: my/local.js를 앱 코드보다 먼저 읽는다. 백엔드 주소는 지운다
rep('<script>\n(function () {\n  "use strict";', '<script src="local.js"></script>\n<script>\n(function () {\n  "use strict";');
repRe(/const API = "https:\/\/script\.google\.com\/macros\/s\/[^"]+";[^\n]*/, 'const API = ""; // 범용판은 서버 없음(my/local.js)');
repRe(/const DEFAULT_COND = LOCAL \? LOCAL\.defaultCond : \{[^\n]*\};/, "const DEFAULT_COND = LOCAL.defaultCond;");
// 기기 저장 이름을 개인판과 나눈다(같은 주소 hyonnie-t.github.io라 localStorage를 같이 씀)
rep('"hh_', '"hhmy_', true);
rep('"hb_sort"', '"hhmy_sort"', true);

// 화면 글자
repRe(/<p class="muted small">2인 · [^\n]*<\/p>/, '<p class="muted small">가입 없이 쓰는 이사 후보 비교판 · 기록은 이 기기에만 · 공고와 매물을 한 표에서</p>');
rep("«+ 매물 올리기»로 직접 찾은 집을 넣거나, 매일 아침 정기 검색이 찾은 매물(공고는 월·목)이 여기에 쌓여요.", "«+ 올리기»로 찾은 집을 넣어 보세요. 부동산 앱에서 «공유»로 복사한 글을 붙여넣으면 칸이 채워져요.");
repRe(/id="quickMsg">[^<]*/, 'id="quickMsg">읽은 값은 빈 칸에만 들어가요. 네이버 부동산은 링크 대신 매물 화면 글을 길게 눌러 복사해 붙여넣으면 채워져요.');
repRe(/id="addrMsg">[^<]*/, 'id="addrMsg">주소를 넣고 «주소로 찾기»를 누르면 지도 위치를 확인해요(OpenStreetMap). 도로명 주소가 가장 정확해요.');
rep(' + " 면적·보증금이 비면 내일 아침 클로드가 이 주소로 찾아 채워요."', ' + (r.found ? " 저장하면 지도에 보여요." : "")');
rep('"이미 적힌 칸은 그대로 뒀어요."', '"위치를 찾았어요."');
rep('else if (p.link && p.site !== "네이버") msg += " 빈 칸은 저장해 두면 매일 아침 클로드가 링크를 열어 채워요.";', "");
rep('if (p.nangok) msg += ', 'if (false) msg += ');
rep('<option value="dist">신대방역 가까운 순</option>', '<option value="dist">기준 장소 가까운 순</option>');
rep('<span><i class="lg-ref"></i>신대방역</span>', '<span><i class="lg-ref"></i>기준 장소</span>');
rep('placeholder="예: 신대방역 ○○빌라 3층"', 'placeholder="예: ○○역 ○○빌라 3층"');
rep('placeholder="예: 햇살집, 보라매 신축"', 'placeholder="예: 햇살집, 역 앞 신축"');
rep('placeholder="예: 관악구 신사동 ○○-○"', 'placeholder="예: ○○구 ○○로 12"');
rep('placeholder="예: 신대방역, 관악구 신사동"', 'placeholder="예: ○○역, ○○동"');
rep('placeholder="예: 신대방 ○○공인"', 'placeholder="예: ○○공인중개사"', true);
repRe(/<p class="hint full">보증금 최대는 «버팀목[^\n]*<\/p>/, '<p class="hint full">보증금 최대는 내 돈 + 받을 수 있는 대출로 잡아 보세요. 대출 금리를 넣으면 «월 부담»에 이자가 들어가요.</p>');
rep('"위치 서비스(카카오)에 연결하지 못했어요(" + GEO.err + "). 클로드에게 이 문구를 알려 주세요."', '"위치 검색(OpenStreetMap)에 연결하지 못했어요(" + GEO.err + "). 잠시 뒤 새로고침해 주세요."');
rep('"(주소가 없거나 번지가 없어요)"', '"(주소가 없거나 찾지 못했어요. 도로명 주소로 고쳐 보세요)"');
rep("<div class=\"gate-brand\"><img src=\"../icon-192.png\" alt=\"\" width=\"44\" height=\"44\"><div><b>집 찾기</b><div class=\"small muted\">둘이 같이 보는 이사 후보 비교판</div></div></div>", "<div class=\"gate-brand\"><img src=\"../icon-192.png\" alt=\"\" width=\"44\" height=\"44\"><div><b>집 찾기</b></div></div>");
rep("map.kakao.com/link", "map.kakao.com/link", true); // 키 없는 카카오맵 링크는 그대로 쓴다(확인용)

// 코드 주석·안 쓰는 글에 남은 개인 낱말을 일반 말로
const soft = (a, b) => { s = s.split(a).join(b); }; // 없어도 되는 바꾸기
soft("신대방역", "기준 장소");
soft("신대방", "○○");
soft("신림이랑", "○○이랑");
soft("보라매", "○○");
soft("관악구", "○○구");
soft("난곡", "○○");
soft("법원단지", "○○");
soft("영신연립", "○○");
soft("효니", "주인");
soft("클로드", "자동 정리");
soft("남자친구", "같이 보는 사람");
soft("2027-02-21", "");
soft("신사동", "○○동");
rep("setView([37.4875, 126.9131], 14)", "setView([37.5665, 126.978], 12)"); // 지도 처음 자리: 개인판 동네 대신 서울 가운데

// 금지어 검사: 하나라도 남으면 멈춘다
const BAN = [/신대방/, /신사동/, /37\.4875/,/관악/, /신림/, /보라매/, /난곡/, /효니/, /클로드/, /버팀목/, /남자친구/, /해링턴/, /2027-02/, /AKfycb/, /1USyz0/, /13jvApg/, /HOUSE_KEY/, /selfFunds: 8000/, /33000/, /plans\//];
const left = BAN.filter((re) => re.test(s));
if (left.length) { console.error("✗ 금지어가 남음: " + left.join(" ")); left.forEach((re) => { const i = s.search(re); console.error("   …" + s.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, " ") + "…"); }); process.exit(1); }

const head = "<!-- 이 파일은 tools/build-my.js가 index.html에서 만든다. 직접 고치지 말고 index.html·my/local.js를 고친 뒤 다시 만든다. -->\n";
fs.writeFileSync(path.join(root, "my", "index.html"), s.replace("<!doctype html>\n", "<!doctype html>\n" + head));
console.log("✓ my/index.html (" + Math.round(s.length / 1024) + "KB)");

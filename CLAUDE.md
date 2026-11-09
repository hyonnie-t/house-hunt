# 집 찾기 (house-hunt)

## 무엇인지
효니와 남자친구가 둘이 같이 보고 고치는 이사할 집 비교판(전세 만기 2027-02-21). 계정 없이 주소 + 비밀번호로 열고, 둘 다 집 정보·상태를 고칠 수 있다. 배포: https://hyonnie-t.github.io/house-hunt/ (GitHub Pages, 2026-11-09 만듦). 전에 쓰던 Claude 아티팩트 «집 비교판»(E24opJd4T5BYcKsF2PBok8)은 로그인이 필요해서 이 앱으로 옮겼다.

## 구조
- `index.html` 화면과 코드 전부(외부 라이브러리 없음, 글꼴만 구글 폰트). 데이터 층은 맨 아래 «저장소 연결»: 앱스 스크립트 웹 앱에 text/plain POST. 30초마다·탭에 돌아올 때 새로 읽는다. 마지막에 쓴 사람이 이긴다.
- `apps-script/Code.gs` 시트(`집 찾기 (백엔드)`, ID 1USyz0O6FGTJSzgwSZRsk8JJSAEzfB2QdNpDxFW3Lmy8)에 붙은 스크립트(ID 13jvApgSK23NG0thqS2_t9ts5i4KxkUyKH3y4KTsWOZdDYuzotSYPETIF, 편집기 파일명 «코드»). 탭 `집`·`설정`. 지우기는 `deleted`=TRUE 표시만 하고 줄은 남긴다.
- `plans/` 해링턴 평면도(상대 경로로 보여 줌). 사진 업로드는 아직 없다.

## 규칙
- 비밀번호는 스크립트 속성 `HOUSE_KEY`에 효니가 직접 넣는다. 코드·레포·답변·로그에 쓰지 않는다. 웹 앱 주소는 레포에 있어도 된다(비밀번호가 문이다).
- 정기 검색(예약 작업 house-search)은 웹 앱이 아니라 구글 시트를 직접 읽고 쓴다(구글 MCP `get_sheet_data`·`append_rows`·`update_cells`). 칸 순서는 `Code.gs`의 `COLS`와 같다. 새 칸은 맨 뒤에만 더한다. `deleted`가 TRUE이거나 `status`가 탈락인 집은 다시 넣지 않는다.
- 시트에 날짜를 쓰면 시트가 날짜로 바꾸는데, 스크립트가 읽을 때 `yyyy-MM-dd` 글자로 되돌린다.
- 의견(2026-11-09): 시트 탭 `의견`(id·itemId·who·text·at·deleted). 집 상세 창에서 둘이 이름+한 줄을 남기고 지울 수 있다(지우기는 deleted 표시). 목록에는 «의견 N» 배지만 보인다.
- 코드를 고치면 `Code.gs`를 먼저 고치고 편집기에 반영(`update_apps_script`, 파일명 «코드», 소스 전체를 넘긴다) → 새 버전 배포는 Claude가 한다: `~/claude-mcp/google-mcp/token-deploy.json`으로 Apps Script API `versions.create` 뒤 `deployments.update`(배포 ID = 웹 앱 주소의 /s/와 /exec 사이, 주소 유지). 2026-11-09 버전 2(의견·날짜 보정)로 올림.
- 화면 확인은 폰 375 · 태블릿 768/1180 · PC 1280 네 폭.

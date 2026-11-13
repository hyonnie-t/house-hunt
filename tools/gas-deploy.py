# 집 찾기 백엔드(앱스 스크립트)만 올리고 새 버전으로 배포한다("배포 관리 > 수정 > 새 버전"과 같은 일, 주소 그대로).
# 사용: python tools/gas-deploy.py check | push apps-script/Code.gs | deploy "설명" | rollback N
# 열쇠는 history26 gas_sync.py의 deploy_credentials()를 그대로 쓴다(내용은 출력하지 않는다). 책장 relay-deploy.py와 같은 방식.
import sys, json, time, urllib.request, importlib.util
from pathlib import Path
from googleapiclient.discovery import build

GS = Path(r"D:\OneDrive - 대영중학교\교사업무\웹앱\history26_backend\tools\gas_sync.py")
spec = importlib.util.spec_from_file_location("gas_sync", GS)
gs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gs)

SCRIPT_ID = "13jvApgSK23NG0thqS2_t9ts5i4KxkUyKH3y4KTsWOZdDYuzotSYPETIF"
DEPLOY_ID = "AKfycbxdNoRPF8Hg-9r_iZwVbhkvZijJMZcrpIJv92cUTmuBrwyCRkkiL7LUOAeWnnoDXaPw"
EXEC = f"https://script.google.com/macros/s/{DEPLOY_ID}/exec"
sys.stdout.reconfigure(encoding="utf-8")

creds = gs.deploy_credentials()
svc = build("script", "v1", credentials=creds, cache_discovery=False)
print("계정:", gs.current_account(creds))


def current():
    return svc.projects().deployments().get(scriptId=SCRIPT_ID, deploymentId=DEPLOY_ID).execute()


def smoke():
    # 비밀번호 없이 보는 위치 점검: 건수와 오류 코드만 온다(주소·좌표는 안 온다)
    with urllib.request.urlopen(f"{EXEC}?check=geo", timeout=120) as r:
        body = json.load(r)
    print("위치 점검:", json.dumps(body, ensure_ascii=False))
    return None if "count" in body or body.get("error") else "점검 응답이 이상하다"


def set_version(v, desc):
    svc.projects().deployments().update(
        scriptId=SCRIPT_ID, deploymentId=DEPLOY_ID,
        body={"deploymentConfig": {"scriptId": SCRIPT_ID, "versionNumber": v, "manifestFileName": "appsscript", "description": desc}},
    ).execute()
    for i in range(7):
        if i:
            time.sleep(5)
        if current()["deploymentConfig"].get("versionNumber") == v:
            return
    raise RuntimeError(f"30초 뒤에도 버전이 {v}이 아니다")


cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
d = current()
prev = d["deploymentConfig"].get("versionNumber")
print("지금 배포 버전:", prev)
files = svc.projects().getContent(scriptId=SCRIPT_ID).execute().get("files", [])
print("편집기 파일:", [f["name"] for f in files])

if cmd == "push":
    new_src = Path(sys.argv[2]).read_bytes().decode("utf-8").replace("\r\n", "\n")
    out = [dict(f, source=new_src) if f["name"] == "코드" else f for f in files]
    svc.projects().updateContent(scriptId=SCRIPT_ID, body={"files": out}).execute()
    print("편집기 «코드» 갱신:", len(new_src), "자")
elif cmd == "diff":
    # 편집기 «코드»와 레포 파일이 같은지(덮어쓰기 전에 남이 고친 게 없는지)
    ed = [f for f in files if f["name"] == "코드"][0]["source"].replace("\r\n", "\n")
    mine = Path(sys.argv[2]).read_bytes().decode("utf-8").replace("\r\n", "\n")
    print("같음" if ed == mine else f"다름: 편집기 {len(ed)}자 / 파일 {len(mine)}자")
elif cmd == "deploy":
    desc = sys.argv[2] if len(sys.argv) > 2 else "새 버전"
    v = svc.projects().versions().create(scriptId=SCRIPT_ID, body={"description": desc}).execute()["versionNumber"]
    print("새 버전", v, "만듦")
    try:
        set_version(v, f"{desc} prev={prev}")
        problem = smoke()
    except Exception as ex:
        problem = str(ex)
    if problem:
        print("문제:", problem, "→ 버전", prev, "로 되돌린다")
        set_version(prev, f"되돌림: 버전 {v} 문제")
        sys.exit("배포 실패, 되돌림")
    print(f"배포 완료: 버전 {prev} → {v}, 주소 그대로")
elif cmd == "smoke":
    smoke()
elif cmd == "rollback":
    set_version(int(sys.argv[2]), "되돌림")
    print("되돌림 완료")

# trialinsight-addon-sample-iframe

TrialInsight Addon 샘플의 **iframe 컨텐츠** (GitHub Pages · public).
myTrial 대역 호스트(`trialinsight-addon-sample-host`, Vercel)와 **다른 도메인**에서 로드되어,
호스트의 Insight 메뉴 안에 임베드된다.

## 동작
- `addon-bridge.js`가 **iframe 안(embed 모드)**임을 자동 감지 → 사이드바/탑바를 숨기고
  요청된 Insight 뷰(`?view=epro|monitoring|newsletter`)만 표시.
- 부모(myTrial)가 보내는 `postMessage({type:'TI_SESSION', projectId, userId})`를
  **origin 검증 후** 수신 → 상단 배너에 세션 표시. (백엔드/토큰/쿠키/env 전혀 없음)
- 신뢰할 부모 origin은 `addon-bridge.js`의 `HOST_ALLOWLIST`.

## 배포
GitHub Pages → `https://hgjo-nanum.github.io/trialinsight-addon-sample-iframe/`

## 파일
- `index.html` — 실제 Trial Insight UI (host와 동일 파일, 자산 base64 인라인)
- `addon-bridge.js` — 모드 자동감지 브릿지 (host repo와 동일)
- `Vol0*.pdf` — 뉴스레터 뷰용

전체 아키텍처는 host repo README 참고.

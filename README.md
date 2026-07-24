# trialinsight-addon-sample-iframe

TrialInsight Addon 샘플의 **iframe 컨텐츠** (GitHub Pages · public).
myTrial 흉내 호스트(`trialinsight-addon-sample-host`, Vercel)와 **다른 도메인**에서 로드되어
`postMessage`로만 세션 컨텍스트를 받고, bearer 토큰으로 호스트 API를 CORS 호출한다.

- 배포: GitHub Pages → `https://hgjo-nanum.github.io/trialinsight-addon-sample-iframe/`
- 부모(호스트) origin 화이트리스트: `index.html` 상단 `ALLOWED_PARENT_ORIGINS`
  → Vercel 배포 주소를 정확히 넣어야 컨텍스트를 수신함.

전체 아키텍처 설명은 host repo의 README 참고.

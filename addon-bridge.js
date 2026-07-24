/* ============================================================================
 * addon-bridge.js  (host repo / addon repo 공통 · 동일 파일)
 *
 * 하나의 실제 Trial Insight UI(index.html)를 두 역할로 자동 분기한다.
 *   - HOST  모드 (최상위 창, Vercel = myTrial 대역): 사이드바 "Insight" 클릭 시
 *            inline 패널 대신 "다른 도메인 iframe"을 띄우고, 세션(projectId/userId)만
 *            postMessage 로 전달한다.  ← myTrial 이 실전에서 해야 하는 유일한 코드.
 *   - EMBED 모드 (iframe 안, GitHub Pages = addon): 사이드바/탑바를 숨기고 해당
 *            Insight 패널만 보여주며, 부모(myTrial)에서 postMessage 로 오는 세션을
 *            origin 검증 후 수신한다.  백엔드/토큰/쿠키/env 전혀 불필요.
 *
 * 핵심: 실전에서 myTrial 에 요구하는 것은 "iframe 삽입 + 아래 TI_SESSION postMessage
 *       한 조각"뿐. 서버 환경변수/토큰 API 세팅을 요구하지 않는다.
 * ==========================================================================*/
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);

  // addon(iframe) 위치. 로컬 테스트는 ?addon=http://localhost:5173/ 로 override.
  var ADDON_URL = 'https://hgjo-nanum.github.io/trialinsight-addon-sample-iframe/';
  if (qs.get('addon')) ADDON_URL = qs.get('addon');
  var ADDON_ORIGIN = new URL(ADDON_URL, location.href).origin;

  // 신뢰할 부모(host) origin 화이트리스트. ?host= 로 로컬 origin 추가 가능.
  var HOST_ALLOWLIST = [
    'https://trialinsight-addon-sample-host.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  if (qs.get('host')) HOST_ALLOWLIST.push(qs.get('host'));

  var INSIGHT_KEYS = ['epro', 'monitoring', 'newsletter'];

  var embedded = false;
  try { embedded = (window.self !== window.top); } catch (e) { embedded = true; }

  if (embedded) initEmbed(); else initHost();

  /* ===================== EMBED 모드 (addon, iframe 내부) ==================== */
  function initEmbed() {
    document.documentElement.setAttribute('data-embed', '1');
    injectEmbedCss();
    var banner = makeBanner();

    // origin 검증된 세션 컨텍스트 수신
    window.addEventListener('message', function (e) {
      if (HOST_ALLOWLIST.indexOf(e.origin) === -1) return; // 화이트리스트 밖 무시
      var d = e.data || {};
      if (d.type === 'TI_SESSION') applySession(d, banner);
      else if (d.type === 'TI_VIEW') gotoView(d.view);
    });

    // 부모에 준비 완료 알림(내용 없는 핑이라 '*' 허용)
    try { window.parent.postMessage({ type: 'TI_ADDON_READY' }, '*'); } catch (e) {}

    gotoView(qs.get('view') || 'epro');
  }

  function gotoView(key) {
    if (INSIGHT_KEYS.indexOf(key) === -1) key = 'epro';
    var item = document.querySelector('.subnav-item[data-target="' + key + '"]');
    if (item) item.click(); // 원본 showPanel + 렌더 트리거
    // 숨겨진 패널에 그려진 차트를 실제 크기로 다시 그리도록 resize 유도
    setTimeout(fireResize, 60);
    setTimeout(fireResize, 300);
  }

  function applySession(ctx, banner) {
    // 실전에서는 이 projectId/userId 로 우리 addon 자체 데이터를 조회하면 됨.
    banner.querySelector('[data-proj]').textContent = ctx.projectId || '-';
    banner.querySelector('[data-user]').textContent = ctx.userId || '-';
    banner.setAttribute('data-ok', '1');
    // 실 서비스 느낌: 상단 계정 이메일도 수신값으로 교체(있으면)
    var email = document.querySelector('.account .email');
    if (email && ctx.userId) email.textContent = ctx.userId;
  }

  function makeBanner() {
    var b = document.createElement('div');
    b.id = 'ti-embed-banner';
    b.innerHTML =
      '<span class="dot"></span>' +
      '<b>myTrial 세션 수신됨</b>' +
      '<span class="sep">·</span>PROJECT <b data-proj>대기…</b>' +
      '<span class="sep">·</span>USER <b data-user>대기…</b>' +
      '<span class="via">postMessage · 다른 도메인 ' + location.origin + '</span>';
    var main = document.querySelector('main');
    if (main) main.insertBefore(b, main.firstChild);
    else document.body.insertBefore(b, document.body.firstChild);
    return b;
  }

  function injectEmbedCss() {
    addCss(
      'html[data-embed] .sidebar{display:none!important;}' +
      'html[data-embed] .shell{width:100%!important;margin-left:0!important;}' +
      'html[data-embed] .topbar{display:none!important;}' +
      'html[data-embed] .language,html[data-embed] [class*="lang"]{display:none!important;}' +
      'html[data-embed] .language::after{content:none!important;display:none!important;}' +
      'html[data-embed] main{padding-top:14px!important;}' +
      '#ti-embed-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;' +
        'font-size:12.5px;color:#334155;background:#EFF6FF;border:1px solid #BFDBFE;' +
        'border-radius:10px;padding:8px 12px;margin-bottom:16px;}' +
      '#ti-embed-banner b{color:#1e3a8a;font-weight:700;}' +
      '#ti-embed-banner .sep{color:#94a3b8;}' +
      '#ti-embed-banner .via{margin-left:auto;color:#64748b;font-size:11px;}' +
      '#ti-embed-banner .dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;flex:0 0 auto;}' +
      '#ti-embed-banner[data-ok="1"] .dot{background:#10b981;}'
    );
  }

  /* ===================== HOST 모드 (myTrial 대역, 최상위) ================== */
  function initHost() {
    // 1) myTrial처럼 세션 심기: sessionStorage(JS 읽기 가능) + HttpOnly 쿠키(서버)
    try {
      sessionStorage.setItem(':SYSTEM:PROJECT:ID', 'ST491');
      sessionStorage.setItem(':SYSTEM:USER:ID', 'hgjo@nanumspace.com');
    } catch (e) {}
    // HttpOnly JSESSIONID 쿠키 세팅(무-env, 실패해도 데모 동작엔 무관)
    fetch('/api/login', { method: 'POST' }).catch(function () {});

    // 2) 인사이트용 iframe 패널을 <main>에 추가
    var main = document.querySelector('main');
    var panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'panel-tiaddon';
    panel.innerHTML =
      '<div id="ti-frame-note">📊 Trial Insight는 <b>다른 도메인</b>(' + ADDON_ORIGIN +
      ')에서 iframe으로 로드됩니다. myTrial은 세션(projectId · userId)만 postMessage로 전달합니다.</div>' +
      '<iframe id="ti-addon-frame" title="Trial Insight Addon" src="about:blank"></iframe>';
    main.appendChild(panel);
    injectHostCss();

    var frame = panel.querySelector('#ti-addon-frame');

    function sendSession() {
      try {
        frame.contentWindow.postMessage({
          type: 'TI_SESSION',
          projectId: sessionStorage.getItem(':SYSTEM:PROJECT:ID'),
          userId: sessionStorage.getItem(':SYSTEM:USER:ID')
        }, ADDON_ORIGIN); // 민감 컨텍스트는 특정 origin으로만
      } catch (e) {}
    }
    frame.addEventListener('load', sendSession);
    window.addEventListener('message', function (e) {
      if (e.origin !== ADDON_ORIGIN) return;
      if (e.data && e.data.type === 'TI_ADDON_READY') sendSession();
    });

    // 3) showPanel 오버라이드: 인사이트 키는 inline 패널 대신 iframe으로 라우팅
    var origShowPanel = window.showPanel;
    window.showPanel = function (key) {
      if (INSIGHT_KEYS.indexOf(key) !== -1) {
        var panels = document.querySelectorAll('.panel');
        for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active');
        panel.classList.add('active');
        try { setContentTitle(key); } catch (e) {}
        try { tiUpdate.style.display = ''; } catch (e) {}
        loadView(key, frame);
      } else if (typeof origShowPanel === 'function') {
        origShowPanel(key);
      }
    };
  }

  function loadView(key, frame) {
    var sep = ADDON_URL.indexOf('?') === -1 ? '?' : '&';
    var url = ADDON_URL + sep + 'view=' + key;
    if (frame.getAttribute('data-view') !== key) {
      frame.setAttribute('data-view', key);
      frame.src = url; // load -> sendSession (frame load 리스너)
    } else {
      try {
        frame.contentWindow.postMessage({ type: 'TI_VIEW', view: key }, ADDON_ORIGIN);
        frame.contentWindow.postMessage({
          type: 'TI_SESSION',
          projectId: sessionStorage.getItem(':SYSTEM:PROJECT:ID'),
          userId: sessionStorage.getItem(':SYSTEM:USER:ID')
        }, ADDON_ORIGIN);
      } catch (e) {}
    }
  }

  function injectHostCss() {
    addCss(
      '#panel-tiaddon{display:none;}' +
      '#panel-tiaddon.active{display:flex!important;flex-direction:column;height:calc(100vh - 160px);min-height:520px;}' +
      '#ti-frame-note{font-size:12px;color:#475569;background:#F1F5F9;border:1px solid #E2E8F0;' +
        'border-radius:8px;padding:8px 12px;margin-bottom:12px;}' +
      '#ti-frame-note b{color:#1e293b;}' +
      '#ti-addon-frame{flex:1 1 auto;width:100%;border:1px solid #E5E7EB;border-radius:12px;background:#fff;}'
    );
  }

  /* ============================== 공통 유틸 =============================== */
  function addCss(css) {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }
  function fireResize() {
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }
})();

/* ============================================================================
 * addon-bridge.js  (host repo / addon repo 공통 · 동일 파일)
 *
 * 하나의 실제 Trial Insight UI(index.html)를 두 역할로 자동 분기한다.
 *
 *  - HOST  모드 (최상위 창, Vercel = myTrial 대역):
 *      · 세션(sessionStorage :SYSTEM:PROJECT:ID / USER:ID)과 쿠키(JSESSIONID) 보유
 *      · 사이드바 "Insight" 클릭 → 콘텐츠 영역을 "다른 도메인 iframe"만으로 채움
 *        (페이지 제목 / update 날짜 / 설명글 없음, 스크롤은 iframe 내부에서만)
 *      · iframe 에 세션 + 쿠키를 postMessage 로 전달
 *
 *  - EMBED 모드 (iframe 안, GitHub Pages = addon):
 *      · 사이드바 / 탑바 / 제목 / update 숨기고 Insight 뷰 콘텐츠만 표시
 *      · 부모에서 온 세션 + 쿠키를 origin 검증 후 "검증"(형식 확인). 별도 배너 표시 없음.
 *
 * 실전에서 myTrial 에 요구하는 것은 "iframe 삽입 + 아래 postMessage 한 조각"뿐.
 * (다른 도메인 iframe 은 부모 세션/쿠키에 직접 접근 불가 → postMessage 가 유일한 통로)
 * ==========================================================================*/
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);

  var ADDON_URL = 'https://hgjo-nanum.github.io/trialinsight-addon-sample-iframe/';
  if (qs.get('addon')) ADDON_URL = qs.get('addon');
  var ADDON_ORIGIN = new URL(ADDON_URL, location.href).origin;

  // 신뢰할 부모(host) origin 화이트리스트. ?host= 로 로컬 origin 추가 가능.
  var HOST_ALLOWLIST = [
    'https://trialinsight-addon-sample-host.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',   // 로컬 Spring Boot(Tomcat) 호스트
    'http://127.0.0.1:8080'
  ];
  if (qs.get('host')) HOST_ALLOWLIST.push(qs.get('host'));

  var INSIGHT_KEYS = ['epro', 'monitoring', 'newsletter'];

  var embedded = false;
  try { embedded = (window.self !== window.top); } catch (e) { embedded = true; }

  if (embedded) initEmbed(); else initHost();

  /* ===================== EMBED 모드 (addon, iframe 내부) ==================== */
  function initEmbed() {
    document.documentElement.setAttribute('data-embed', '1');
    injectEmbedCss(); // 사이드바/탑바/제목/update 숨김, 배너 없음

    // 부모(myTrial)가 보낸 세션 + 쿠키 수신 → origin 검증 → 형식 검증
    window.addEventListener('message', function (e) {
      if (HOST_ALLOWLIST.indexOf(e.origin) === -1) return; // 화이트리스트 밖 무시
      var d = e.data || {};
      if (d.type === 'TI_SESSION') validateSession(d, e.origin);
      else if (d.type === 'TI_VIEW') gotoView(d.view);
    });

    // 부모에 준비 완료 알림(내용 없는 핑이라 '*' 허용)
    try { window.parent.postMessage({ type: 'TI_ADDON_READY' }, '*'); } catch (e) {}

    gotoView(qs.get('view') || 'epro');
  }

  function validateSession(ctx, origin) {
    // 다른 도메인이므로 값은 postMessage 로만 도착. 여기서 검증한다.
    var okProj = /^[A-Za-z]{1,4}\d{1,8}$/.test(ctx.projectId || '');
    var okUser = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ctx.userId || '');
    var okSid  = /^[0-9A-Fa-f]{32}$/.test(ctx.jsessionid || '');
    var valid  = okProj && okUser && okSid;
    // 검증 결과 보관(실전에선 이 값들로 우리 addon 자체 데이터 조회/인증)
    window.__TI_SESSION = { ctx: ctx, origin: origin, valid: valid, checks: { okProj: okProj, okUser: okUser, okSid: okSid } };
    try {
      console.debug('[TI addon] 세션/쿠키 수신·형식검증',
        { origin: origin, projectId: ctx.projectId, userId: ctx.userId, jsessionid: ctx.jsessionid, valid: valid });
    } catch (e) {}
    // 서버측 검증(실전 Spring): 받은 JSESSIONID를 호스트 서버에 확인 요청.
    // (myTrial이 Spring이면 이 엔드포인트+CORS 필요. 없으면 조용히 넘어가고 postMessage만으로 동작.)
    if (ctx.apiBase) serverValidate(ctx);
  }

  function serverValidate(ctx) {
    try {
      fetch(ctx.apiBase + '/api/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsessionid: ctx.jsessionid })
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject('HTTP ' + r.status); })
        .then(function (d) {
          console.debug('[TI addon] 서버 세션검증 응답(Spring HttpSession)', d);
          if (window.__TI_SESSION) window.__TI_SESSION.server = d;
        })
        .catch(function (err) {
          console.debug('[TI addon] 서버 세션검증 미지원/실패 — postMessage 형식검증만으로 동작', String(err));
        });
    } catch (e) {}
  }

  function gotoView(key) {
    if (INSIGHT_KEYS.indexOf(key) === -1) key = 'epro';
    var item = document.querySelector('.subnav-item[data-target="' + key + '"]');
    if (item) item.click(); // 원본 showPanel + 렌더 트리거
    setTimeout(fireResize, 60);
    setTimeout(fireResize, 300);
  }

  function injectEmbedCss() {
    addCss(
      'html[data-embed] .sidebar{display:none!important;}' +
      'html[data-embed] .shell{width:100%!important;margin-left:0!important;}' +
      'html[data-embed] .topbar{display:none!important;}' +
      'html[data-embed] .language,html[data-embed] [class*="lang"]{display:none!important;}' +
      'html[data-embed] .language::after{content:none!important;display:none!important;}' +
      // 페이지 제목 / update 날짜 숨김 → 콘텐츠만
      'html[data-embed] .content-title,html[data-embed] #tiUpdate{display:none!important;}' +
      'html[data-embed] main{padding-top:16px!important;}'
    );
  }

  /* ===================== HOST 모드 (myTrial 대역, 최상위) ================== */
  function initHost() {
    // 1) myTrial처럼 세션 + 쿠키 보유
    var session = { projectId: 'ST491', userId: 'hgjo@nanumspace.com', jsessionid: null };
    try {
      sessionStorage.setItem(':SYSTEM:PROJECT:ID', session.projectId);
      sessionStorage.setItem(':SYSTEM:USER:ID', session.userId);
    } catch (e) {}
    // HttpOnly JSESSIONID 쿠키를 심고(브라우저 쿠키함), 그 값도 응답으로 받아 보관
    // → HttpOnly 라 JS 로 못 읽으므로, iframe 에 넘기려면 이렇게 값을 확보한다.
    var loginReady = fetch('/api/login', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) { session.jsessionid = d && d.jsessionid; })
      .catch(function () {});

    // 2) 인사이트용 iframe 패널 (iframe 만, 설명글 없음)
    var main = document.querySelector('main');
    var panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'panel-tiaddon';
    panel.innerHTML = '<iframe id="ti-addon-frame" title="Trial Insight Addon" src="about:blank"></iframe>';
    main.appendChild(panel);
    injectHostCss();

    var frame = panel.querySelector('#ti-addon-frame');

    function sendSession() {
      loginReady.then(function () {
        try {
          frame.contentWindow.postMessage({
            type: 'TI_SESSION',
            projectId: sessionStorage.getItem(':SYSTEM:PROJECT:ID'),
            userId: sessionStorage.getItem(':SYSTEM:USER:ID'),
            jsessionid: session.jsessionid,  // 쿠키(JSESSIONID) 값 전달
            apiBase: location.origin          // addon이 서버측 세션검증을 호출할 base
          }, ADDON_ORIGIN); // 민감 컨텍스트는 특정 origin 으로만
        } catch (e) {}
      });
    }
    frame.addEventListener('load', sendSession);
    window.addEventListener('message', function (e) {
      if (e.origin !== ADDON_ORIGIN) return;
      if (e.data && e.data.type === 'TI_ADDON_READY') sendSession();
    });

    // 3) showPanel 오버라이드: 인사이트 키는 iframe 만 노출(제목/update 숨김)
    var origShowPanel = window.showPanel;
    window.showPanel = function (key) {
      if (INSIGHT_KEYS.indexOf(key) !== -1) {
        var panels = document.querySelectorAll('.panel');
        for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active');
        panel.classList.add('active');
        main.setAttribute('data-ti-insight', '1'); // 제목/update 숨김 + 스크롤 잠금
        loadView(key, frame, sendSession);
      } else {
        main.removeAttribute('data-ti-insight');
        if (typeof origShowPanel === 'function') origShowPanel(key);
      }
    };
  }

  function loadView(key, frame, sendSession) {
    var sep = ADDON_URL.indexOf('?') === -1 ? '?' : '&';
    var url = ADDON_URL + sep + 'view=' + key;
    if (frame.getAttribute('data-view') !== key) {
      frame.setAttribute('data-view', key);
      frame.src = url; // load -> sendSession
    } else {
      try { frame.contentWindow.postMessage({ type: 'TI_VIEW', view: key }, new URL(url, location.href).origin); } catch (e) {}
      sendSession();
    }
  }

  function injectHostCss() {
    addCss(
      // 인사이트 화면: 콘텐츠 영역을 iframe 만으로. 제목/update 숨김, 호스트는 스크롤 없음
      'main[data-ti-insight]{display:flex!important;flex-direction:column;padding:0!important;overflow:hidden!important;}' +
      'main[data-ti-insight] .content-title,main[data-ti-insight] #tiUpdate{display:none!important;}' +
      '#panel-tiaddon{display:none;}' +
      'main[data-ti-insight] #panel-tiaddon{display:flex!important;flex:1 1 auto;min-height:0;flex-direction:column;}' +
      '#ti-addon-frame{flex:1 1 auto;width:100%;border:0;display:block;background:#fff;}'
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

/* SupaLite landing — i18n toggle, copy buttons, tabs, syntax highlight. */
(function () {
  'use strict';

  // Korean overrides. English lives inline in the HTML (captured at load),
  // so this dictionary only needs the `ko` translations. Keys = data-i18n.
  var KO = {
    'nav.features': '기능',
    'nav.benchmark': '벤치마크',
    'nav.compare': '비교',
    'nav.quickstart': '빠른 시작',
    'copy': '복사',

    'hero.title': '서버리스 지연 없는<br>Supabase 스타일 쿼리.',
    'hero.subtitle': 'SupaLite는 익숙한 Supabase 쿼리 빌더를 그대로 제공하는 가벼운 TypeScript PostgreSQL 클라이언트입니다 — 쿼리 빌더, RPC, 트랜잭션을 더 작은 풋프린트와 더 적은 오버헤드로 제공합니다.',
    'hero.cta.start': '시작하기',
    'hero.trust': '<a href="https://oqoq.ai">oqoq.ai</a> 프로덕션에서 사용 중.',

    'pitch.text': '쿼리 빌더 + RPC + 트랜잭션을 위한 <strong>슬림한 Supabase 클라이언트</strong>. 인증·스토리지·실시간 같은 풀 Supabase 기능이 필요하면 <code>supabase-js</code>를 쓰세요. SupaLite는 데이터베이스 계층을 빠르고 작게 유지하는 데 집중합니다.',

    'features.heading': '쿼리 계층에 필요한 모든 것',
    'features.card1.title': '타입 안전 쿼리 빌더',
    'features.card1.desc': 'Supabase 스타일 체이닝 API. TypeScript로 작성되어 테이블·뷰·함수·열거형까지 완전한 타입을 지원합니다.',
    'features.card2.title': '트랜잭션',
    'features.card2.desc': '안전하고 동시성에 강한 DB 트랜잭션 — Supabase 클라이언트는 지원하지 않습니다. 각 호출이 자체 풀 커넥션에서 실행됩니다.',
    'features.card3.title': 'RPC',
    'features.card3.desc': '저장 프로시저와 함수 호출. single(), maybeSingle() 결과 헬퍼와 스칼라 반환을 지원합니다.',
    'features.card4.title': '멀티 스키마',
    'features.card4.desc': '하나의 타입 지정 클라이언트로 여러 스키마를 넘나들며 작업하고, 뷰·함수·열거형까지 완전 타입을 지원합니다.',
    'features.card5.title': '성능',
    'features.card5.desc': '커넥션 풀링과 효율적인 SQL 생성. 당신과 Postgres 사이에 HTTP/PostgREST 직렬화 오버헤드가 없습니다.',
    'features.card6.title': '타입 생성 CLI',
    'features.card6.desc': '<code>supalite gen types</code>가 라이브 데이터베이스에서 타입을 생성합니다 — Supabase CLI 출력의 상위 집합이며, 필요하면 바이트 단위로 호환됩니다.',

    'compare.heading': 'Supabase처럼 읽힙니다',
    'compare.desc': '이미 아는 쿼리 사용성을 그대로. 같은 쿼리 — 활성 사용자를 최신순으로, 2페이지(페이지당 10개) — 를 각 도구로 표현했습니다.',

    'compat.heading': '지원 범위',
    'compat.supported.title': '지원',
    'compat.s1': 'Select, 필터, 정렬, 페이지네이션',
    'compat.s2': 'PostgREST 스타일 임베드 (<code>related(*)</code>, <code>!inner</code>)',
    'compat.s3': 'Insert, update, delete, upsert (<code>ignoreDuplicates</code> 포함)',
    'compat.s4': 'RPC (<code>single</code> / <code>maybeSingle</code> 포함)',
    'compat.s5': '동시성에 안전한 트랜잭션',
    'compat.s6': '멀티 스키마, 뷰, 함수, 열거형',
    'compat.notsupported.title': '미지원 — supabase-js 사용',
    'compat.n1': '인증 (Auth)',
    'compat.n2': '스토리지 (Storage)',
    'compat.n3': '실시간 (Realtime)',
    'compat.fit.title': 'SupaLite vs Prisma / Drizzle',
    'compat.fit.desc': '얇고 SQL에 가까운 쿼리 계층을 원할 때 — 특히 Supabase에서 이전할 때 — SupaLite를 선택하고 마이그레이션은 별도로 처리하세요. 스키마 우선 모델링과 내장 마이그레이션을 원하면 Prisma나 Drizzle을 선택하세요.',

    'quickstart.heading': '빠른 시작',
    'quickstart.step1': '설치',
    'quickstart.step2': '연결',
    'quickstart.step3': '쿼리 · 트랜잭션',
    'quickstart.step4': '데이터베이스에서 타입 생성',
    'quickstart.docs': '전체 문서 보기 →',

    'footer.tagline': 'Supabase 스타일 API를 가진 가벼운 TypeScript PostgreSQL 클라이언트.',

    'bench.heading': '얼마나 빠른가?',
    'bench.lead': '같은 데이터베이스, 같은 쿼리, 네 가지 클라이언트. supabase-js는 REST/PostgREST 세금을 내지만 직접 드라이버는 아닙니다 — supalite는 Supabase의 API를 유지하면서 그 속도를 따라잡습니다. 중앙값(p50) 지연, 낮을수록 좋음:',
    'bench.rest': 'REST',
    'bench.direct': '직접',
    'bench.note': '<strong>측정 방법:</strong> 로컬 Supabase 스택(PostgREST) vs 직접 Postgres, 같은 머신, 동일 쿼리(5개 컬럼, <code>limit(20)</code>), 워밍업 후 300회 인터리브 측정. 네트워크가 빠진 HTTP/PostgREST API 계층 오버헤드만 잰 수치로, 실제 클라우드 배포에서는 네트워크 홉과 콜드스타트가 더해져 차이가 더 벌어집니다. supalite·Drizzle·Prisma는 모두 Postgres에 직접 연결하므로 같은 티어입니다. repo의 <a href="https://github.com/genideas-labs/supalite/tree/main/benchmarks">benchmarks/</a>로 직접 재현해 보세요.',

    'bigint.heading': '그리고 64비트 ID가 살아남습니다',
    'bigint.lead': 'PostgreSQL <code>BIGINT</code>는 9,223,372,036,854,775,807까지 갑니다 — JavaScript의 안전 정수 한계(2<sup>53</sup>-1)를 넘죠. 각 클라이언트가 바로 그 값을 실제로 어떻게 반환하는지:',
    'bigint.th.client': '클라이언트',
    'bigint.th.returns': 'JS에서 반환된 값',
    'bigint.th.verdict': '결과',
    'bigint.t.number': '(number)',
    'bigint.t.bigint': '(BigInt)',
    'bigint.t.drizzle': 'number → 손상, 또는 BigInt → throw',
    'bigint.t.string': '(string)',
    'bigint.v.corrupt': '✗ 조용히 잘못된 값',
    'bigint.v.throws': '✗ JSON.stringify가 throw',
    'bigint.v.poison': '✗ 양쪽 다 함정',
    'bigint.v.safe': '✓ 정밀 & JSON-safe',
    'bigint.note': "supalite의 <code>bigintTransform</code> 기본값은 <code>'number-or-string'</code> — 안전하게 들어가면 number, 아니면 string으로 반환합니다. 그래서 정밀하면서 <em>동시에</em> <code>JSON.stringify</code>를 통과합니다. 설정 없이 기본 동작이며, 클라이언트별로 조정 가능합니다."
  };

  var COPY_LABEL = { en: 'Copy', ko: '복사' };
  var COPIED_LABEL = { en: 'Copied!', ko: '복사됨!' };

  var i18nEls = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
  // Capture the inline English as each element's fallback.
  i18nEls.forEach(function (el) { el.setAttribute('data-en', el.innerHTML); });

  function currentLang() { return document.documentElement.getAttribute('data-lang') || 'en'; }

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
    i18nEls.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (lang === 'ko' && KO[key] != null) el.innerHTML = KO[key];
      else el.innerHTML = el.getAttribute('data-en');
    });
    document.querySelectorAll('.lang__btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
    });
    try { localStorage.setItem('supalite-lang', lang); } catch (e) {}
  }

  // Initial language: saved choice, else browser preference, else English.
  var saved = null;
  try { saved = localStorage.getItem('supalite-lang'); } catch (e) {}
  var initial = saved || ((navigator.language || 'en').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en');
  applyLang(initial);

  document.querySelectorAll('.lang__btn').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
  });

  // Tabs (SupaLite / Prisma / Drizzle)
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.getAttribute('data-tab');
      var wrap = tab.closest('.tabs');
      wrap.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('is-active', t === tab); });
      wrap.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-panel') === name);
      });
    });
  });

  // Copy buttons: data-copy attribute wins, else the nearest code block.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      resolve();
    });
  }

  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      if (!text) {
        var box = btn.closest('.code');
        var code = box ? box.querySelector('code') : null;
        text = code ? code.innerText : '';
      }
      copyText(text).then(function () {
        var lang = currentLang();
        var span = btn.querySelector('[data-i18n="copy"]') || btn;
        btn.classList.add('is-copied');
        span.textContent = COPIED_LABEL[lang] || COPIED_LABEL.en;
        setTimeout(function () {
          btn.classList.remove('is-copied');
          span.textContent = COPY_LABEL[lang] || COPY_LABEL.en;
        }, 1400);
      });
    });
  });

  // Syntax highlighting
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach(function (el) { window.hljs.highlightElement(el); });
  }
})();

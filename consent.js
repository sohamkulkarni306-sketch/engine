/* =========================================================
   THE ENGINE — cookie consent banner
   Required for Google's EU User Consent Policy (tied to AdSense).
   Lightweight, no dependencies, matches site design tokens.
   ========================================================= */
(function () {
  var STORAGE_KEY = 'engine_cookie_consent';

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch (e) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function buildBanner() {
    var style = document.createElement('style');
    style.textContent = [
      '#engineCookieBanner{position:fixed;left:0;right:0;bottom:0;z-index:200;',
      'background:var(--ink,#14181C);color:var(--paper,#F3F1EA);',
      'border-top:1px solid var(--ignite,#FF3B1F);',
      'padding:18px 24px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;',
      'justify-content:space-between;font-family:var(--body,sans-serif);',
      'box-shadow:0 -12px 30px rgba(0,0,0,.25);',
      'transform:translateY(120%);transition:transform .35s ease;}',
      '#engineCookieBanner.show{transform:translateY(0);}',
      '#engineCookieBanner p{margin:0;font-size:.92rem;color:#D8D9D6;max-width:640px;}',
      '#engineCookieBanner a{color:var(--amber,#FFB100);text-decoration:underline;}',
      '#engineCookieBanner .ecb-actions{display:flex;gap:10px;flex-wrap:wrap;}',
      '#engineCookieBanner button{',
      'font-family:var(--display,sans-serif);font-weight:700;letter-spacing:.05em;',
      'text-transform:uppercase;font-size:.82rem;padding:10px 18px;border-radius:2px;',
      'cursor:pointer;border:1px solid transparent;transition:transform .15s;}',
      '#engineCookieBanner button:hover{transform:translateY(-2px);}',
      '#engineCookieBanner .ecb-accept{background:var(--ignite,#FF3B1F);color:#fff;border-color:var(--ignite,#FF3B1F);}',
      '#engineCookieBanner .ecb-decline{background:transparent;color:var(--paper,#F3F1EA);border-color:#454C54;}',
      '@media (max-width:640px){#engineCookieBanner{padding:16px;}}'
    ].join('');
    document.head.appendChild(style);

    var banner = document.createElement('div');
    banner.id = 'engineCookieBanner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p>This site uses cookies for basic analytics and to show ads through Google AdSense. ' +
      'See the <a href="privacy.html">Privacy Policy</a> or ' +
      '<a href="mailto:sohamkulkarni1005@gmail.com">email us</a> with questions.</p>' +
      '<div class="ecb-actions">' +
      '<button type="button" class="ecb-decline">Decline</button>' +
      '<button type="button" class="ecb-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('show'); });
    });

    banner.querySelector('.ecb-accept').addEventListener('click', function () {
      setConsent('accepted');
      hideBanner(banner);
    });
    banner.querySelector('.ecb-decline').addEventListener('click', function () {
      setConsent('declined');
      hideBanner(banner);
    });
  }

  function hideBanner(banner) {
    banner.classList.remove('show');
    setTimeout(function () { banner.remove(); }, 400);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!getConsent()) buildBanner();
  });
})();

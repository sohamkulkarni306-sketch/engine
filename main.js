// Shared behaviour across History / Evolution / Cars / Drift Lab pages
document.addEventListener('DOMContentLoaded', () => {

  // Highlight current page in nav
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  // Mobile hamburger nav
  const toggle = document.querySelector('.nav-toggle');
  const navlinks = document.querySelector('.navlinks');
  if (toggle && navlinks){
    toggle.addEventListener('click', () => {
      const open = navlinks.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navlinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navlinks.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Scroll progress rail
  const fill = document.querySelector('.progress-fill');
  function updateProgress(){
    if(!fill) return;
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const max = h.scrollHeight - h.clientHeight;
    fill.style.width = max > 0 ? (scrolled / max * 100) + '%' : '0%';
  }

  // Scroll-to-top button
  const toTop = document.querySelector('.to-top');
  function updateToTop(){
    if(!toTop) return;
    toTop.classList.toggle('show', (document.documentElement.scrollTop || window.scrollY) > 480);
  }
  if (toTop){
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  document.addEventListener('scroll', () => { updateProgress(); updateToTop(); }, { passive:true });
  updateProgress();
  updateToTop();

  // Reveal-on-scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting){
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal, .reveal-l, .reveal-r').forEach((el, idx) => {
    el.style.setProperty('--i', idx % 6);
    io.observe(el);
  });
});
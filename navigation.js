(() => {
  const toggle = document.querySelector('#menu-toggle');
  const nav = document.querySelector('#navigation');
  const close = () => {
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu de funcionalidades');
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu de funcionalidades' : 'Abrir menu de funcionalidades');
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('click', event => {
    if (!event.target.closest('aside')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {close(); toggle.focus();}
  });
  window.addEventListener('hashchange', close);
  const bottom = document.querySelector('#bottom-navigation');
  const updateBottom = () => {
    const page = location.hash.slice(1) || 'painel';
    bottom.querySelectorAll('[data-bottom-page]').forEach(link => {
      if (link.dataset.bottomPage === page) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  };
  window.addEventListener('hashchange', updateBottom);
  updateBottom();
  matchMedia('(max-width:700px)').addEventListener('change', close);
  new MutationObserver(() => { if (document.body.classList.contains('auth-mode') && document.body.classList.contains('menu-open')) close(); })
    .observe(document.body, {attributes:true, attributeFilter:['class']});
})();

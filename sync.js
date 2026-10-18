(() => {
  let inFlight = false;
  const status = document.querySelector('#sync-status');
  // Never replace a form or filters while the user is interacting with them.
  const editing = () => document.querySelector('dialog[open]') ||
    document.activeElement?.matches('input,select,textarea') ||
    document.querySelector('#transaction-form');
  async function sync() {
    if (!authenticated || busy || inFlight || document.hidden || navigator.onLine === false) return;
    const revision = dataRevision;
    inFlight = true;
    try {
      const next = await api('state');
      if (!authenticated || busy || revision !== dataRevision) return;
      if (JSON.stringify(next) !== JSON.stringify(db)) {
        db = next;
        if (!editing()) {
          const filters = [...document.querySelectorAll('.toolbar input,.toolbar select')].map(input => ({id:input.id,value:input.value}));
          render();
          for (const filter of filters) {
            const input = document.getElementById(filter.id);
            if (input) {input.value = filter.value; input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input')); input.dispatchEvent(new Event('change'));}
          }
        }
      }
      status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    } catch {
      if (authenticated) status.textContent = 'Sem sincronização. Tentando reconectar…';
    } finally {inFlight = false;}
  }
  setInterval(sync, 15000);
  window.addEventListener('focus', sync);
  window.addEventListener('online', sync);
  window.addEventListener('hashchange', sync);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) sync();});
})();

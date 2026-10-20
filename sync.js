(() => {
  let inFlight = false;
  let needsRender = false;
  const status = document.querySelector('#sync-status');
  function connectionState(state) {
    window.dispatchEvent(new CustomEvent('adega-connection',{detail:state}));
  }
  // Never replace a form or filters while the user is interacting with them.
  const editing = () => document.querySelector('dialog[open],details[open]') ||
    document.activeElement?.matches('input,select,textarea') ||
    document.querySelector('#transaction-form');
  async function sync() {
    if (navigator.onLine === false) {status.textContent='Offline — dados podem estar desatualizados.';connectionState('offline');return;}
    if (!authenticated || busy || inFlight || document.hidden) return;
    const revision = dataRevision;
    inFlight = true;
    try {
      const next = await api('state');
      if (!authenticated || busy || revision !== dataRevision) return;
      if (JSON.stringify(next) !== JSON.stringify(db)) {
        db = next;
        needsRender = true;
      }
      if (needsRender && !editing()) {
          const filters = [...document.querySelectorAll('.toolbar input,.toolbar select')].map(input => ({id:input.id,value:input.value}));
          render();
          for (const filter of filters) {
            const input = document.getElementById(filter.id);
            if (input) {input.value = filter.value; input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input')); input.dispatchEvent(new Event('change'));}
          }
          needsRender = false;
      }
      status.textContent = (needsRender?'Novos dados recebidos — conclua a interação para atualizar a tela. Última consulta: ':'Atualizado às ') + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      connectionState('online');
    } catch {
      if (authenticated) {status.textContent = 'Sem sincronização. Tentando reconectar…';connectionState(navigator.onLine===false?'offline':'unreachable');}
    } finally {inFlight = false;}
  }
  setInterval(sync, 15000);
  window.addEventListener('focus', sync);
  window.addEventListener('online', sync);
  window.addEventListener('offline',sync);
  window.addEventListener('hashchange', sync);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) sync();});
})();

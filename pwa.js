(() => {
  let installPrompt;
  const button = document.querySelector('#install-app');
  const help = document.querySelector('#install-help');
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const update = () => { button.hidden = installed(); };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; update();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; button.hidden = true; help.close(); });
  button.addEventListener('click', async () => {
    if (!installPrompt) { help.showModal(); return; }
    button.disabled = true;
    try { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; }
    catch { help.showModal(); }
    finally { button.disabled = false; }
  });
  document.querySelector('#close-install-help').onclick = () => help.close();
  const status = document.querySelector('#connection-status');
  const connection = () => { status.hidden = navigator.onLine; };
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);
  connection(); update();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* Site remains usable without installation. */ });
  });
})();

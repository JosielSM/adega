(() => {
  const root = document.querySelector('#account-tools');
  const toggle = document.querySelector('#profile-toggle');
  const menu = document.querySelector('#profile-menu');
  const dialog = document.querySelector('#company-settings');
  const form = document.querySelector('#company-form');
  const preview = document.querySelector('#company-preview');
  const feedback = document.querySelector('#company-feedback');
  let profile = null, draftLogo = '', loading = false, reading = false;
  const closeMenu = () => {menu.hidden = true; toggle.setAttribute('aria-expanded','false');};
  function paint(data) {
    document.querySelector('#account-email').textContent = data?.email || 'Carregando conta…';
    document.querySelector('#account-name').textContent = data?.companyName || 'Minha adega';
    document.querySelector('#profile-initial').textContent = (data?.companyName || data?.email || 'A').slice(0,1).toUpperCase();
    document.querySelector('#company-brand-name').textContent = data?.companyName || 'Adega';
    document.querySelector('#company-brand-logo').src = data?.logo || 'assets/logo.svg';
  }
  async function load() {
    if (loading || document.body.classList.contains('auth-mode')) return;
    loading = true;
    try {profile = await api('profile'); paint(profile);}
    catch(error) {if (!document.body.classList.contains('auth-mode')) document.querySelector('#account-email').textContent = error.message;}
    finally {loading = false;}
  }
  toggle.onclick = () => {menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded',String(!menu.hidden)); if (!profile) load();};
  document.addEventListener('click', event => {if (!root.contains(event.target)) closeMenu();});
  document.addEventListener('keydown', event => {if (event.key === 'Escape' && !menu.hidden) {closeMenu(); toggle.focus();}});
  document.querySelector('#open-company-settings').onclick = async () => {
    closeMenu(); if (!profile) await load(); if (!profile) return;
    form.elements.companyName.value = profile.companyName; draftLogo = profile.logo;
    preview.src = draftLogo || 'assets/logo.svg'; feedback.textContent = ''; form.elements.logo.value = ''; dialog.showModal();
  };
  document.querySelector('#close-company-settings').onclick = () => dialog.close();
  document.querySelector('#profile-signout').onclick = () => {closeMenu(); document.querySelector('#logout').click();};
  form.elements.logo.onchange = async () => {
    const file = form.elements.logo.files[0]; if (!file) return;
    feedback.textContent = ''; reading = true; form.querySelector('[type=submit]').disabled = true;
    const generation = sessionGeneration;
    let bitmap;
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5*1024*1024) throw Error('Escolha PNG, JPG ou WebP de até 5 MB.');
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
      const context = canvas.getContext('2d'); const scale = Math.min(192/bitmap.width,192/bitmap.height);
      context.drawImage(bitmap,(192-bitmap.width*scale)/2,(192-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);
      const logo = canvas.toDataURL('image/png');
      if (logo.length > 65536) throw Error('A imagem ficou muito detalhada. Escolha uma logo mais simples.');
      if (generation !== sessionGeneration) return;
      draftLogo = logo; preview.src = logo;
    } catch(error) {feedback.textContent = error.message || 'Não foi possível abrir a imagem.';}
    finally {bitmap?.close(); reading = false; form.querySelector('[type=submit]').disabled = false;}
  };
  document.querySelector('#remove-company-logo').onclick = () => {draftLogo = ''; preview.src = 'assets/logo.svg'; form.elements.logo.value = '';};
  form.onsubmit = async event => {
    event.preventDefault(); if (reading) return;
    const button = form.querySelector('[type=submit]'); button.disabled = true; button.textContent = 'Salvando…'; feedback.textContent = '';
    try {profile = await api('profile',{companyName:form.elements.companyName.value,logo:draftLogo}); paint(profile); dialog.close(); toast('Identidade da sua empresa atualizada.');}
    catch(error) {feedback.textContent = error.message;}
    finally {button.disabled = false; button.textContent = 'Salvar alterações';}
  };
  let wasAuthenticated = false;
  function sync() {
    const active = !document.body.classList.contains('auth-mode');
    if (!active) {profile = null; paint(null); closeMenu(); dialog.close();}
    if (active && !wasAuthenticated) load();
    wasAuthenticated = active;
  }
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']}); sync();
})();

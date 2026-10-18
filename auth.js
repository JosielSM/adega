'use strict';
(() => {
  const root = document.querySelector('#auth-root');
  const eye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const google = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.7 2.9-4.2 2.9-7.4Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H2.9v2.7A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.3 13.7a6 6 0 0 1 0-3.4V7.6H2.9a10 10 0 0 0 0 8.8Z"/><path fill="#ea4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.6l3.4 2.7c.8-2.4 3.1-4.2 5.7-4.2Z"/></svg>';
  const rules = [ ['length','Pelo menos 8 caracteres',p=>p.length>=8], ['letters','Letras maiúsculas e minúsculas',p=>/[a-z]/.test(p)&&/[A-Z]/.test(p)], ['number','Pelo menos um número',p=>/\d/.test(p)], ['symbol','Pelo menos um símbolo',p=>/[^\w\s]|_/.test(p)] ];
  root.addEventListener('click',event=>{if(pending&&event.target.closest('a'))event.preventDefault();});
  let view = 'login';
  let pending = false;
  
  const titles = {login:['Bom te ver por aqui.','Entre para cuidar da sua adega.'],cadastro:['Seu próximo passo começa aqui.','Crie sua conta com e-mail e senha.'],recuperar:['Vamos recuperar seu acesso.','Enviaremos um link para você criar uma nova senha.'],redefinir:['Uma nova senha, um novo começo.','Escolha uma senha segura para sua conta.']};
  function passwordField() {
    return `<label for="auth-password">${view==='redefinir'?'Nova senha':'Senha'}</label><div class="password-control"><input id="auth-password" name="password" type="password" autocomplete="${view==='login'?'current-password':'new-password'}" required ${view==='login'?'':'minlength="8" maxlength="128" aria-describedby="password-rules"'} placeholder="${view==='login'?'Sua senha':'Crie uma senha segura'}"><button type="button" class="password-toggle" aria-label="Mostrar senha" aria-pressed="false">${eye}</button></div>`;
  }
  function feedback(message, success = false) {
    const box = root.querySelector('#auth-feedback');
    if (!box) return;
    box.textContent = message;
    box.className = `auth-feedback ${success?'success':'error'}`;
    box.hidden = !message;
  }
  function setPending(value, label) {
    pending = value;
    root.classList.toggle('auth-pending',value);
    root.querySelectorAll('button').forEach(button=>button.disabled=value);
    const submit = root.querySelector('#auth-submit');
    if (submit) { submit.setAttribute('aria-busy',String(value)); submit.innerHTML = value ? `<span class="auth-spinner" aria-hidden="true"></span>${label}` : submit.dataset.label; }
  }
  function show(message = '') {
    const hash = location.hash.slice(1);
    view = ['cadastro','recuperar','redefinir'].includes(hash)?hash:'login';
    const [title,subtitle] = titles[view];
    const signup = view==='cadastro', reset = view==='redefinir', recovery = view==='recuperar';
    const label = {login:'Entrar na Adega',cadastro:'Criar minha conta',recuperar:'Enviar link de recuperação',redefinir:'Salvar nova senha'}[view];
    root.innerHTML = `<div class="auth-story"><a class="auth-brand" href="#login"><img src="assets/logo.svg" alt="" width="46" height="46"><span>Adega<span class="logo-dot">.</span></span></a><div class="auth-story-copy"><span class="auth-overline">CADA GARRAFA. CADA VENDA. CADA CONQUISTA.</span><h1>Seu negócio<br>merece um<br><em>bom controle.</em></h1><p>Da primeira entrada ao último brinde.<br>Organize sua adega e veja seu negócio crescer.</p><div class="auth-story-line"></div><small>GESTÃO DE BEBIDAS, DO SEU JEITO.</small></div><span class="auth-story-foot">Mais clareza para decidir. Mais tempo para crescer.</span></div><div class="auth-panel"><div class="auth-box"><a href="#login" class="auth-mobile-brand"><img src="assets/logo.svg" width="40" height="40" alt="Logo Adega"><b>Adega.</b></a><span class="auth-overline">BEM-VINDO À ADEGA</span><h2>${title}</h2><p class="auth-subtitle">${subtitle}</p>${!recovery&&!reset?`<div class="auth-tabs" role="group" aria-label="Acesso"><a href="#login" ${!signup?'aria-current="page"':''}>Entrar</a><a href="#cadastro" ${signup?'aria-current="page"':''}>Criar conta</a></div><button class="google-button" type="button" id="google-login">${google}<span>Continuar com Google</span></button><div class="auth-divider"><span>ou use seu e-mail</span></div>`:''}<form id="access-form">${!reset?'<label for="auth-email">E-mail de acesso</label><input id="auth-email" name="email" type="email" autocomplete="username" required maxlength="254" placeholder="voce@exemplo.com">':''}${!recovery?passwordField():''}${signup||reset?`<div class="password-strength" aria-hidden="true"><span></span><span></span><span></span><span></span></div><ul id="password-rules" aria-live="polite">${rules.map(([key,text])=>`<li data-rule="${key}"><span aria-hidden="true">○</span> ${text}</li>`).join('')}</ul>`:''}${view==='login'?'<a class="forgot-link" href="#recuperar">Esqueci minha senha</a>':''}<p id="auth-feedback" class="auth-feedback" role="status" aria-live="polite" hidden></p><button id="auth-submit" class="auth-submit" type="submit" data-label="${label}">${label}</button></form><p class="auth-switch">${view==='login'?'Ainda não tem conta? <a href="#cadastro">Crie sua conta</a>':signup?'Já tem uma conta? <a href="#login">Entre aqui</a>':'Lembrou sua senha? <a href="#login">Voltar para o login</a>'}</p><p class="auth-security"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Seu acesso protegido. Seus dados organizados.</p></div><p class="auth-copyright">Adega · Gestão de bebidas</p></div>`;
    if (message && !/Entre para/.test(message)) feedback(message);
    const password = root.querySelector('#auth-password');
    root.querySelector('.password-toggle')?.addEventListener('click', e=>{
      const button=e.currentTarget, visible=password.type==='password';
      password.type=visible?'text':'password';
      button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
      button.setAttribute('aria-pressed',String(visible));
    });
    if (signup || reset) password.addEventListener('input',()=>{
      let passed=0;
      for (const [key,,check] of rules) { const ok=check(password.value); passed+=Number(ok); const item=root.querySelector(`[data-rule="${key}"]`); item.classList.toggle('met',ok); item.querySelector('span').textContent=ok?'✓':'○'; }
      root.querySelectorAll('.password-strength span').forEach((bar,i)=>bar.classList.toggle('filled',i<passed));
      password.setCustomValidity(passed===rules.length?'':'Sua senha precisa atender aos quatro requisitos abaixo.');
    });
    root.querySelector('#google-login')?.addEventListener('click',async()=>{
      if (pending) return;
      setPending(true,'Conectando…');
      const button=root.querySelector('#google-login');button.querySelector('span').textContent='Conectando ao Google…';
      try { const result=await api('auth/google',{}); location.assign(result.url); }
      catch(error){feedback(error.message);setPending(false);button.querySelector('span').textContent='Continuar com Google';}
    });
    root.querySelector('#access-form').onsubmit=async e=>{
      e.preventDefault(); if(pending)return;
      if ((signup||reset)&&!rules.every(([, ,check])=>check(password.value))) {feedback('Sua senha precisa atender aos quatro requisitos.');return;}
      const data={};if(!reset)data.email=e.target.elements.email.value.trim();if(!recovery)data.password=password.value;
      feedback('');setPending(true,{login:'Entrando…',cadastro:'Criando sua conta…',recuperar:'Enviando link…',redefinir:'Salvando senha…'}[view]);
      try {
        const endpoint={login:'login',cadastro:'auth/signup',recuperar:'auth/recover',redefinir:'auth/password'}[view];
        const result=await api(endpoint,data);
        if (view==='login'||result.authenticated) {
          db=await api('state');authenticated=true;location.hash='painel';render();toast(view==='redefinir'?'Senha atualizada. Bem-vindo à Adega!':'Acesso confirmado. Bem-vindo à Adega!');
        } else {feedback(result.message,true);e.target.reset(); if(password)password.dispatchEvent(new Event('input'));}
      } catch(error){feedback(error.message);} finally {setPending(false);}
    };
    const query=new URLSearchParams(location.search);
    if(query.has('auth_error')){feedback(query.get('auth_error'));history.replaceState(null,'',location.pathname+location.hash);}
    if(query.get('confirmed')==='1'){feedback('E-mail confirmado. Entre para acessar sua conta.',true);history.replaceState(null,'',location.pathname+location.hash);}
  }
  window.AdegaAuth={show};
})();

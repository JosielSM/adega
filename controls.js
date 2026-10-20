// Shared Adega pickers: the original controls remain the form's source of truth.
(() => {
  const bindings=new Map();
  const picker=document.createElement('dialog');picker.className='adega-picker';
  picker.innerHTML='<div class="picker-heading"><h2 id="picker-title">Selecionar</h2><button type="button" class="picker-close" aria-label="Fechar seleção">×</button></div><input class="picker-search" type="search" placeholder="Buscar opção…" aria-label="Buscar opção"><div class="picker-options"></div>';
  picker.setAttribute('aria-labelledby','picker-title');document.body.append(picker);
  const title=picker.querySelector('h2'),search=picker.querySelector('input'),options=picker.querySelector('.picker-options');
  let active=null,month=new Date();
  function label(control){return control.getAttribute('aria-label')||control.labels?.[0]?.childNodes[0]?.textContent?.trim()||'Selecionar';}
  function sync(control,button){
    const text=control.tagName==='SELECT'?control.selectedOptions[0]?.textContent||'Selecione':control.value?new Date(control.value+'T12:00:00').toLocaleDateString('pt-BR'):'Selecionar data';
    if(button.querySelector('span').textContent!==text)button.querySelector('span').textContent=text;
    if(button.disabled!==control.disabled)button.disabled=control.disabled;button.setAttribute('aria-label',label(control)+': '+text);
    button.setAttribute('aria-required',String(control.required));
  }
  function choose(value){
    if(!active?.isConnected)return picker.close();
    active.value=value;active.setCustomValidity('');
    active.dispatchEvent(new Event('input',{bubbles:true}));active.dispatchEvent(new Event('change',{bubbles:true}));
    const button=bindings.get(active);if(button)sync(active,button);picker.close();
  }
  function drawOptions(){
    options.replaceChildren();
    if(!active?.isConnected){picker.close();return;}
    const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    for(const option of active.options){
      if(!option.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query))continue;
      const button=document.createElement('button');button.type='button';button.className='picker-option';
      button.textContent=option.textContent;button.disabled=option.disabled||option.parentElement.disabled;
      button.setAttribute('aria-pressed',String(option.selected));
      if(option.selected){const check=document.createElement('span');check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(check);}
      button.onclick=()=>choose(option.value);options.append(button);
    }
    if(!options.children.length){const empty=document.createElement('p');empty.className='picker-empty';empty.textContent='Nenhuma opção encontrada. Tente outro nome.';options.append(empty);}
  }
  function drawCalendar(){
    options.replaceChildren();
    const heading=document.createElement('div');heading.className='calendar-heading';
    const previous=document.createElement('button'),next=document.createElement('button'),caption=document.createElement('strong');
    previous.type=next.type='button';previous.textContent='‹';next.textContent='›';previous.setAttribute('aria-label','Mês anterior');next.setAttribute('aria-label','Próximo mês');
    caption.textContent=month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    previous.onclick=()=>{month.setMonth(month.getMonth()-1);drawCalendar();};next.onclick=()=>{month.setMonth(month.getMonth()+1);drawCalendar();};
    heading.append(previous,caption,next);options.append(heading);
    const grid=document.createElement('div');grid.className='calendar-grid';
    for(const day of ['D','S','T','Q','Q','S','S']){const span=document.createElement('span');span.textContent=day;span.setAttribute('aria-hidden','true');grid.append(span);}
    const year=month.getFullYear(),index=month.getMonth(),offset=new Date(year,index,1).getDay(),days=new Date(year,index+1,0).getDate();
    for(let i=0;i<offset;i++)grid.append(document.createElement('span'));
    for(let day=1;day<=days;day++){
      const value=`${year}-${String(index+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const button=document.createElement('button');button.type='button';button.textContent=day;
      button.setAttribute('aria-label',new Date(year,index,day).toLocaleDateString('pt-BR',{dateStyle:'full'}));
      button.setAttribute('aria-pressed',String(active.value===value));button.disabled=!!((active.min&&value<active.min)||(active.max&&value>active.max));button.onclick=()=>choose(value);grid.append(button);
    }
    options.append(grid);const clear=document.createElement('button');clear.type='button';clear.className='picker-option';clear.textContent='Limpar data';clear.onclick=()=>choose('');options.append(clear);
  }
  function open(control){
    active=control;const button=bindings.get(control);title.textContent=label(control);search.value='';search.hidden=control.type==='date';
    button.setAttribute('aria-expanded','true');
    if(control.type==='date'){month=new Date((control.value||new Date().toLocaleDateString('en-CA'))+'T12:00:00');if(Number.isNaN(month.getTime()))month=new Date();month.setDate(1);drawCalendar();}else drawOptions();
    picker.showModal();if(!search.hidden)search.focus();
  }
  picker.querySelector('.picker-close').onclick=()=>picker.close();
  picker.addEventListener('click',event=>{if(event.target===picker){const rect=picker.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)picker.close();}});
  picker.addEventListener('close',()=>{const button=bindings.get(active);button?.setAttribute('aria-expanded','false');if(button?.isConnected)button.focus();active=null;});
  search.oninput=drawOptions;
  picker.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||active?.type==='date')return;
    const buttons=[...options.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
    event.preventDefault();const index=buttons.indexOf(document.activeElement);const target=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;buttons[target].focus();
  });
  function enhance(){
    for(const [control,button] of bindings){if(!control.isConnected){if(active===control&&picker.open)picker.close();bindings.delete(control);}else sync(control,button);}
    for(const control of document.querySelectorAll('select,input[type=date]')){
      if(bindings.has(control))continue;
      const button=document.createElement('button');button.type='button';button.className='adega-select';button.innerHTML='<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
      button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
      control.classList.add('adega-native-control');control.tabIndex=-1;control.setAttribute('aria-hidden','true');control.after(button);bindings.set(control,button);sync(control,button);
      button.onclick=()=>open(control);control.addEventListener('change',()=>sync(control,button));
      control.addEventListener('invalid',event=>{event.preventDefault();button.setAttribute('aria-invalid','true');open(control);});
      control.addEventListener('change',()=>button.removeAttribute('aria-invalid'));
    }
  }
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});enhance();
})();

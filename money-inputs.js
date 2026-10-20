// The numeric control remains the canonical form value; the visible field uses BRL.
function moneyDigits(value){return String(value).replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,12);}
function moneyFromDigits(value){const digits=moneyDigits(value);return digits?(Number(digits)/100).toFixed(2):'';}
function moneyDisplay(value){return value===''?'':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));}
if(typeof document!=='undefined')(()=>{
 const bindings=new Map();
 function sync(source,view){
  if(view.dataset.canonical!==source.value){view.value=moneyDisplay(source.value);view.dataset.canonical=source.value;}
  if(view.disabled!==source.disabled)view.disabled=source.disabled;
  view.setAttribute('aria-label',source.labels?.[0]?.childNodes[0]?.textContent?.trim()||source.labels?.[0]?.textContent.trim()||'Valor em reais');
 }
 function enhance(){
  for(const [source,view] of bindings){if(!source.isConnected)bindings.delete(source);else sync(source,view);}
  for(const source of document.querySelectorAll('input[type=number][name=price],input[type=number][name=purchase_cost],input[type=number][name=pack_price]')){
   if(bindings.has(source))continue;
   const view=document.createElement('input');view.type='text';view.inputMode='numeric';view.placeholder='R$ 0,00';view.autocomplete='off';view.className='money-mask';
   const error=document.createElement('small');error.className='money-input-error';error.hidden=true;error.id='money-error-'+crypto.randomUUID();view.setAttribute('aria-describedby',error.id);
   source.classList.add('adega-native-control');source.tabIndex=-1;source.setAttribute('aria-hidden','true');source.after(view,error);bindings.set(source,view);sync(source,view);
   function change(value){
    source.value=value;view.value=moneyDisplay(source.value);view.dataset.canonical=source.value;error.hidden=true;view.removeAttribute('aria-invalid');
    source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}));
   }
   view.addEventListener('input',()=>change(moneyFromDigits(view.value)));
   view.addEventListener('paste',event=>{
    const text=event.clipboardData?.getData('text')?.trim();if(!text)return;
    event.preventDefault();let number=text.replace(/R\$|\s/g,'');
    if(number.includes(','))number=number.replace(/\./g,'').replace(',','.');
    const value=Number(number);if(Number.isFinite(value)&&value>=0)change(value.toFixed(2));
   });
   source.addEventListener('invalid',event=>{event.preventDefault();error.textContent=source.validity.valueMissing?'Informe o valor em reais.':'Informe um valor válido'+(Number(source.min)>0?' a partir de '+moneyDisplay(source.min):'')+'.';error.hidden=false;view.setAttribute('aria-invalid','true');view.focus();});
   source.addEventListener('change',()=>sync(source,view));
  }
 }
 new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});enhance();
})();

import {orderMessage,reconcileCart,catalogVariants,cartCapacity,setCartQuantity} from './cart.js';
let products=[],storeName='',whatsapp='',available=false;
const cart=new Map();
const status=document.querySelector('#catalog-status'),retry=document.querySelector('#catalog-retry');
const search=document.querySelector('#catalog-search'),category=document.querySelector('#catalog-category');
const dialog=document.querySelector('#cart-dialog'),feedback=document.querySelector('#cart-feedback');
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
function node(tag,text,cls=''){const element=document.createElement(tag);element.textContent=text;element.className=cls;return element;}
function change(product,delta){return setQuantity(product,(cart.get(product.id)?.quantity||0)+delta);}
function setQuantity(product,quantity){
 if(!setCartQuantity(cart,product,quantity)){feedback.textContent='Confira a quantidade disponível. Unidades e embalagens usam o mesmo estoque.';status.textContent=feedback.textContent;return false;}
 feedback.textContent='';renderCart();return true;
}
function renderCart(){
 const root=document.querySelector('#cart-items');root.replaceChildren();let total=0,count=0;
 for(const item of cart.values()){
  total+=Math.round(item.price*100)*item.quantity;count+=item.quantity;
  const row=node('div','','cart-item');const info=node('div','');info.append(node('strong',item.name),node('p',money(item.price)+(item.units>1?' por embalagem':' por unidade'),'note'));row.append(info);
  const controls=node('div','','quantity');
  for(const [label,text,delta] of [['Diminuir quantidade de ','−',-1],['Aumentar quantidade de ','+',1]]){const button=node('button',text);button.type='button';button.setAttribute('aria-label',label+item.name);button.onclick=()=>change(item,delta);if(delta===1)button.disabled=item.quantity>=cartCapacity(cart,item);controls.append(button);if(delta===-1){const input=node('input','');input.type='number';input.inputMode='numeric';input.min='1';input.max=String(cartCapacity(cart,item));input.step='1';input.value=String(item.quantity);input.setAttribute('aria-label','Quantidade de '+item.name);input.onchange=()=>{if(!input.value||!setQuantity(item,Number(input.value))){input.value=String(cart.get(item.id)?.quantity||item.quantity);}};controls.append(input);}}
  const remove=node('button','Remover','remove-item');remove.onclick=()=>{cart.delete(item.id);renderCart();};remove.setAttribute('aria-label','Remover '+item.name);row.append(controls,remove);root.append(row);
 }
 if(!count)root.append(node('p','Seu carrinho está vazio. Escolha uma bebida no catálogo.'));
 document.querySelector('#cart-total').textContent='Total estimado: '+money(total/100);
 document.querySelector('#open-cart').textContent='Ver carrinho · '+count+' itens · '+money(total/100);
 document.querySelector('#open-cart').hidden=!available;
 document.querySelector('#checkout').disabled=!count||!available||!/^55\d{10,11}$/.test(whatsapp);
 if(available&&!whatsapp)feedback.textContent='Esta adega ainda não configurou o WhatsApp para pedidos.';
}
function render(){
 const list=products.filter(p=>(p.name+' '+p.brand).toLocaleLowerCase('pt-BR').includes(search.value.toLocaleLowerCase('pt-BR'))&&(!category.value||p.category===category.value));
 const root=document.querySelector('#catalog-products');root.replaceChildren();
 for(const p of list){const card=node('article','','beverage');for(const [tag,cls,text] of [['span','category',p.category],['h2','',p.name],['p','brand',p.brand],['p','price',money(p.price)]])card.append(node(tag,text,cls));
 const add=node('button','Adicionar ao carrinho','add-cart');add.disabled=!whatsapp;add.onclick=()=>chooseQuantity(p);card.append(add);root.append(card);}
 status.textContent=list.length?`${list.length} bebidas disponíveis${whatsapp?'':' · Pedidos pelo WhatsApp ainda não configurados.'}`:products.length?'Nenhuma bebida encontrada. Ajuste os filtros.':'Nenhum produto disponível no momento.';
}
async function load(){
 retry.hidden=true;
 try{const response=await fetch('/api/catalog?loja='+encodeURIComponent(new URLSearchParams(location.search).get('loja')||''),{credentials:'omit',cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Catálogo indisponível.');
 available=true;storeName=result.name;whatsapp=result.whatsapp||'';products=catalogVariants(result.products);
 const changed=reconcileCart(cart,products);if(changed)feedback.textContent='O catálogo mudou. Confira os itens e valores antes de continuar.';
 document.querySelector('.brand-scene').hidden=false;window.dispatchEvent(new Event('catalog-ready'));
 document.title=result.name+' · Catálogo';document.querySelector('#store-name').textContent=result.name;
 document.querySelector('#store-logo').src=/^data:image\/png;base64,/.test(result.logo)?result.logo:'/assets/logo.svg';
 const selected=category.value;category.replaceChildren(new Option('Todas',''));for(const name of [...new Set(products.map(p=>p.category))])category.add(new Option(name,name));category.value=selected;
 document.querySelector('#catalog-filters').hidden=false;document.querySelector('#catalog-note').hidden=false;render();renderCart();return {ok:true,changed};
 }catch(error){available=false;document.querySelector('.brand-scene').hidden=true;products=[];document.querySelector('#catalog-products').replaceChildren();document.querySelector('#catalog-filters').hidden=true;document.querySelector('#catalog-note').hidden=true;status.textContent=error.message;feedback.textContent='Não foi possível confirmar o catálogo. Reconecte e tente novamente.';retry.hidden=false;renderCart();return {ok:false};}
}
const quantityDialog=document.querySelector('#quantity-dialog'),quantityInput=document.querySelector('#add-quantity'),quantityError=document.querySelector('#quantity-error'),quantityButton=document.querySelector('#confirm-quantity');
let selectedProductId=null,checkingQuantity=false;
function selectedProduct(){return products.find(p=>p.id===selectedProductId);}
function quantityLimit(product){return Math.max(0,cartCapacity(cart,product)-(cart.get(product.id)?.quantity||0));}
function updateQuantity(){
 const product=selectedProduct(),quantity=Number(quantityInput.value),limit=product?quantityLimit(product):0;
 const valid=!!quantityInput.value&&Number.isSafeInteger(quantity)&&quantity>0&&quantity<=limit&&available;
 quantityInput.max=String(limit);document.querySelector('#quantity-available').textContent=product?'Você pode adicionar até '+limit+(product.units>1?' embalagens.':' unidades.'):'Produto indisponível no momento.';
 document.querySelector('#quantity-subtotal').textContent='Subtotal: '+money(valid?Math.round(product.price*100)*quantity/100:0);
 quantityButton.disabled=!valid||checkingQuantity;document.querySelector('#quantity-minus').disabled=checkingQuantity||quantity<=1;document.querySelector('#quantity-plus').disabled=checkingQuantity||quantity>=limit||!limit;
 quantityError.textContent=quantityInput.value&&!valid?'Informe uma quantidade inteira entre 1 e '+limit+'.':'';
}
function chooseQuantity(product){
 selectedProductId=product.id;quantityInput.value='';quantityError.textContent='';document.querySelector('#quantity-product').textContent=product.name;document.querySelector('#quantity-price').textContent=money(product.price)+(product.units>1?' por embalagem':' por unidade');
 updateQuantity();quantityDialog.showModal();quantityInput.focus();
}
quantityInput.oninput=updateQuantity;
for(const [id,delta] of [['quantity-minus',-1],['quantity-plus',1]])document.getElementById(id).onclick=()=>{quantityInput.value=String(Math.max(1,(Number(quantityInput.value)||0)+delta));updateQuantity();};
document.querySelector('#close-quantity').onclick=()=>quantityDialog.close();
document.querySelector('#quantity-form').onsubmit=async event=>{
 event.preventDefault();if(checkingQuantity)return;
 const before=selectedProduct(),quantity=Number(quantityInput.value);if(!before||!quantityInput.value||!Number.isSafeInteger(quantity)||quantity<1||quantity>quantityLimit(before)){updateQuantity();return;}
 checkingQuantity=true;quantityInput.disabled=true;quantityButton.textContent='Conferindo…';updateQuantity();
 try{
  const result=await load(),current=selectedProduct();
  if(!result.ok||!current){quantityError.textContent='Não foi possível confirmar este produto. Reconecte e tente novamente.';return;}
  if(current.price!==before.price||result.changed){document.querySelector('#quantity-price').textContent=money(current.price)+(current.units>1?' por embalagem':' por unidade');quantityError.textContent='O catálogo mudou. Confira o preço e a quantidade antes de adicionar.';return;}
  if(quantity>quantityLimit(current)){quantityError.textContent='O estoque mudou. Há '+quantityLimit(current)+' disponíveis para adicionar.';return;}
  if(change(current,quantity)){quantityDialog.close();status.textContent=quantity+' × '+current.name+' adicionado ao carrinho.';}
 }finally{checkingQuantity=false;quantityInput.disabled=false;quantityButton.textContent='Adicionar ao carrinho';const message=quantityError.textContent;updateQuantity();if(message)quantityError.textContent=message;}
};
search.oninput=render;category.onchange=render;retry.onclick=load;
document.querySelector('#open-cart').onclick=()=>{renderCart();dialog.showModal();};
document.querySelector('#close-cart').onclick=()=>dialog.close();
document.querySelector('#checkout').onclick=async event=>{
 const addressFields=['delivery-neighborhood','delivery-street','delivery-number'].map(id=>document.getElementById(id));
 for(const input of addressFields){input.setCustomValidity(input.value.trim()?'':'Preencha este campo do endereço.');if(!input.reportValidity()){feedback.textContent='Preencha bairro, rua e número antes de continuar.';input.focus();return;}}
 const address=`Bairro: ${addressFields[0].value.trim()}\nRua: ${addressFields[1].value.trim()}\nNúmero: ${addressFields[2].value.trim()}`;
 const payment=document.querySelector('#delivery-payment');
 if(!['Pix','Dinheiro','Cartão de débito','Cartão de crédito'].includes(payment.value)){feedback.textContent='Escolha a forma de pagamento antes de continuar.';payment.reportValidity();return;}
 const button=event.currentTarget;button.disabled=true;button.textContent='Conferindo pedido…';feedback.textContent='';
 try{const result=await load();if(!result.ok||result.changed||!cart.size||!/^55\d{10,11}$/.test(whatsapp))return;
 const text=orderMessage([...cart.values()],address,payment.value);
 location.assign('https://wa.me/'+whatsapp+'?text='+encodeURIComponent(text));
 }finally{button.textContent='Finalizar pelo WhatsApp';renderCart();}
};
document.querySelectorAll('.delivery-fields input').forEach(input=>input.oninput=()=>input.setCustomValidity(''));
setInterval(()=>{if(!document.hidden&&!dialog.open&&!quantityDialog.open)load();},30000);window.addEventListener('online',load);load();

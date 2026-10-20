// One unit-based stock balance, presented as the way the owner bought it.
function productPurchaseSummary(mode,quantity,size,cost){
 const factor=mode==='pack'?Number(size):1;
 return {units:Number(quantity)*factor,unitCost:Number(cost)/factor,totalCost:Number(quantity)*Number(cost)};
}
function productModal(id){
 const p=db.products.find(product=>product.id===id)||{name:'',brand:'',code:'',category:'Cervejas',min:5};
 const editing=!!id,packed=Number(p.pack_size)>1;
 const packNames=['Caixa','Grade','Fardo','Pack'];if(p.pack_name&&!packNames.includes(p.pack_name))packNames.push(p.pack_name);
 const modal=document.querySelector('#modal'),form=document.querySelector('#modal-form'),fields=document.querySelector('#modal-fields');
 document.querySelector('#modal-title').textContent=editing?'Editar produto':'Cadastrar bebida';
 form.querySelector('button[type=submit]').textContent=editing?'Salvar alterações':'Cadastrar produto';
 document.querySelector('#form-error').textContent='';
 fields.innerHTML=`<div class="product-registration">
  <section class="product-form-section" aria-labelledby="product-step-one"><h3 id="product-step-one"><span>1</span> Qual é a bebida?</h3>
   ${field('Nome da bebida *','name',p.name,'text','required maxlength="100" placeholder="Ex.: Cerveja em lata 350 ml" autocomplete="off"')}
   <label>Categoria<select name="category">${categories.map(category=>`<option ${category===p.category?'selected':''}>${category}</option>`).join('')}</select></label>
  </section>
  <section class="product-form-section" aria-labelledby="product-step-two"><h3 id="product-step-two"><span>2</span> ${editing?'Embalagem e custo':'Como você comprou?'}</h3>
   <fieldset class="purchase-choice"><legend>${editing?'Como este produto é organizado?':'Escolha a forma da compra'}</legend>
    <label><input type="radio" name="purchase_mode" value="unit" ${!packed?'checked':''}><span><strong>Por unidade</strong><small>Bebidas avulsas</small></span></label>
    <label><input type="radio" name="purchase_mode" value="pack" ${packed?'checked':''}><span><strong>Por embalagem</strong><small>Caixa, grade, fardo ou pack</small></span></label>
   </fieldset>
   <label id="product-box-name">Tipo de embalagem<select name="pack_name">${packNames.map(name=>`<option value="${esc(name)}" ${name===(p.pack_name||'Caixa')?'selected':''}>${esc(name)}</option>`).join('')}</select></label>
   <div class="form-grid product-purchase-fields">
    ${!editing?`<label><span id="product-quantity-label">Quantas unidades comprou? *</span><input name="stock" type="number" value="0" min="0" step="1" required inputmode="numeric"><small>Use 0 para cadastrar sem estoque.</small></label>`:''}
    <label id="product-box-size"><span id="product-size-label">Quantas unidades vêm em cada caixa? *</span><input name="pack_size" type="number" value="${packed?p.pack_size:12}" min="2" max="10000" step="1" required inputmode="numeric"></label>
    <label><span id="product-cost-label">${editing?'Custo por unidade (R$) *':'Quanto pagou por unidade (R$)? *'}</span><input name="purchase_cost" type="number" value="${editing?esc(p.cost):''}" min="0" step="${editing?'0.000001':'0.01'}" required inputmode="decimal" placeholder="0,00"></label>
   </div>
   <div class="purchase-preview" aria-live="polite" aria-atomic="true"><span>${editing?'Estoque atual':'Total que entrará no estoque'}</span><strong id="product-unit-total"></strong><p id="product-purchase-detail"></p></div>
  </section>
  <section class="product-form-section" aria-labelledby="product-step-three"><h3 id="product-step-three"><span>3</span> Por quanto vai vender?</h3>
   <div class="form-grid">${field('Preço de venda da unidade (R$) *','price',p.price??'','number','required min="0.01" step="0.01" inputmode="decimal" placeholder="0,00"')}
    <label id="product-box-price"><span id="product-pack-price-label">Preço de venda da caixa completa (R$)</span><input name="pack_price" type="number" value="${esc(p.pack_price??'')}" min="0.01" step="0.01" inputmode="decimal" placeholder="Opcional"><small>Deixe vazio para vender só unidades.</small></label>
   </div><p id="product-box-sale-note" class="product-form-help"></p>
  </section>
  <details class="product-extra"><summary>Mais informações <span>Marca, código e alerta de estoque</span></summary><div class="form-grid">
   ${field('Marca (opcional)','brand',p.brand,'text','maxlength="150"')}${field('Código / código de barras (opcional)','code',p.code,'text','maxlength="150"')}
   ${field('Avisar quando restarem (unidades)','min',p.min,'number','required min="0" step="1" inputmode="numeric"')}

  </div></details>
 </div>`;
 const input=name=>form.elements.namedItem(name);
 function update(){
  const isBox=input('purchase_mode').value==='pack',size=Number(input('pack_size').value);
  const name=input('pack_name').value.toLocaleLowerCase('pt-BR'),feminine=['caixa','grade'].includes(name),plural=name+'s';
  for(const selector of ['#product-box-size','#product-box-price','#product-box-name'])fields.querySelector(selector).hidden=!isBox;
  for(const name of ['pack_size','pack_price','pack_name'])input(name).disabled=!isBox;
  if(!editing){
   fields.querySelector('#product-quantity-label').textContent=isBox?(feminine?'Quantas ':'Quantos ')+plural+' comprou? *':'Quantas unidades comprou? *';
   fields.querySelector('#product-cost-label').textContent=isBox?'Quanto pagou por '+name+' (R$)? *':'Quanto pagou por unidade (R$)? *';
  }
  fields.querySelector('#product-size-label').textContent='Quantas unidades vêm em cada '+name+'? *';
  fields.querySelector('#product-pack-price-label').textContent='Preço de venda '+(feminine?'da ':'do ')+name+' complet'+(feminine?'a':'o')+' (R$)';
  const quantity=editing?p.stock:Number(input('stock').value),cost=Number(input('purchase_cost').value);
  const summary=productPurchaseSummary(isBox?'pack':'unit',editing?0:quantity,size,cost);
  const validSize=!isBox||(Number.isInteger(size)&&size>=2&&size<=10000);
  const units=editing?p.stock:summary.units;
  fields.querySelector('#product-unit-total').textContent=validSize&&Number.isSafeInteger(units)&&units>=0?units+' unidades':'Informe a quantidade por embalagem';
  fields.querySelector('#product-purchase-detail').textContent=editing?'O saldo não muda ao editar. Use Repor estoque para novas compras.':validSize?(isBox?quantity+' '+(quantity===1?name:plural)+' × '+size+' unidades. ':'')+(input('purchase_cost').value!==''?'Compra: '+money(summary.totalCost)+' · Custo por unidade: '+money(summary.unitCost):'Informe o custo da compra acima.'):'Cada embalagem precisa ter de 2 a 10.000 unidades.';
  fields.querySelector('#product-box-sale-note').textContent=isBox&&validSize?'Cada '+name+' vendid'+(feminine?'a':'o')+' descontará '+size+' unidades do mesmo estoque.':'';
 }
 // Each opening owns its listener; closing/reopening cannot retain an old product.
 fields.oninput=update;fields.onchange=update;update();
 form.onsubmit=async event=>{
  event.preventDefault();
  const values=Object.fromEntries(new FormData(form)),isBox=values.purchase_mode==='pack',size=isBox?Number(values.pack_size):1;
  const quantity=editing?0:Number(values.stock),purchaseCost=Number(values.purchase_cost);
  const summary=productPurchaseSummary(isBox?'pack':'unit',quantity,size,purchaseCost);
  const error=document.querySelector('#form-error');
  if(!Number.isInteger(size)||size<(isBox?2:1)||size>10000||(!editing&&(!Number.isSafeInteger(summary.units)||summary.units<0||summary.units>2147483647))){error.textContent='Confira as quantidades de embalagens e unidades.';return;}
  if(db.products.some(product=>product.id!==id&&values.code.trim()&&product.code===values.code.trim())){error.textContent='Este código já está cadastrado.';return;}
  const data={name:values.name.trim(),brand:values.brand.trim(),code:values.code.trim(),category:values.category,cost:editing?purchaseCost:summary.unitCost,price:Number(values.price),min:Number(values.min),pack_size:size,pack_name:isBox?(values.pack_name.trim()||'Caixa'):'Caixa',pack_price:isBox&&values.pack_price?Number(values.pack_price):null};
  if(!data.name)return;
  if(await saveCommand(editing?'update_product':'create_product',{...data,...(editing?{id}:{stock:quantity,stock_mode:isBox?'pack':'unit'})},form)){
   modal.close();products();toast(editing?'Produto atualizado.':'Produto cadastrado. Estoque calculado automaticamente.');
  }
 };
 modal.showModal();input('name').focus();
}

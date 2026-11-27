'use strict';
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
let db={products:[],movements:[]};
let authenticated=false;
let busy=false;
let dataRevision=0;
let renderedPage=null;
let restockProductId=null;
let checkoutDraft;
let sessionGeneration=0;
const accountChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('adega-access'):null;
function invalidateAccount(message='Sua sessão mudou em outra aba. Entre novamente.'){sessionGeneration++;authenticated=false;db={products:[],movements:[]};document.querySelector('#modal').close();login(message);}
if(accountChannel)accountChannel.onmessage=event=>{
 if(event.data==='signed-in'){checkoutDraft=undefined;closeReceipt();sessionGeneration++;authenticated=false;db={products:[],movements:[]};document.querySelector('#modal').close();start();}
 else invalidateAccount();
};
async function api(path, data) {
  if(navigator.onLine===false)throw Error('Você está offline. Reconecte à internet para continuar.');
  const generation=sessionGeneration;
  const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},credentials:'same-origin',signal:AbortSignal.timeout(20000),body:data?JSON.stringify(data):undefined});
  const result=await response.json();
  if(generation!==sessionGeneration)throw Error('Sessão alterada. Atualize a página e entre novamente.');
  if(!response.ok){
    if(response.status===401&&authenticated){invalidateAccount('Sessão expirada. Entre novamente.');accountChannel?.postMessage('session-changed');}
    const error = Error(result.error||'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }
  return result;
}
async function saveCommand(action,payload,source){
  if(busy)return false;
  busy=true;
  dataRevision++;
  const signature=JSON.stringify({action,payload});
  if(!source.adegaCommand||source.adegaCommand.signature!==signature)source.adegaCommand={signature,requestId:crypto.randomUUID()};
  const buttons=[...document.querySelectorAll('button:not(:disabled)')];
  buttons.forEach(b=>b.disabled=true);
  try{
    db=await api('command',{action,payload,requestId:source.adegaCommand.requestId});
    delete source.adegaCommand;
    return true;
  }catch(error){
    if(action==='checkout' && error.status===400) delete source.adegaCommand;
    source.adegaError = error.message;
    toast(error.message);return false;
  }
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
}
function login(message=''){
  checkoutDraft=undefined;
  closeReceipt();
  restockProductId=null;
  document.body.classList.add('auth-mode');
  document.querySelector('#auth-root').hidden=false;
  content.innerHTML='';

  window.AdegaAuth.show(message);
}
async function start(){
  if(['cadastro','recuperar','redefinir'].includes(location.hash.slice(1))){login();return;}
  content.innerHTML='';
  try{db=await api('state');authenticated=true;render();}catch(error){login(error.message);}
}
const content=document.querySelector('#content');
document.querySelector('#today').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.style.display='none',3500)}
function heading(title,subtitle,action=''){return `<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`}
function empty(message='Seus registros aparecerão aqui.'){return `<div class="empty"><strong>Tudo pronto para começar</strong>${message}</div>`}
function stockBreakdown(p){const size=p.pack_size||1;return size>1?Math.floor(p.stock/size)+' '+esc(p.pack_name||'Caixa')+'(s) + '+p.stock%size+' un. avulsas':p.stock+' un.';}
function movementTotal(m){return m.lineTotal??m.quantity*m.price;}
function movementQuantity(m){if(m.itemCount>1)return m.itemCount+' linhas';return m.packUnits>1?m.packCount+' '+esc(m.packLabel)+'(s) · '+m.quantity+' un.':m.quantity+' un.';}
function stock(p){return p.stock===0?'<span class="pill out">Sem estoque</span>':p.stock<=p.min?'<span class="pill low">Estoque baixo</span>':'<span class="pill">Disponível</span>'}
function saleAction(m){return `<div class="actions">${m.type==='sale'?(m.cancelledAt?`<span class="pill out">Venda cancelada</span>`:`<button class="secondary small" data-cancel-sale="${m.id}">Cancelar venda</button><button class="secondary small" data-receipt="${esc(m.id)}">Comprovante</button>`):''}${m.saleId?'':`<button class="danger small" data-delete-movement="${m.id}">Excluir movimentação</button>`}</div>`}
function deleteMovementModal(id){
 const movement=db.movements.find(m=>m.id===id);if(!movement)return;
 const modal=document.querySelector('#modal');document.querySelector('#modal-title').textContent='Excluir movimentação?';
 const effect=movement.cancelledAt?'Esta venda já foi cancelada. O estoque não será alterado novamente.':movement.type==='sale'?'As unidades voltarão ao estoque e esta venda sairá dos relatórios de receita e lucro.':'As unidades desta entrada serão retiradas do estoque e o custo será ajustado. Se houver movimentações posteriores dependentes desta entrada, a exclusão será bloqueada.';
 document.querySelector('#modal-fields').innerHTML=`<p><strong>${esc(movement.name)}</strong> · ${movementQuantity(movement)} · ${money(movementTotal(movement))}</p><p>${effect}</p><p>O registro sairá do histórico exibido. Esta ação não estorna pagamentos.</p>`;
 document.querySelector('#form-error').textContent='';document.querySelector('#modal-form button[type=submit]').textContent='Excluir movimentação';
 document.querySelector('#modal-form').onsubmit=async event=>{event.preventDefault();if(await saveCommand('delete_movement',{id},event.target)){modal.close();render();toast('Movimentação excluída. Estoque e relatórios atualizados.');}};
 modal.showModal();document.querySelector('#cancel-modal').focus();
}
content.addEventListener?.('click',event=>{const button=event.target.closest('[data-delete-movement]');if(button&&authenticated)deleteMovementModal(button.dataset.deleteMovement);});
function cancelSaleModal(id){
 const sale=db.movements.find(m=>m.id===id&&m.type==='sale'&&!m.cancelledAt);if(!sale)return;
 const modal=document.querySelector('#modal');document.querySelector('#modal-title').textContent='Cancelar venda?';
 document.querySelector('#modal-fields').innerHTML=`<p><strong>${sale.saleId?'Venda completa':esc(sale.name)}</strong> · ${money(saleLines(sale).reduce((sum,line)=>sum+movementTotal(line),0))}</p><p>${db.products.some(p=>p.id===sale.productId)?'A quantidade voltará ao estoque.':'O produto foi excluído e continuará fora do estoque disponível.'} Esta venda deixará de contar na receita e no lucro. O registro ficará marcado como cancelado.</p><p>Confirme somente se a venda foi desfeita e as bebidas permanecem ou retornaram à distribuidora. O sistema não estorna pagamentos.</p>`;
 document.querySelector('#form-error').textContent='';document.querySelector('#modal-form button[type=submit]').textContent='Confirmar cancelamento';
 document.querySelector('#modal-form').onsubmit=async event=>{event.preventDefault();if(await saveCommand('cancel_sale',{id},event.target)){modal.close();render();toast('Venda cancelada. Estoque e relatórios atualizados.');}};
 modal.showModal();document.querySelector('#cancel-modal').focus();
}
content.addEventListener?.('click',event=>{const receipt=event.target.closest('[data-receipt]');if(receipt){const sale=db.movements.find(m=>m.id===receipt.dataset.receipt&&m.type==='sale'&&!m.cancelledAt);if(sale)showReceipt(sale);return;}const button=event.target.closest('[data-cancel-sale]');if(button)cancelSaleModal(button.dataset.cancelSale);});
content.addEventListener?.('click',event=>{
 const button=event.target.closest('[data-restock]');if(!button||!authenticated)return;
 const product=db.products.find(p=>p.id===button.dataset.restock&&p.active);if(!product)return;
 restockProductId=product.id;
 if(location.hash==='#compras')transaction();else location.hash='compras';
});
function compactList(items,limit,label){return items.slice(0,limit).join('')+(items.length>limit?`<details class="more-records"><summary>Ver mais ${items.length-limit} ${label}</summary>${items.slice(limit).join('')}</details>`:'')}
function mobileProducts(list){return `<div class="mobile-records" aria-label="Lista de produtos">${compactList(list.map(p=>`<details class="record" data-record="${esc(p.id)}"><summary><span class="record-main"><strong>${esc(p.name)}</strong><span>${money(p.price)} · ${stockBreakdown(p)}</span></span>${p.active?stock(p):'<span class="pill out">Inativo</span>'}<span class="record-chevron" aria-hidden="true">⌄</span></summary><div class="record-body"><dl><div><dt>Categoria</dt><dd>${esc(p.category)}</dd></div><div><dt>Marca</dt><dd>${esc(p.brand||'Sem marca')}</dd></div><div><dt>Código</dt><dd>${esc(p.code||'Sem código')}</dd></div><div><dt>Custo</dt><dd>${money(p.cost)}</dd></div><div><dt>Venda por unidade</dt><dd>${money(p.price)}</dd></div>${p.pack_size>1?`<div><dt>${esc(p.pack_name)} (${p.pack_size} un.)</dt><dd>${p.pack_price?money(p.pack_price):'Preço não definido'}</dd></div>`:''}<div><dt>Estoque mínimo</dt><dd>${p.min} un.</dd></div></dl><div class="actions"><button class="secondary" data-edit="${p.id}">Editar produto</button><button class="secondary" data-toggle="${p.id}">${p.active?'Inativar':'Ativar'}</button><button class="danger" data-delete="${p.id}">Excluir produto</button></div><p class="record-hint">${p.active?'Inativar mantém o histórico e impede novas movimentações.':'Ative o produto para registrar compras e vendas.'}</p></div></details>`),8,'produtos')}</div>`}
function mobileMovements(list){return `<div class="mobile-records" aria-label="Lista de movimentações">${compactList(list.map(m=>`<details class="record"><summary><span class="record-main"><strong>${esc(m.name)}</strong><span>${{sale:m.cancelledAt?'Venda cancelada':m.payment==='A receber'?'Venda em aberto':'Venda',purchase:'Compra',opening:'Estoque inicial'}[m.type]} · ${movementQuantity(m)}</span></span><strong class="record-total">${money(movementTotal(m))}</strong><span class="record-chevron" aria-hidden="true">⌄</span></summary><div class="record-body"><dl><div><dt>Data e hora</dt><dd>${date(m.date)}</dd></div><div><dt>Valor unitário</dt><dd>${money(m.price)}</dd></div><div><dt>Quantidade</dt><dd>${movementQuantity(m)}</dd></div><div><dt>${m.type==='sale'?'Cliente':'Fornecedor'}</dt><dd>${esc(m.party||'Não informado')}</dd></div>${m.payment?`<div><dt>Pagamento</dt><dd>${esc(m.payment)}</dd></div>`:''}</dl><div class="actions">${saleAction(m)}</div><p class="record-hint">${m.cancelledAt?'Quantidade devolvida ao estoque.':'Movimentação registrada. Cancelamentos preservam o histórico.'}</p></div></details>`),3,'movimentações')}</div>`}
function stats(){const sales=db.movements.filter(m=>m.type==='sale'&&!m.cancelledAt);const revenue=sales.reduce((a,m)=>a+movementTotal(m),0);const profit=sales.reduce((a,m)=>a+movementTotal(m)-m.quantity*m.cost,0);return `<div class="stats"><div class="stat"><span class="stat-label">Receita de vendas</span><strong>${money(revenue)}</strong><small>${new Set(sales.map(sale=>sale.saleId || sale.id)).size} vendas registradas</small></div><div class="stat"><span class="stat-label">Lucro bruto</span><strong>${money(profit)}</strong><small>Receita menos custo das bebidas</small></div><div class="stat"><span class="stat-label">Unidades em estoque</span><strong>${db.products.reduce((a,p)=>a+p.stock,0)}</strong><small>${db.products.filter(p=>p.active).length} produtos ativos</small></div><div class="stat"><span class="stat-label">Valor do estoque</span><strong>${money(db.products.reduce((a,p)=>a+p.stock*p.cost,0))}</strong><small>Calculado pelo custo de aquisição</small></div></div>`}
function groupedMovements(list){
  const sales = new Map();
  const rows = [];
  for(const movement of list){
    if(!movement.saleId){rows.push(movement);continue;}
    const existing = sales.get(movement.saleId);
    if(existing){
      existing.itemCount++;
      existing.lineTotal += movementTotal(movement);
    } else {
      const row = {...movement,itemCount:1,lineTotal:movementTotal(movement)};
      sales.set(movement.saleId,row);
      rows.push(row);
    }
  }
  for(const row of sales.values()) if(row.itemCount>1) row.name = `Venda com ${row.itemCount} itens`;
  return rows;
}
function movementTable(list,alreadyGrouped=false){if(!alreadyGrouped)list=groupedMovements(list);if(!list.length)return empty('Registre uma compra ou venda para acompanhar suas movimentações.');return mobileMovements(list)+`<div class="table-wrap desktop-records"><table><thead><tr><th>PRODUTO / DATA</th><th>TIPO</th><th>QUANTIDADE</th><th>TOTAL</th><th>AÇÕES / STATUS</th></tr></thead><tbody>${list.map(m=>`<tr><td class="product-name">${esc(m.name)}<small>${date(m.date)}${m.party?' · '+esc(m.party):''}</small></td><td><span class="pill ${m.type==='sale'?'':'low'}">${{sale:m.cancelledAt?'Venda cancelada':m.payment==='A receber'?'Venda em aberto':'Venda',purchase:'Compra',opening:'Estoque inicial'}[m.type]}</span></td><td>${movementQuantity(m)}</td><td>${money(movementTotal(m))}</td><td>${saleAction(m)}</td></tr>`).join('')}</tbody></table></div>`}
function panel(){const low=db.products.filter(p=>p.active&&p.stock<=p.min);content.innerHTML=heading('Seu negócio em um olhar','Acompanhe os números e cuide do que mais importa.','<a href="#vendas"><button>＋ Nova venda</button></a>')+stats()+`<div class="grid"><div class="card"><div class="card-head"><div><h2>Movimentações recentes</h2><p>As últimas entradas e saídas da sua distribuidora</p></div><a class="text-link" href="#historico">Ver todas ↗</a></div>${movementTable(groupedMovements([...db.movements].reverse()).slice(0,5),true)}</div><div><div class="card"><div class="card-head"><div><h2>Atenção ao estoque</h2><p>Produtos que precisam de reposição</p></div><span class="badge">${low.length} itens</span></div>${low.length?low.map(p=>`<div class="bar-row"><div class="bar-label"><span>${esc(p.name)}</span><div class="restock-actions"><b>${stockBreakdown(p)}</b><button class="secondary small" data-restock="${p.id}" aria-label="Repor estoque de ${esc(p.name)}">Repor estoque</button></div></div></div>`).join('')+'<div class="card-head"><a class="text-link" href="#compras">Registrar reposição ↗</a></div>':empty('Nenhum produto com estoque baixo.')}</div><div class="notice">Um estoque organizado faz a diferença. Cadastre suas bebidas e registre cada entrada e saída.</div></div></div>`}
function products(){content.innerHTML=heading('Produtos e estoque','Todas as suas bebidas, organizadas em um só lugar.','<button id="new-product">＋ Novo produto</button>')+`<div class="card"><div class="card-head"><h2>Catálogo de bebidas</h2><span class="badge">${db.products.length} produtos</span></div><div class="toolbar"><input id="search" aria-label="Buscar produto" placeholder="Buscar por nome, código ou marca…"><select id="category-filter" aria-label="Categoria"><option value="">Todas as categorias</option>${categories.map(c=>`<option>${c}</option>`).join('')}</select></div><div id="product-table"></div></div>`;document.querySelector('#new-product').onclick=()=>productModal();document.querySelector('#search').oninput=productRows;document.querySelector('#category-filter').onchange=productRows;productRows()}
const categories=['Cervejas','Vinhos','Destilados','Espumantes','Refrigerantes','Águas','Energéticos','Sucos','Outros'];
function productRows(){const q=document.querySelector('#search').value.toLowerCase();const category=document.querySelector('#category-filter').value;const list=db.products.filter(p=>(p.name+' '+p.code+' '+p.brand).toLowerCase().includes(q)&&(!category||p.category===category));document.querySelector('#product-table').innerHTML=list.length?mobileProducts(list)+`<div class="table-wrap desktop-records"><table><thead><tr><th>PRODUTO</th><th>MARCA</th><th>CÓDIGO DE BARRAS</th><th>CATEGORIA</th><th>CUSTO / UN.</th><th>VENDA / UN.</th><th>ESTOQUE</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${list.map(p=>`<tr><td class="product-name">${esc(p.name)}</td><td>${esc(p.brand||'—')}</td><td>${esc(p.code||'—')}</td><td>${esc(p.category)}</td><td>${money(p.cost)}</td><td>${money(p.price)}${p.pack_size>1?`<br><small>${esc(p.pack_name)} (${p.pack_size} un.): ${p.pack_price?money(p.pack_price):'sem preço'}</small>`:''}</td><td>${stockBreakdown(p)}<br><small>Mínimo: ${p.min}</small></td><td>${p.active?stock(p):'<span class="pill out">Inativo</span>'}</td><td><div class="actions"><button class="secondary small" data-edit="${p.id}">Editar</button><button class="secondary small" data-toggle="${p.id}">${p.active?'Inativar':'Ativar'}</button><button class="danger small" data-delete="${p.id}">Excluir produto</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Cadastre uma bebida ou ajuste os filtros para começar.');document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteProductModal(b.dataset.delete));document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>productModal(b.dataset.edit));document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const p=db.products.find(p=>p.id===b.dataset.toggle);if(await saveCommand('set_active',{id:p.id,active:!p.active},b))productRows()})}
function deleteProductModal(id){
 const product=db.products.find(p=>p.id===id);if(!product)return;
 const modal=document.querySelector('#modal');
 document.querySelector('#modal-title').textContent='Excluir produto?';
 document.querySelector('#modal-fields').innerHTML=`<p><strong>${esc(product.name)}</strong></p><p>O produto será removido da lista de produtos e do catálogo. Seu saldo deixará de contar no estoque disponível. Compras, vendas e relatórios anteriores serão preservados.</p>`;
 document.querySelector('#form-error').textContent='';
 const submit=document.querySelector('#modal-form button[type=submit]');submit.textContent='Confirmar exclusão';
 document.querySelector('#modal-form').onsubmit=async event=>{event.preventDefault();if(await saveCommand('delete_product',{id},event.target)){modal.close();products();toast('Produto excluído. Histórico preservado.');}};
 modal.showModal();document.querySelector('#cancel-modal').focus();
}
function field(label,name,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`}
function closeReceipt(){
  document.querySelector('#sale-receipt').close();
  document.querySelector('#receipt-details').innerHTML = '';
}
function saleLines(sale){
  return sale.saleId?db.movements.filter(line=>line.saleId===sale.saleId):[sale];
}
function showReceipt(sale){
  const company = document.querySelector('#company-brand-name').textContent || 'Distribuidora';
  const lines = saleLines(sale);
  const total = lines.reduce((sum,line)=>sum+Math.round(movementTotal(line)*100),0)/100;
  document.querySelector('#receipt-details').innerHTML = `
    <div class="receipt-header">
      <strong>${esc(company)}</strong>
      <h2 id="receipt-title">${sale.payment==='A receber'?'Nota em aberto':'Comprovante de venda'}</h2>
      <p>Documento não fiscal</p>
    </div>
    <div class="receipt-meta">
      <div>${date(sale.date)}</div>
      ${sale.saleId || sale.id?`<div>Venda ${esc(sale.saleId || sale.id)}</div>`:''}
      <div><strong>Cliente</strong> ${esc(sale.party || 'Não informado')}</div>
    </div>
    <ul class="receipt-items">${lines.map(line=>{
      const quantity = line.packCount || line.quantity;
      const subtotal = movementTotal(line);
      return `<li><strong>${esc(line.name)}</strong><div>
        <span>${quantity} ${esc(line.packUnits>1?line.packLabel:'un.')} × ${money(subtotal/quantity)}</span>
        <strong>${money(subtotal)}</strong>
      </div></li>`;
    }).join('')}</ul>
    <div class="receipt-total"><strong>Total</strong><strong>${money(total)}</strong></div>
    <p>${sale.payment==='A receber'?'Saldo a receber: '+money(outstanding({...sale,lineTotal:total})):'Pagamento: '+esc(sale.payment || 'Não informado')}</p>
    ${receivedFor(sale.saleId).map(p=>`<p>${date(p.received_at)} · ${esc(p.method)} · ${money(p.amount)}</p>`).join('')}
    ${sale.paidAt?`<p>Recebido em ${date(sale.paidAt)}</p>`:''}`;
  const dialog = document.querySelector('#sale-receipt');
  const width = document.querySelector('#receipt-width');
  document.querySelector('#print-receipt').onclick = ()=>{
    dialog.dataset.width = width.value;
    window.print();
  };
  dialog.showModal();
}


function customerModal(){
  const modal = document.querySelector('#modal');
  const form = document.querySelector('#modal-form');
  document.querySelector('#modal-title').textContent = 'Clientes';
  const fields = document.querySelector('#modal-fields');
  fields.innerHTML = `<div class="form-grid">${field('Nome','name','','text','required maxlength="150"')}${field('Telefone (opcional)','phone','','tel','maxlength="30"')}</div>
    <h3>Clientes cadastrados</h3><ul class="pos-customer-list">${(db.customers || []).map(c=>`<li><strong>${esc(c.name)}</strong> ${esc(c.phone)}</li>`).join('') || '<li>Nenhum cliente cadastrado.</li>'}</ul>`;
  document.querySelector('#form-error').textContent = '';
  const submit = form.querySelector('button[type=submit]');
  submit.hidden = false;
  submit.textContent = 'Cadastrar cliente';
  form.onsubmit = async event=>{
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if(!name) return;
    if(await saveCommand('customer_save',{name,phone:form.elements.phone.value.trim()},form)){
      modal.close();
      render();
      toast('Cliente cadastrado.');
    }
  };
  modal.showModal();
}
function receivedFor(saleId){
  return (db.payments || []).filter(payment=>payment.sale_id===saleId);
}
function outstanding(sale){
  return (Math.round(movementTotal(sale)*100)-receivedFor(sale.saleId).reduce((sum,p)=>sum+Math.round(p.amount*100),0))/100;
}
function receivablesModal(){
  const modal = document.querySelector('#modal');
  const form = document.querySelector('#modal-form');
  const fields = document.querySelector('#modal-fields');
  const pending = groupedMovements([...db.movements].reverse().filter(m=>m.saleId&&m.payment==='A receber'&&!m.cancelledAt));
  document.querySelector('#modal-title').textContent = 'Vendas em aberto';
  document.querySelector('#form-error').textContent = '';
  const submit = form.querySelector('button[type=submit]');
  submit.hidden = false;
  submit.textContent = 'Registrar recebimento';
  fields.innerHTML = `<label>Buscar por cliente ou referência<input id="open-sales-search" type="search" autocomplete="off"></label>
    <div id="open-sales-results" class="table-wrap"></div>
    <p id="open-sales-summary" role="status"></p>
    ${field('Valor a receber (R$)','amount','','number','required min="0.01" step="0.01"')}
    <label>Forma de recebimento<select name="method"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option></select></label>`;
  const search = fields.querySelector('#open-sales-search');
  const results = fields.querySelector('#open-sales-results');
  const paint = ()=>{
    const term = search.value.trim().toLowerCase();
    const rows = pending.filter(m=>[m.party,m.saleId].some(value=>value.toLowerCase().includes(term)));
    results.innerHTML = rows.length?`<table><thead><tr><th>Selecionar</th><th>Cliente</th><th>Data</th><th>Saldo</th></tr></thead><tbody>${rows.map(m=>`<tr>
      <td><input type="radio" name="ticket" value="${esc(m.saleId)}" aria-label="Venda de ${esc(m.party)}, ${money(outstanding(m))}"></td>
      <td>${esc(m.party)}<small> · ${esc(m.saleId.slice(0,8))}</small></td><td>${date(m.date)}</td><td>${money(outstanding(m))}</td>
    </tr>`).join('')}</tbody></table>`:'<p>Nenhuma venda em aberto encontrada.</p>';
  };
  search.oninput = ()=>{paint();form.elements.amount.value='';fields.querySelector('#open-sales-summary').textContent='';};
  results.onchange = event=>{
    const selected=pending.find(row=>row.saleId===event.target.value);
    if(!selected) return;
    const amount=outstanding(selected);
    form.elements.amount.value=amount.toFixed(2);
    form.elements.amount.max=amount;
    const sameCustomer=row=>selected.customerId?row.customerId===selected.customerId:!row.customerId && row.party.toLowerCase()===selected.party.toLowerCase();
    const balance=pending.filter(sameCustomer).reduce((sum,row)=>sum+outstanding(row),0);
    fields.querySelector('#open-sales-summary').textContent='Saldo do cliente nas notas em aberto: '+money(balance);
  };
  paint();
  form.onsubmit = async event=>{
    event.preventDefault();
    const id = fields.querySelector('input[name=ticket]:checked')?.value;
    if(!id){document.querySelector('#form-error').textContent='Selecione uma venda em aberto.';return;}
    const amount=form.elements.amount.valueAsNumber;
    if(!Number.isFinite(amount) || amount<=0) return;
    if(await saveCommand('receive_sale',{id,payment:form.elements.method.value,amount},form)){
      modal.close();
      const sale = db.movements.find(m=>m.saleId===id);
      const expected=document.querySelector('#pos-expected');
      if(expected) expected.textContent=money(db.cashExpected);
      if(sale) showReceipt(sale);
      toast('Recebimento registrado.');
    } else document.querySelector('#form-error').textContent=form.adegaError;
  };
  modal.showModal();
}


function counterModal(title,body,submitLabel,onSubmit){
  const modal=document.querySelector('#modal');
  const form=document.querySelector('#modal-form');
  document.querySelector('#modal-title').textContent=title;
  document.querySelector('#modal-fields').innerHTML=body;
  document.querySelector('#form-error').textContent='';
  form.querySelector('button[type=submit]').textContent=submitLabel;
  form.onsubmit=event=>{event.preventDefault();onSubmit(form,modal);};
  modal.showModal();
}
function cashShiftModal(){
  const shift=(db.cashShifts || []).find(row=>!row.closed_at);
  const recent=(db.cashShifts || []).find(row=>row.closed_at);
  const details=shift?`<p>Inicial <strong>${money(shift.opening)}</strong> · Esperado <strong>${money(db.cashExpected)}</strong></p>`:'';
  const previous=recent?`<p>Último fechamento em ${date(recent.closed_at)}. Esperado ${money(recent.expected)}, contado ${money(recent.counted)}, diferença ${money(recent.counted-recent.expected)}.</p>`:'';
  counterModal(shift?'Fechar caixa':'Abrir caixa',details+field(shift?'Valor contado (R$)':'Valor inicial (R$)','amount','','number','required min="0" step="0.01"')+previous,
    shift?'Confirmar fechamento':'Confirmar abertura',async(form,modal)=>{
      const amount=form.elements.amount.valueAsNumber;
      if(!Number.isFinite(amount)) return;
      if(await saveCommand(shift?'cash_close':'cash_open',{amount,...(shift?{id:shift.id}:{})},form)){
        modal.close();render();toast(shift?'Fechamento registrado.':'Caixa aberto.');
      } else document.querySelector('#form-error').textContent=form.adegaError;
    });
}
function suspendedSalesModal(draft){
  const sales=db.suspended || [];
  counterModal('Pré-vendas suspensas',`<label>Pré-venda<select name="ticket" required><option value="">${sales.length?'Selecione uma pré-venda':'Nenhuma pré-venda suspensa'}</option>
    ${sales.map(sale=>`<option value="${esc(sale.id)}">${esc(sale.payload.party || 'Balcão')} · ${date(sale.created_at)} · ${sale.payload.items.length} linhas</option>`).join('')}</select></label>`,
    'Retomar pré-venda',(form,modal)=>{
      if(draft.items.length || draft.pending){document.querySelector('#form-error').textContent='Suspenda ou finalize a venda atual antes de retomar outra.';return;}
      const sale=sales.find(row=>row.id===form.elements.ticket.value);
      if(!sale) return;
      const items=sale.payload.items.map(item=>{
        const product=db.products.find(p=>p.id===item.id && p.active);
        const mode=item.mode==='pack'?'pack':'unit';
        const price=Number(mode==='pack'?product?.pack_price:product?.price);
        const quantity=Number(item.quantity);
        if(!product || !(price>0) || !Number.isSafeInteger(quantity) || quantity<1) return null;
        return {id:product.id,mode,price,quantity,name:product.name,label:mode==='pack'?(product.pack_name || 'Caixa'):'Unidade'};
      });
      if(items.some(item=>!item)){document.querySelector('#form-error').textContent='Um produto da pré-venda está indisponível.';return;}
      Object.assign(draft,{items,party:String(sale.payload.party || ''),customerId:String(sale.payload.customerId || ''),payment:sale.payload.payment,suspendedId:sale.id,tender:'',pending:null});
      modal.close();render();
    });
}

function pointOfSale(){
  const shift = (db.cashShifts || []).find(row=>!row.closed_at);
  const draft = checkoutDraft ??= {items:[],party:'',customerId:'',payment:'Pix',tender:'',suspendedId:'',pending:null};
  content.innerHTML = '<div class="pos-toolbar">' + heading('Vendas','', '<div class="actions"><button class="secondary" id="pos-customers">Clientes</button><button class="secondary" id="pos-receivables">Em aberto</button></div>') + `
    <div class="actions pos-shift">
      <button class="secondary" id="pos-shift" type="button">${shift?'Fechar caixa':'Abrir caixa'}</button>
      ${shift?`<span>Saldo esperado <strong id="pos-expected">${money(db.cashExpected)}</strong></span>`:''}
      <button class="secondary" id="pos-suspended" type="button">Pré-vendas</button>
    </div>
    </div>
    <div class="pos-grid">
      <div class="card pos-products">
        <div class="pos-panel-title"><h2>Produtos</h2><button class="secondary small" type="button" id="pos-new-product">Cadastrar produto</button></div>
        <label for="pos-search">Código de barras ou nome</label>
        <input id="pos-search" type="search" autocomplete="off" aria-keyshortcuts="Escape" placeholder="Escaneie ou digite para buscar">
        <p id="pos-search-status" role="status"></p>
        <div id="pos-results" class="table-wrap"></div>
      </div>
      <form id="pos-checkout" class="card pos-checkout">
        <div class="pos-panel-title"><h2>Itens da venda</h2><span id="pos-count" aria-live="polite">0 itens</span></div>
        <div id="pos-cart" class="table-wrap"></div>
        <div class="form-summary"><span>Total a pagar</span><strong id="pos-total" aria-live="polite">${money(0)}</strong></div>
        <div class="pos-payment-fields">
        <label>Vincular cliente<select name="customerId"><option value="">Digitar nome</option>${(db.customers || []).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.phone?' · '+esc(c.phone):''}</option>`).join('')}</select></label>
        ${field('Nome do cliente','party',draft.party,'text','required maxlength="150" autocomplete="off"')}
        <label>Pagamento<select name="payment"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>A receber</option></select></label>
        </div>
        <p id="pos-feedback" role="alert"></p>
        <div id="pos-tender" hidden>${field('Valor recebido (R$)','tender',draft.tender,'number','min="0" step="0.01"')}
          <strong id="pos-change" aria-live="polite"></strong>
        </div>
        <div class="actions pos-final"><button id="pos-suspend" class="secondary" type="button">Suspender</button><button id="pos-finish" type="submit" aria-keyshortcuts="F9" title="Atalho F9">Finalizar venda e gerar comprovante</button></div>
      </form>
    </div>`;
  const find = selector=>document.querySelector(selector);
  const search = find('#pos-search');
  const form = find('#pos-checkout');
  const results = find('#pos-results');
  const cart = find('#pos-cart');
  const feedback = find('#pos-feedback');
  const items = draft.items;
  if(form.elements){
    form.elements.payment.value = draft.payment;
    form.elements.customerId.value = draft.customerId;
    form.elements.party.readOnly = Boolean(draft.customerId);
  }
  find('#pos-customers').onclick = customerModal;
  find('#pos-receivables').onclick = receivablesModal;
  const normalized = value=>String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const activeProducts = ()=>db.products.filter(product=>product.active);

  form.oninput = event=>{
    if(event.target.name==='tender'){draft.tender=event.target.value;updateTotal();}
    if(event.target.name==='party') draft.party = event.target.value;
    if(event.target.name==='payment'){
      draft.payment = event.target.value;
      updateTotal();
    }
    if(event.target.name==='customerId'){
      draft.customerId = event.target.value;
      const customer = (db.customers || []).find(c=>c.id===draft.customerId);
      if(customer) draft.party = customer.name;
      form.elements.party.value = draft.party;
      form.elements.party.readOnly = Boolean(customer);
    }
  };
  find('#pos-new-product').onclick = ()=>productModal(undefined,paintResults);
  find('#pos-shift').onclick=cashShiftModal;
  find('#pos-suspended').onclick=()=>suspendedSalesModal(draft);
  find('#pos-suspend').onclick=async event=>{
    if(busy || draft.pending || !items.length || draft.suspendedId) return;
    const payload={party:draft.party,customerId:draft.customerId,payment:draft.payment,items};
    if(await saveCommand('suspend_sale',payload,event.currentTarget)){
      checkoutDraft=undefined;
      render();toast('Pré-venda suspensa. Estoque disponível.');
    }
  };
  function checkoutShortcut(event){
    if(event.key==='F9'){event.preventDefault();form.requestSubmit();return true;}
    if(event.key==='F4' && items.length && !draft.pending){event.preventDefault();const quantity=cart.querySelector('[data-quantity]');quantity?.focus();quantity?.select();return true;}
    if(event.key==='Escape'){event.preventDefault();search.focus();return true;}
    return false;
  }
  form.onkeydown=checkoutShortcut;

  function matches(){
    const term = normalized((search.value || '').trim());
    return activeProducts().filter(product=>[product.name,product.code,product.brand].some(value=>normalized(value).includes(term)));
  }
  function paintResults(){
    const products = matches();
    const visible = products.slice(0,40);
    find('#pos-search-status').textContent = !products.length?'Nenhum produto encontrado.':
      products.length>visible.length?`${products.length} produtos. Refine a busca para ver mais.`:'';
    results.innerHTML = visible.length?`<table><thead><tr><th>Produto</th><th>Estoque</th><th>Preço</th><th>Adicionar</th></tr></thead>
      <tbody>${visible.map(product=>`<tr>
        <td><strong>${esc(product.name)}</strong><small>${esc(product.code || '')}</small></td>
        <td>${product.stock} un.</td><td>${money(product.price)}</td>
        <td><button type="button" class="secondary small" data-product="${esc(product.id)}" data-mode="unit" aria-label="Adicionar unidade de ${esc(product.name)}">Unidade</button>
        ${product.pack_size>1 && product.pack_price?`<button type="button" class="secondary small" data-product="${esc(product.id)}" data-mode="pack" aria-label="Adicionar embalagem de ${esc(product.name)}">${esc(product.pack_name || 'Caixa')} · ${money(product.pack_price)}</button>`:''}</td>
      </tr>`).join('')}</tbody></table>`:'';
  }
  function paintCart(){
    cart.innerHTML = items.length?`<table><thead><tr><th>Item</th><th>Qtd.</th><th>Subtotal</th><th>Remover</th></tr></thead>
      <tbody>${items.map((item,index)=>`<tr><td><strong>${esc(item.name)}</strong><small>${esc(item.label)} · ${money(item.price)}</small></td>
        <td><input type="number" min="1" step="1" required value="${item.quantity}" data-quantity="${index}" title="F4 para editar a quantidade do primeiro item" aria-label="Quantidade de ${esc(item.name)} em ${esc(item.label)}"></td>
        <td data-line-total>${money(item.quantity*item.price)}</td>
        <td><button type="button" class="secondary small" data-remove="${index}" aria-label="Remover ${esc(item.name)} em ${esc(item.label)}">×</button></td></tr>`).join('')}</tbody></table>`:'<p>Nenhum item adicionado.</p>';
    updateTotal();
  }
  function updateTotal(){
    const cents = items.reduce((sum,item)=>sum+item.quantity*Math.round(item.price*100),0);
    find('#pos-total').textContent = money(cents/100);
    const cashPayment=draft.payment==='Dinheiro';
    find('#pos-tender').hidden=!cashPayment;
    const change=Math.round(Number(draft.tender)*100)-cents;
    find('#pos-change').textContent=cashPayment && draft.tender!=='' && change>=0?'Troco '+money(change/100):'';
    find('#pos-suspend').disabled=!items.length || Boolean(draft.pending || draft.suspendedId);
    find('#pos-count').textContent = items.reduce((sum,item)=>sum+item.quantity,0)+' itens';
    find('#pos-finish').disabled = !items.length;
    find('#pos-finish').textContent = draft.pending?'Confirmar situação da venda':draft.payment==='A receber'?'Salvar nota em aberto':'Finalizar venda e gerar comprovante';
  }
  function setQuantity(item, quantity){
    const product = activeProducts().find(p=>p.id===item.id);
    const factor = line=>line.mode==='pack'?(product?.pack_size || 1):1;
    const reserved = items.filter(line=>line!==item && line.id===item.id).reduce((sum,line)=>sum+line.quantity*factor(line),0);
    if(!product || !Number.isSafeInteger(quantity) || quantity<1 || reserved+quantity*factor(item)>product.stock){
      feedback.textContent = `Confira a quantidade de ${item.name}. Estoque atual: ${product?.stock ?? 0} un.`;
      return false;
    }
    item.quantity = quantity;
    feedback.textContent = '';
    return true;
  }
  function addProduct(product,mode){
    if(!product || busy || draft.pending) return;
    let item = items.find(line=>line.id===product.id && line.mode===mode);
    const existing = Boolean(item);
    const price = Number(mode==='pack'?product.pack_price:product.price);
    if(!(price>0)){feedback.textContent='Confira o preço cadastrado do produto.';return;}
    if(!existing && items.length>=100){feedback.textContent='A venda pode ter até 100 linhas.';return;}
    item ??= {id:product.id,mode,name:product.name,label:mode==='pack'?product.pack_name || 'Caixa':'Unidade',price,quantity:0};
    item.price = price;
    if(setQuantity(item,item.quantity+1)){
      if(!existing) items.push(item);
      paintCart();
      search.value = '';
      paintResults();
    } else search.select?.();
    search.focus();
  }
  search.oninput = paintResults;
  search.onkeydown = event=>{
    if(checkoutShortcut(event)) return;
    if(event.key!=='Enter' || event.isComposing) return;
    event.preventDefault();
    const term = normalized(search.value.trim());
    if(!term) return;
    const found = matches();
    const code = found.filter(product=>normalized(product.code)===term);
    if(code.length===1) addProduct(code[0],'unit');
    else if(found.length===1) addProduct(found[0],'unit');
    else find('#pos-search-status').textContent = found.length?'Selecione o produto na tabela.':'Nenhum produto encontrado.';
  };
  results.onclick = event=>{
    const button = event.target.closest('[data-product]');
    if(button) addProduct(activeProducts().find(p=>p.id===button.dataset.product),button.dataset.mode);
  };
  cart.onchange = event=>{
    const input = event.target;
    const item = items[input.dataset.quantity];
    if(!item || busy || draft.pending) return;
    if(!setQuantity(item,input.valueAsNumber)) input.value = item.quantity;
    input.closest('tr').querySelector('[data-line-total]').textContent = money(item.quantity*item.price);
    updateTotal();
  };
  cart.onclick = event=>{
    const button = event.target.closest('[data-remove]');
    if(!button || busy || draft.pending) return;
    items.splice(Number(button.dataset.remove),1);
    feedback.textContent = '';
    paintCart();
    search.focus();
  };
  form.onsubmit = async event=>{
    event.preventDefault();
    if(busy || !items.length) return;
    const party = draft.pending?.payload.party ?? form.elements.party.value.trim();
    if(!party){feedback.textContent='Informe o nome do cliente.';form.elements.party.focus();return;}
    const payment = form.elements.payment.value;
    const tender=payment==='Dinheiro' && draft.tender?Number(draft.tender):null;
    const total=items.reduce((sum,item)=>sum+item.quantity*Math.round(item.price*100),0)/100;
    if(!draft.pending && payment==='Dinheiro' && (tender===null || !Number.isFinite(tender) || tender<total)){
      feedback.textContent='Informe um valor recebido igual ou superior ao total.';form.elements.tender.focus();return;
    }
    const payload = draft.pending?.payload ?? {party,payment,tender,suspendedId:draft.suspendedId,customerId:draft.customerId,items:items.map(({id,mode,quantity,price})=>({id,mode,quantity,price}))};
    if(draft.pending) form.adegaCommand = draft.pending.command;
    const submission = saveCommand('checkout',payload,form);
    const command = form.adegaCommand;
    draft.pending = {payload,command};
    setCheckoutEditing(false);
    feedback.textContent = 'Confirmando venda…';
    const saved = await submission;
    draft.pending = !saved && form.adegaCommand ? {payload,command} : null;
    if(saved){
      items.length = 0;
      draft.party = '';
      draft.customerId = '';
      draft.payment = 'Pix';
      draft.tender = '';
      draft.suspendedId = '';
    }
    const activeForm = find('#pos-checkout');
    if(activeForm && activeForm!==form && checkoutDraft===draft){
      render();
      return;
    }
    if(!form.isConnected) return;
    setCheckoutEditing(!draft.pending);
    if(!saved){
      feedback.textContent = draft.pending
        ? 'A confirmação foi interrompida. Verifique a situação da mesma venda antes de editar os itens.'
        : form.adegaError;
      updateTotal();
      return;
    }
    form.elements.tender.value = '';
    form.elements.party.value = '';
    form.elements.party.readOnly = false;
    form.elements.customerId.value = '';
    form.elements.payment.value = 'Pix';
    feedback.textContent = '';
    paintCart();
    paintResults();
    search.focus();
    const lines = db.movements.filter(m=>m.saleId===command.requestId);
    if(lines.length) showReceipt(lines[0]);
    const expected=find('#pos-expected');
    if(expected) expected.textContent=money(db.cashExpected);
    toast(payment==='A receber'?'Nota em aberto registrada.':'Venda registrada.');
  };
  function setCheckoutEditing(enabled){
    for(const control of form.querySelectorAll('input,select,[data-remove]')) control.disabled = !enabled;
  }
  paintResults();
  paintCart();
  if(draft.pending){
    setCheckoutEditing(false);
    feedback.textContent = 'Verifique a situação da venda pendente.';
  }
  search.focus();
}


function transaction(){
  const type = 'purchase';
  const list = db.products.filter(p=>p.active);
  const normalize = value=>String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const queryElement = selector=>document.querySelector(selector);
  content.innerHTML = heading('Repor estoque','Encontre o produto para registrar a entrada.',
    '<button class="secondary" type="button" id="transaction-new-product">Cadastrar produto</button>')
    + (list.length?`<section class="card transaction-picker">
      <label>Pesquisar produto<input type="search" id="transaction-search" autocomplete="off" placeholder="Nome, marca ou código de barras"></label>
      <p id="transaction-search-status" role="status"></p>
      <div id="transaction-results" class="table-wrap" tabindex="0" aria-label="Resultados da pesquisa"></div>
    </section>
    <dialog id="transaction-entry" aria-labelledby="transaction-selected">
      <div class="modal-heading"><h2 id="transaction-selected"></h2><button id="close-transaction" class="icon-button" type="button" aria-label="Fechar reposição">×</button></div>
      <form id="transaction-form">
        <input name="product" type="hidden" id="transaction-product">
        <div class="form-grid">
          <label>Movimentar em<select name="mode"><option value="unit">Unidades</option><option value="pack">Embalagens completas</option></select></label>
          ${field('Quantidade','quantity',1,'number','required min="1" step="1" id="quantity" inputmode="numeric"')}
          ${field('Custo por unidade ou embalagem (R$)','price','','number','required min="0.01" step="0.01" id="unit-price"')}
          ${field('Fornecedor (opcional)','party','','text','maxlength="150"')}
        </div>
        <div class="form-summary"><span>Total da compra</span><strong id="transaction-total">${money(0)}</strong></div>
        <p id="transaction-stock" class="note" aria-live="polite"></p>
        <p id="transaction-error" role="alert"></p>
        <div class="modal-actions"><button id="cancel-transaction" type="button" class="secondary">Cancelar</button><button type="submit">Confirmar reposição</button></div>
      </form>
    </dialog>`:`<div class="card">${empty('Cadastre um produto antes de registrar movimentações.')}</div>`);
  queryElement('#transaction-new-product').onclick = ()=>productModal(undefined,()=>{
    if(location.hash==='#compras') transaction();
  });
  if(!list.length) return;

  const dialog = queryElement('#transaction-entry');
  const form = queryElement('#transaction-form');
  const close = ()=>{if(!busy) dialog.close();};
  queryElement('#close-transaction').onclick = queryElement('#cancel-transaction').onclick = close;
  dialog.oncancel = event=>{if(busy) event.preventDefault();};
  const prod = queryElement('#transaction-product');
  const price = queryElement('#unit-price');
  const search = queryElement('#transaction-search');
  const results = queryElement('#transaction-results');
  const status = queryElement('#transaction-search-status');
  const error = queryElement('#transaction-error');
  const selectedProduct = ()=>db.products.find(p=>p.id===prod.value && p.active);
  function total(){
    const selected = selectedProduct();
    const count = Number(form.elements.quantity.value);
    const units = count*(form.elements.mode.value==='pack'?(selected?.pack_size ?? 1):1);
    queryElement('#transaction-total').textContent = money(Number(price.value)*count);
    queryElement('#transaction-stock').textContent = selected?`${units} unidades serão adicionadas do estoque. Saldo atual: ${selected.stock} unidades.`:'';
  }
  prod.onchange = ()=>{
    const product = selectedProduct();
    const mode = form.elements.mode;
    const pack = mode.querySelector('[value=pack]');
    pack.disabled = !(product?.pack_size>1);
    pack.textContent = pack.disabled?'Embalagens completas':`${product.pack_name || 'Caixa'} com ${product.pack_size} unidades`;
    if(pack.disabled) mode.value = 'unit';
    const packed = mode.value==='pack';
    if(!product) price.value = '';
    else price.value = Math.round(product.cost*(packed?product.pack_size:1)*100)/100;
    total();
  };
  function matchingProducts(){
    const query = normalize((search.value || '').trim());
    return db.products.filter(p=>p.active && [p.name,p.brand,p.code,p.category].some(value=>normalize(value).includes(query)));
  }
  function displayResults(){
    const matches = matchingProducts();
    status.textContent = matches.length?`${matches.length} produto(s) encontrado(s).`:'Nenhum produto encontrado.';
    results.innerHTML = matches.length?`<table><thead><tr>
      <th scope="col">Produto</th><th scope="col">Marca</th><th scope="col">Código</th><th scope="col">Estoque</th><th scope="col">Custo / un.</th><th scope="col">Ação</th>
    </tr></thead><tbody>${matches.map(p=>`<tr><th scope="row">${esc(p.name)}</th><td>${esc(p.brand||'—')}</td><td>${esc(p.code||'—')}</td><td>${stockBreakdown(p)}</td><td>${money(p.cost)}</td><td><button type="button" class="secondary small" data-pick-product="${esc(p.id)}" aria-label="Selecionar ${esc(p.name)}">Selecionar</button></td></tr>`).join('')}</tbody></table>`:'';
  }
  function selectProduct(product){
    if(!product || busy) return;
    if(prod.value!==product.id) {
      form.elements.mode.value = 'unit';
      form.elements.quantity.value = '1';
    }
    prod.value = product.id;
    queryElement('#transaction-selected').textContent = product.name;
    error.textContent = '';
    prod.onchange();
    if(!dialog.open) dialog.showModal();
    queryElement('#quantity').focus();
  }
  results.onclick = event=>{
    const button = event.target.closest('[data-pick-product]');
    if(button) selectProduct(db.products.find(p=>p.id===button.dataset.pickProduct && p.active));
  };
  search.oninput = displayResults;
  search.onkeydown = event=>{
    if(event.key!=='Enter') return;
    event.preventDefault();
    const query = search.value.trim();
    if(!query) return;
    const matches = matchingProducts();
    const exact = matches.filter(p=>normalize(p.code)===normalize(query));
    if(exact.length===1) selectProduct(exact[0]);
    else if(matches.length===1) selectProduct(matches[0]);
    else if(exact.length>1) status.textContent = 'Mais de um produto tem este código. Selecione o produto na tabela.';
  };
  displayResults();
  form.elements.mode.onchange = prod.onchange;
  form.oninput = total;
  if(restockProductId){
    selectProduct(list.find(p=>p.id===restockProductId));
    restockProductId = null;
  }
  form.onsubmit = async event=>{
    event.preventDefault();
    if(busy) return;
    const product = selectedProduct();
    const quantity = Number(form.elements.quantity.value);
    const unit = Number(price.value);
    if(!product || !Number.isSafeInteger(quantity) || quantity<1 || !Number.isFinite(unit) || unit<=0) return;
    const mode = form.elements.mode.value;
    const party = form.elements.party.value.trim();
    const payload = {id:product.id,type,quantity,mode,price:unit,party,payment:''};
    error.textContent = '';
    if(await saveCommand('movement',payload,form)){
      if(!form.isConnected || location.hash!=='#compras') return;
      dialog.close();
      form.reset();
      displayResults();
      toast('Reposição registrada e estoque atualizado.');
      queryElement('#transaction-search').focus();
    }
  };
}


function movementHistory(){content.innerHTML=heading('Movimentações','O histórico de entradas e saídas da sua distribuidora.','<button class="secondary" id="export-csv">Exportar CSV ↓</button>')+`<div class="card"><div class="card-head"><h2>Histórico completo</h2><span class="badge">${db.movements.length} registros</span></div><div class="toolbar"><select id="type-filter" aria-label="Tipo de movimentação"><option value="">Todos os tipos</option><option value="sale">Vendas</option><option value="purchase">Compras</option><option value="opening">Estoque inicial</option></select><input type="date" id="from-date" aria-label="Data inicial"><input type="date" id="to-date" aria-label="Data final"></div><div id="history-table"></div></div>`;const filter=()=>{const type=document.querySelector('#type-filter').value;const from=document.querySelector('#from-date').value;const to=document.querySelector('#to-date').value;return [...db.movements].reverse().filter(m=>{const day=new Date(m.date);const local=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');return(!type||m.type===type)&&(!from||local>=from)&&(!to||local<=to)})};document.querySelectorAll('.toolbar input,.toolbar select').forEach(el=>el.onchange=()=>document.querySelector('#history-table').innerHTML=movementTable(filter()));document.querySelector('#history-table').innerHTML=movementTable(filter());document.querySelector('#export-csv').onclick=()=>{const cell=v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';download('Distribuidora-movimentacoes.csv','\uFEFF'+[['Data','Tipo','Status','Produto','Quantidade','Valor unitário','Total','Cliente/Fornecedor','Pagamento'],...filter().map(m=>[date(m.date),{sale:m.cancelledAt?'Venda cancelada':m.payment==='A receber'?'Venda em aberto':'Venda',purchase:'Compra',opening:'Estoque inicial'}[m.type],m.cancelledAt?'Cancelada':'Confirmada',m.name,m.quantity,m.price,movementTotal(m),m.party,m.payment||''])].map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8')}}
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function reports(){const sales=db.movements.filter(m=>m.type==='sale'&&!m.cancelledAt);const ranking=[...new Set(sales.map(m=>m.productId))].map(id=>({name:db.products.find(p=>p.id===id)?.name||sales.find(m=>m.productId===id).name,total:sales.filter(m=>m.productId===id).reduce((a,m)=>a+m.quantity,0)})).filter(p=>p.total).sort((a,b)=>b.total-a.total).slice(0,5);const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const key=d.toLocaleDateString('pt-BR');return {label:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),value:sales.filter(m=>new Date(m.date).toLocaleDateString('pt-BR')===key).reduce((a,m)=>a+movementTotal(m),0)}});const max=Math.max(1,...days.map(d=>d.value));content.innerHTML=heading('Relatórios','Entenda os resultados e planeje os próximos passos.')+stats()+`<div class="grid"><div class="card"><div class="card-head"><div><h2>Vendas nos últimos 7 dias</h2><p>Receita diária em reais</p></div></div><div class="chart"><div class="chart-columns">${days.map(d=>`<div class="chart-column" style="height:${Math.max(1,d.value/max*100)}%" title="${d.label}: ${money(d.value)}"><span>${d.label}</span></div>`).join('')}</div></div></div><div class="card"><div class="card-head"><h2>Bebidas mais vendidas</h2></div>${ranking.length?ranking.map(p=>`<div class="bar-row"><div class="bar-label"><span>${esc(p.name)}</span><b>${p.total} un.</b></div><div class="bar"><span style="width:${p.total/ranking[0].total*100}%"></span></div></div>`).join(''):empty('Registre vendas para visualizar os destaques.')}</div></div><div class="card"><div class="card-head"><div><h2>Backup dos dados</h2><p>Exporte uma cópia dos registros. A restauração do banco é feita pelo administrador no Supabase.</p></div><div class="actions"><button class="secondary" id="backup">Baixar backup ↓</button></div></div></div><div class="notice">Os indicadores consideram todo o histórico. Lucro bruto não inclui despesas operacionais, taxas ou impostos.</div>`;document.querySelector('#backup').onclick=()=>download('Distribuidora-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(db,null,2),'application/json')}
function animatePage(){if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;for(const element of [content]){if(element.hidden||!element.animate)continue;element.getAnimations().forEach(animation=>animation.cancel());element.animate([{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});}}
document.querySelector('#close-modal').onclick=document.querySelector('#cancel-modal').onclick=()=>document.querySelector('#modal').close();
function render(){if(!authenticated){login();return}document.body.classList.remove('auth-mode');document.querySelector('#auth-root').hidden=true;const page=location.hash.slice(1)||'vendas';document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page));({painel:panel,produtos:products,vendas:pointOfSale,compras:transaction,historico:movementHistory,relatorios:reports}[page]||pointOfSale)();if(page!==renderedPage){renderedPage=page;animatePage();}}
document.querySelector('#profile-signout').onclick=async()=>{if(busy)return;const button=document.querySelector('#profile-signout');button.disabled=true;button.textContent='Saindo…';sessionGeneration++;try{await api('logout',{});accountChannel?.postMessage('session-changed');authenticated=false;db={products:[],movements:[]};document.querySelector('#modal').close();location.hash='login';login();toast('Você saiu da sua conta.');}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Sair da conta'}};
window.addEventListener('hashchange',render);start();

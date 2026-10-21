export function orderMessage(items,address='',payment='') {
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const total=items.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0)/100;
  const sections=items.map(item=>`🛒 *${item.quantity} × ${item.name}*\n🏷️ Valor unitário: ${money(item.price)}\n💵 Valor: ${money(Math.round(item.price*100)*item.quantity/100)}`);
  sections.push(`💰 *Total a pagar: ${money(total)}*`);
  if(address.trim())sections.push('📍 *Endereço de entrega*\n'+address.trim().replace(/^Bairro:/gm,'🏘️ Bairro:').replace(/^Rua:/gm,'🛣️ Rua:').replace(/^Número:/gm,'🔢 Número:'));
  if(payment.trim())sections.push('💳 *Forma de pagamento*\n'+payment.trim());
  return sections.join('\n\n');
}
export function reconcileCart(cart,products) {
  let changed=false;
  for(const [id,item] of cart) {
    const current=products.find(product=>product.id===id);
    if(!current){cart.delete(id);changed=true;}
    else {if(Number(current.price)!==Number(item.price))changed=true;cart.set(id,{...current,quantity:item.quantity});}
  }
  const used=new Map();
  for(const [id,item] of cart){
    if(!Number.isSafeInteger(item.stockUnits)||item.stockUnits<0){cart.delete(id);changed=true;continue;}
    const key=item.productId||item.id,factor=item.units||1;
    const count=Math.min(item.quantity,Math.max(0,Math.floor((item.stockUnits-(used.get(key)||0))/factor)));
    if(count!==item.quantity)changed=true;
    if(!count)cart.delete(id);else{cart.set(id,{...item,quantity:count});used.set(key,(used.get(key)||0)+count*factor);}
  }
  return changed;
}
export function catalogVariants(products){
 return products.flatMap(p=>{
  if(!Number.isSafeInteger(p.availableUnits)||p.availableUnits<=0)return [];
  const common={...p,productId:p.id,stockUnits:p.availableUnits};
  const variants=[{...common,id:p.id+':unit',name:p.name+' · Unidade',units:1,image:p.unitImage||''}];
  if(p.packSize>1&&p.packPrice>0&&p.availablePacks>0)variants.push({...common,id:p.id+':pack',name:p.name+' · '+(p.packName||'Caixa')+' com '+p.packSize+' un.',price:p.packPrice,units:p.packSize,image:p.packImage||''});
  return variants;
 });
}
export function cartCapacity(cart,product){
 if(!Number.isSafeInteger(product.stockUnits)||product.stockUnits<0||!Number.isSafeInteger(product.units||1)||(product.units||1)<1)return 0;
 const used=[...cart.values()].filter(item=>item.id!==product.id&&(item.productId||item.id)===(product.productId||product.id)).reduce((n,item)=>n+item.quantity*(item.units||1),0);
 return Math.max(0,Math.floor((product.stockUnits-used)/(product.units||1)));
}
export function setCartQuantity(cart,product,quantity){
 if(!Number.isSafeInteger(quantity)||quantity<0||quantity>cartCapacity(cart,product))return false;
 if(!quantity)cart.delete(product.id);else cart.set(product.id,{...product,quantity});
 return true;
}

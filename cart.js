export function orderMessage(items,address='') {
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const total=items.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0)/100;
  const sections=items.map(item=>`🛒 *${item.quantity} × ${item.name}*\n🏷️ Valor unitário: ${money(item.price)}\n💵 Valor: ${money(Math.round(item.price*100)*item.quantity/100)}`);
  sections.push(`💰 *Total a pagar: ${money(total)}*`);
  if(address.trim())sections.push('📍 *Endereço de entrega*\n'+address.trim().replace(/^Bairro:/gm,'🏘️ Bairro:').replace(/^Rua:/gm,'🛣️ Rua:').replace(/^Número:/gm,'🔢 Número:'));
  return sections.join('\n\n');
}
export function reconcileCart(cart,products) {
  let changed=false;
  for(const [id,item] of cart) {
    const current=products.find(product=>product.id===id);
    if(!current){cart.delete(id);changed=true;}
    else {if(Number(current.price)!==Number(item.price))changed=true;cart.set(id,{...current,quantity:item.quantity});}
  }
  return changed;
}

export function orderMessage(store,items,notes='') {
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const total=items.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0)/100;
  return [`Olá, ${store}! Gostaria de pedir:`,...items.map(item=>`• ${item.quantity} × ${item.name}${item.brand?' ('+item.brand+')':''} — ${money(item.price*item.quantity)}`),'',`Total estimado: ${money(total)}`,notes.trim()?'Observações: '+notes.trim():'','Por favor, confirme a disponibilidade, o valor final e a entrega.'].filter(Boolean).join('\n');
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

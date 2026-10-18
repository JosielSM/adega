export function orderMessage(store,items,notes='') {
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const total=items.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0)/100;
  const sections=[
    `Olá, *${store}*! 👋\nGostaria de fazer este pedido:`,
    '🛒 *MEU PEDIDO*\n\n'+items.map(item=>`🍺 *${item.quantity} × ${item.name}*${item.brand&&item.brand.toLocaleLowerCase()!==item.name.toLocaleLowerCase()?'\nMarca: '+item.brand:''}\n   Valor unitário: ${money(item.price)}\n   Subtotal: ${money(Math.round(item.price*100)*item.quantity/100)}`).join('\n\n'),
    `💰 *Total estimado: ${money(total)}*`
  ];
  if(notes.trim())sections.push('📝 *Observações*\n'+notes.trim());
  sections.push('📦 Por favor, confirme a disponibilidade, o valor final e a entrega.\nObrigado! 😊');
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

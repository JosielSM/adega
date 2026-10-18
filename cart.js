export function orderMessage(items) {
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const total=items.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0)/100;
  const sections=items.map(item=>`*${item.quantity} × ${item.name}*\nValor unitário: ${money(item.price)}\nValor: ${money(Math.round(item.price*100)*item.quantity/100)}`);
  sections.push(`*Total a pagar: ${money(total)}*`);
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

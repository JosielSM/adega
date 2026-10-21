// Trust only presentation sizes, prices and balances read from the database.
export function validateCatalogCart(catalog,items){
 if(!catalog||!Array.isArray(items)||!items.length||items.length>100)throw Error('Pedido inválido. Confira o carrinho.');
 const used=new Map(),seen=new Set();
 return items.map(item=>{
  if(!item||typeof item.id!=='string'||seen.has(item.id)||!Number.isSafeInteger(item.quantity)||item.quantity<1)throw Error('Quantidade inválida. Confira o carrinho.');
  seen.add(item.id);
  const [id,mode,...extra]=item.id.split(':');
  const p=catalog.products?.find(p=>p.id===id);
  if(!p||extra.length||!['unit','pack'].includes(mode))throw Error('Um produto não está mais disponível. Atualize o carrinho.');
  const size=mode==='pack'?p.packSize:1,price=mode==='pack'?p.packPrice:p.price;
  if(!Number.isSafeInteger(p.availableUnits)||p.availableUnits<0||!Number.isSafeInteger(size)||size<1||(mode==='pack'&&size<2)||!Number.isFinite(price)||price<=0)throw Error('Produto sem estoque confirmado para esta apresentação.');
  const units=item.quantity*size,total=(used.get(id)||0)+units;
  if(!Number.isSafeInteger(total)||total>p.availableUnits)throw Error('Estoque insuficiente para '+p.name+'. Há '+p.availableUnits+' unidades ('+Math.floor(p.availableUnits/(p.packSize||1))+' embalagens completas). Unidades e embalagens compartilham o mesmo saldo.');
  used.set(id,total);
  return {id:item.id,name:p.name+(mode==='pack'?' · '+(p.packName||'Caixa')+' com '+size+' un.':' · Unidade'),quantity:item.quantity,price};
 });
}

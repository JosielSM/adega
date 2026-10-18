(() => {
  let products=[];
  const status=document.querySelector('#catalog-status'),retry=document.querySelector('#catalog-retry');
  const search=document.querySelector('#catalog-search'),category=document.querySelector('#catalog-category');
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  function render(){
    const list=products.filter(p=>(p.name+' '+p.brand).toLocaleLowerCase('pt-BR').includes(search.value.toLocaleLowerCase('pt-BR'))&&(!category.value||p.category===category.value));
    const root=document.querySelector('#catalog-products');root.replaceChildren();
    for(const p of list){const card=document.createElement('article');card.className='beverage';
      for(const [tag,cls,text] of [['span','category',p.category],['h2','',p.name],['p','brand',p.brand],['p','price',money(p.price)]]){const node=document.createElement(tag);node.className=cls;node.textContent=text;card.append(node);}root.append(card);}
    status.textContent=list.length?`${list.length} bebidas disponíveis`:products.length?'Nenhuma bebida encontrada. Ajuste os filtros.':'Nenhum produto disponível no momento.';
  }
  async function load(){
    retry.hidden=true;
    try{const response=await fetch('/api/catalog?loja='+encodeURIComponent(new URLSearchParams(location.search).get('loja')||''),{credentials:'omit',cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Catálogo indisponível.');
      document.querySelector('.brand-scene').hidden=false;window.dispatchEvent(new Event('catalog-ready'));
      products=result.products;document.title=result.name+' · Catálogo';document.querySelector('#store-name').textContent=result.name;
      document.querySelector('#store-logo').src=/^data:image\/png;base64,/.test(result.logo)?result.logo:'/assets/logo.svg';
      const selected=category.value;category.replaceChildren(new Option('Todas',''));for(const name of [...new Set(products.map(p=>p.category))])category.add(new Option(name,name));category.value=selected;
      document.querySelector('#catalog-filters').hidden=false;document.querySelector('#catalog-note').hidden=false;render();
    }catch(error){document.querySelector('.brand-scene').hidden=true;products=[];document.querySelector('#catalog-products').replaceChildren();document.querySelector('#catalog-filters').hidden=true;document.querySelector('#catalog-note').hidden=true;status.textContent=error.message;retry.hidden=false;}
  }
  search.oninput=render;category.onchange=render;retry.onclick=load;
  setInterval(()=>{if(!document.hidden)load();},30000);window.addEventListener('online',load);load();
})();

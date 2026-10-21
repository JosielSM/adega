function setupProductImages(fields,product){
 const drafts={},pending=new Set(),generation=sessionGeneration;
 const submit=document.querySelector('#modal-form button[type=submit]');
 for(const kind of ['unit','pack']){
  const input=fields.querySelector('[data-photo-input='+kind+']'),preview=fields.querySelector('[data-photo-preview='+kind+']'),remove=fields.querySelector('[data-photo-remove='+kind+']'),feedback=fields.querySelector('[data-photo-feedback='+kind+']');
  function paint(source){preview.hidden=!source;if(source)preview.src=source;else preview.removeAttribute('src');remove.hidden=!source;}
  paint(product['has_'+kind+'_image']?'/api/product/image?id='+product.id+'&mode='+kind+'&v='+product.image_version:'');
  remove.onclick=()=>{drafts[kind]='';input.value='';feedback.textContent='A foto será removida ao salvar.';paint('');};
  input.onchange=async()=>{
   const file=input.files[0];if(!file)return;
   pending.add(kind);submit.disabled=true;input.disabled=true;remove.disabled=true;feedback.textContent='Preparando imagem…';let bitmap;
   try{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Escolha uma imagem JPG, PNG ou WebP de até 5 MB.');
    bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');let result='';
    for(const size of [512,384,256,192]){
     const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
     const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,canvas.width,canvas.height);result=canvas.toDataURL('image/jpeg',.8);if(result.length<=65536)break;
    }
    if(result.length>65536)throw Error('Não foi possível preparar a imagem. Tente outra foto.');
    if(generation!==sessionGeneration||!preview.isConnected)return;
    drafts[kind]=result;paint(result);feedback.textContent='Foto pronta. Salve o produto para publicar.';
   }catch(error){feedback.textContent=error.message||'Não foi possível abrir a imagem.';input.value='';}
   finally{bitmap?.close();pending.delete(kind);input.disabled=false;remove.disabled=false;if(preview.isConnected&&generation===sessionGeneration&&!pending.size&&!busy)submit.disabled=false;}
  };
 }
 return {busy:()=>pending.size>0,values:()=>({...(drafts.unit!==undefined?{unit_image:drafts.unit}:{}),...(drafts.pack!==undefined?{pack_image:drafts.pack}:{})})};
}

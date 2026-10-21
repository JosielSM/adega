import { authRoute } from './auth.js';
import { validateCatalogCart } from './catalog-stock.js';
const COOKIE = 'adega_session';
const LIMIT = 32 * 1024;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

function productImage(data){
 if(typeof data!=='string'||data.length>65536||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(data))throw new ApiError(404,'Imagem indisponível.');
 let bytes;try{bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));}catch{throw new ApiError(404,'Imagem indisponível.');}
 return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
}

async function body(request, limit = LIMIT) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Envie dados em JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Dados obrigatórios.');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new ApiError(413, 'Requisição muito grande.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw Error();
    return data;
  } catch { throw new ApiError(400, 'JSON inválido.'); }
}

function session(request) {
  return request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
}

function cookie(request, token, age) {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

async function supabase(env, path, token, data, method = 'POST') {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    method,
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: method==='GET'?undefined:JSON.stringify(data),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (path.startsWith('/auth/')) {
      if(response.status===429)throw new ApiError(429,'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      const messages={signup_disabled:'Novos cadastros estão temporariamente indisponíveis.',email_not_confirmed:'Confirme seu e-mail antes de entrar. Confira sua caixa de entrada.',weak_password:'Sua senha não atende aos requisitos de segurança.',same_password:'Escolha uma senha diferente da senha atual.',otp_expired:'Link inválido ou expirado. Solicite um novo link.',over_email_send_rate_limit:'Aguarde alguns minutos antes de solicitar outro e-mail.',email_address_not_authorized:'O envio de e-mails para novos usuários ainda está sendo configurado.',email_address_invalid:'Informe um e-mail válido.',user_already_exists:'Se você já possui uma conta, entre ou recupere sua senha.'};
      if(messages[error.code])throw new ApiError(400,messages[error.code]);
      if(path.includes('/token?grant_type=password'))throw new ApiError(401,'E-mail ou senha inválidos. Confira seus dados e tente novamente.');
      throw new ApiError(400,'Não foi possível concluir a solicitação. Tente novamente ou solicite um novo link.');
    }
    if (response.status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') throw new ApiError(401, 'Sessão expirada. Entre novamente.');
    const messages = { P0001: error.message, '23505': 'Este código já foi cadastrado.', '23514': 'Valores inválidos. Confira os campos.', '22P02': 'Dados inválidos.', '22003': 'Valor acima do limite permitido.' };
    if (messages[error.code]) throw new ApiError(400, messages[error.code]);
    console.error(JSON.stringify({ event: 'database_error', status: response.status, code: error.code }));
    throw new ApiError(502, 'Não foi possível acessar o banco de dados.');
  }
  return response.status === 204 ? null : response.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, 'Método não permitido.');
      if (request.method === 'POST' && request.headers.get('origin') !== url.origin) throw new ApiError(403, 'Origem não permitida.');
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        const token=session(request);
        if(token&&env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY){
          try{await supabase(env,'/auth/v1/logout?scope=local',token,{});}catch{ /* Always allow clearing this browser's cookies. */ }
        }
        const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json'});
        for(const name of ['adega_session','adega_recovery','adega_pkce','adega_pkce_kind'])headers.append('Set-Cookie',cookie(request,'',0).replace('adega_session=',name+'='));
        return new Response(JSON.stringify({ok:true}),{status:200,headers});
      }
      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new ApiError(503, 'Configure a conexão com o Supabase no Worker.');
      if(url.pathname.startsWith('/api/auth/')){
        const response=await authRoute(request,env,{supabase,body,json,cookie,session,ApiError});
        if(response)return response;
        throw new ApiError(404,'Rota não encontrada.');
      }
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const data = await body(request);
        if (typeof data.email !== 'string' || typeof data.password !== 'string' || !data.email.trim() || !data.password || data.email.length > 254 || data.password.length > 1024) throw new ApiError(400, 'Informe e-mail e senha.');
        const auth = await supabase(env, '/auth/v1/token?grant_type=password', null, { email: data.email.trim(), password: data.password });
        return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, auth.access_token, Math.min(auth.expires_in, 3600)) });
      }
      if(url.pathname==='/api/catalog/image'&&request.method==='GET'){
        const slug=url.searchParams.get('loja'),id=url.searchParams.get('id'),mode=url.searchParams.get('mode');
        if(!/^[0-9a-f-]{36}$/i.test(slug||'')||!/^[0-9a-f-]{36}$/i.test(id||'')||!['unit','pack'].includes(mode))throw new ApiError(404,'Imagem indisponível.');
        return productImage(await supabase(env,'/rest/v1/rpc/adega_catalog_image',null,{p_slug:slug,p_id:id,p_mode:mode}));
      }
      if (url.pathname === '/api/catalog' && request.method === 'GET') {
        const slug=url.searchParams.get('loja') || '';
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) throw new ApiError(404,'Catálogo indisponível.');
        if(url.searchParams.get('v')!=='2')throw new ApiError(426,'O catálogo foi atualizado. Recarregue esta página para conferir o estoque e continuar.');
        const catalog=await supabase(env,'/rest/v1/rpc/adega_public_catalog',null,{p_slug:slug});
        if(!catalog)throw new ApiError(404,'Catálogo indisponível.');
        return json(catalog);
      }
      if(url.pathname==='/api/catalog/checkout'&&request.method==='POST'){
        const data=await body(request);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.slug||''))throw new ApiError(404,'Catálogo indisponível.');
        const catalog=await supabase(env,'/rest/v1/rpc/adega_public_catalog',null,{p_slug:data.slug});
        if(!catalog)throw new ApiError(404,'Catálogo indisponível.');
        let items;try{items=validateCatalogCart(catalog,data.items);}catch(error){throw new ApiError(409,error.message);}
        return json({items,whatsapp:catalog.whatsapp});
      }
      const token = session(request);
      if (!token) throw new ApiError(401, 'Entre para acessar sua distribuidora.');
      if(url.pathname==='/api/product/image'&&request.method==='GET'){
        const id=url.searchParams.get('id'),mode=url.searchParams.get('mode');
        if(!/^[0-9a-f-]{36}$/i.test(id||'')||!['unit','pack'].includes(mode))throw new ApiError(404,'Imagem indisponível.');
        return productImage(await supabase(env,'/rest/v1/rpc/adega_product_image',token,{p_id:id,p_mode:mode}));
      }
      if(url.pathname === '/api/catalog/settings') {
        if(request.method==='GET')return json(await supabase(env,'/rest/v1/rpc/adega_catalog_settings',token,{}));
        const data=await body(request);
        if(Object.hasOwn(data,'whatsapp')) {
          if(typeof data.whatsapp!=='string')throw new ApiError(400,'Informe um WhatsApp válido com DDD.');
          let number=data.whatsapp.replace(/\D/g,'');
          if(number.length===10||number.length===11)number='55'+number;
          if(number&&!/^55\d{10,11}$/.test(number))throw new ApiError(400,'Informe um WhatsApp brasileiro com DDD.');
          return json(await supabase(env,'/rest/v1/rpc/adega_catalog_contact',token,{p_whatsapp:number}));
        }
        if(typeof data.enabled!=='boolean')throw new ApiError(400,'Informe se deseja publicar o catálogo.');
        return json(await supabase(env,'/rest/v1/rpc/adega_catalog_configure',token,{p_enabled:data.enabled}));
      }
      if (url.pathname === '/api/profile') {
        let profile;
        if (request.method === 'POST') {
          const data = await body(request, 96 * 1024);
          if (typeof data.companyName !== 'string' || data.companyName.trim().length > 80 || typeof data.logo !== 'string' || data.logo.length > 65536 || (data.logo && !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(data.logo))) throw new ApiError(400, 'Informe um nome de até 80 caracteres e uma logo PNG válida de até 48 KB.');
          profile = await supabase(env, '/rest/v1/rpc/adega_profile_save', token, {p_name:data.companyName.trim(),p_logo:data.logo});
        } else profile = await supabase(env, '/rest/v1/rpc/adega_profile_get', token, {});
        const user = await supabase(env, '/auth/v1/user', token, undefined, 'GET');
        return json({email:user.email || '',companyName:profile.companyName,logo:profile.logo});
      }
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return json(await supabase(env, '/rest/v1/rpc/adega_state', token, {}));
      }
      if (url.pathname === '/api/command' && request.method === 'POST') {
        const data = await body(request,160*1024);
        if (!['create_product', 'update_product', 'set_active', 'movement', 'delete_product', 'cancel_sale'].includes(data.action) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.requestId || '') || !data.payload || typeof data.payload !== 'object' || Array.isArray(data.payload)) throw new ApiError(400, 'Operação inválida.');
        for(const name of ['unit_image','pack_image'])if(Object.hasOwn(data.payload,name)&&(typeof data.payload[name]!=='string'||data.payload[name].length>65536||(data.payload[name]&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(data.payload[name]))))throw new ApiError(400,'Imagem inválida. Selecione novamente a foto do produto.');
        if(data.action==='cancel_sale')return json(await supabase(env,'/rest/v1/rpc/adega_cancel_sale',token,{p_id:data.payload.id,p_request_id:data.requestId}));
        if(data.action==='delete_product')return json(await supabase(env,'/rest/v1/rpc/adega_delete_product',token,{p_id:data.payload.id,p_request_id:data.requestId}));
        return json(await supabase(env, '/rest/v1/rpc/adega_command', token, { p_action: data.action, p_payload: data.payload, p_request_id: data.requestId }));
      }
      throw new ApiError(404, 'Rota não encontrada.');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(JSON.stringify({ event: 'request_failed', path: url.pathname, name: error.name }));
      return json({ error: error instanceof ApiError ? error.message : 'Falha de conexão. Tente novamente.' }, error.status || 502);
    }
  }
};

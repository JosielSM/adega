import {sessionHeaders} from './session.js';
const POLICY = 'Use pelo menos 8 caracteres, letras maiúsculas e minúsculas, número e símbolo.';
export function validPassword(password) {
  return typeof password==='string' && password.length>=8 && password.length<=128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^\w\s]|_/.test(password);
}
export async function authRoute(request, env, { supabase, body, json, cookie, session, ApiError }) {
  const url=new URL(request.url), path=url.pathname;
  const origin=url.origin;
  const getCookie=name=>request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
  const flowCookie=(name,value,age=600)=>`${name}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol==='https:'?'; Secure':''}`;
  const headersWithCookies=(...values)=>{const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});values.forEach(value=>headers.append('Set-Cookie',value));return headers;};
  const recoveryHeaders=auth=>headersWithCookies(flowCookie('adega_recovery',auth.access_token,600),flowCookie('adega_recovery_refresh',auth.refresh_token||'',auth.refresh_token?600:0));
  const redirect=(destination,headers=new Headers({'Cache-Control':'no-store'}))=>{headers.set('Location',new URL(destination,origin).href);return new Response(null,{status:303,headers});};
  const credentials=data=>{
    if(typeof data.email!=='string'||data.email.length>254||!/^\S+@\S+\.\S+$/.test(data.email.trim()))throw new ApiError(400,'Informe um e-mail válido.');
    return data.email.trim().toLowerCase();
  };
  const password=data=>{if(!validPassword(data.password))throw new ApiError(400,POLICY);return data.password;};
  const pkce=async()=>{
    const bytes=crypto.getRandomValues(new Uint8Array(48));
    const verifier=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
    const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    return {verifier,challenge};
  };
  if(path==='/api/auth/config' && request.method==='GET'){
    const settings=await supabase(env,'/auth/v1/settings',null,undefined,'GET');
    return json({google:!!settings.external?.google,signup:!settings.disable_signup});
  }
  if(path==='/api/auth/signup' && request.method==='POST'){
    const data=await body(request), email=credentials(data), secret=password(data), proof=await pkce();
    const auth=await supabase(env,`/auth/v1/signup?redirect_to=${encodeURIComponent(origin+'/api/auth/callback')}`,null,{email,password:secret,code_challenge:proof.challenge,code_challenge_method:'s256'});
    if(auth.access_token)return Response.json({authenticated:true},{headers:sessionHeaders(request,auth)});
    const headers=headersWithCookies(flowCookie('adega_pkce',proof.verifier,3600),flowCookie('adega_pkce_kind','signup',3600));
    headers.set('Content-Type','application/json');
    return new Response(JSON.stringify({message:'Cadastro recebido! Abra o link de confirmação do e-mail neste mesmo navegador. Se já tiver conta, use Entrar ou recupere sua senha.'}),{status:200,headers});
  }
  if(path==='/api/auth/recover' && request.method==='POST'){
    const data=await body(request), email=credentials(data), proof=await pkce();
    await supabase(env,`/auth/v1/recover?redirect_to=${encodeURIComponent(origin+'/api/auth/callback')}`,null,{email,code_challenge:proof.challenge,code_challenge_method:'s256'});
    const headers=headersWithCookies(flowCookie('adega_pkce',proof.verifier,3600),flowCookie('adega_pkce_kind','recovery',3600));
    headers.set('Content-Type','application/json');
    return new Response(JSON.stringify({message:'Se existir uma conta com esse e-mail, você receberá um link. Abra-o neste mesmo navegador para redefinir sua senha. Confira também a pasta de spam.'}),{status:200,headers});
  }
  if(path==='/api/auth/confirm' && request.method==='GET'){
    try{
      const token=url.searchParams.get('token_hash'), type=url.searchParams.get('type');
      if(!token || token.length>512 || !['signup','recovery','email'].includes(type))throw new ApiError(400,'Link inválido ou expirado. Solicite um novo link.');
      const auth=await supabase(env,'/auth/v1/verify',null,{token_hash:token,type});
      if(!auth.access_token)throw new ApiError(400,'Não foi possível validar este link.');
      if(type==='recovery')return redirect('/#redefinir',recoveryHeaders(auth));
      return redirect('/#painel',sessionHeaders(request,auth));
    }catch(error){return redirect('/?auth_error='+encodeURIComponent(error.message)+'#recuperar');}
  }
  if(path==='/api/auth/password' && request.method==='POST'){
    const recovery=getCookie('adega_recovery');
    if(!recovery)throw new ApiError(400,'Este link expirou. Solicite novamente a recuperação de senha.');
    const data=await body(request);
    await supabase(env,'/auth/v1/user',recovery,{password:password(data)},'PUT');
    const refresh=getCookie('adega_recovery_refresh');
    const auth=refresh?await supabase(env,'/auth/v1/token?grant_type=refresh_token',null,{refresh_token:refresh}):{access_token:recovery,expires_in:600};
    const headers=sessionHeaders(request,auth);
    headers.append('Set-Cookie',flowCookie('adega_recovery','',0));
    headers.append('Set-Cookie',flowCookie('adega_recovery_refresh','',0));
    headers.set('Content-Type','application/json');
    return new Response(JSON.stringify({authenticated:true}),{status:200,headers});
  }
  if(path==='/api/auth/google' && request.method==='POST'){
    const settings=await supabase(env,'/auth/v1/settings',null,undefined,'GET');
    if(!settings.external?.google)throw new ApiError(503,'O acesso com Google ainda está sendo configurado. Por enquanto, entre com e-mail e senha.');
    const {verifier,challenge}=await pkce();
    const destination=new URL('/auth/v1/authorize',env.SUPABASE_URL);
    destination.search=new URLSearchParams({provider:'google',redirect_to:origin+'/api/auth/callback',code_challenge:challenge,code_challenge_method:'s256',scopes:'openid email profile'}).toString();
    const headers=headersWithCookies(flowCookie('adega_pkce',verifier),flowCookie('adega_pkce_kind','google'));
    headers.set('Content-Type','application/json');
    return new Response(JSON.stringify({url:destination.href}),{status:200,headers});
  }
  if(path==='/api/auth/callback' && request.method==='GET'){
    const headers=headersWithCookies(flowCookie('adega_pkce','',0),flowCookie('adega_pkce_kind','',0));
    try{
      const verifier=getCookie('adega_pkce'),code=url.searchParams.get('code');
      if(!verifier||!code||code.length>2048||url.searchParams.has('error'))throw new ApiError(400,'Link ou acesso inválido. Abra o link no mesmo navegador em que iniciou a solicitação ou tente novamente.');
      const auth=await supabase(env,'/auth/v1/token?grant_type=pkce',null,{auth_code:code,code_verifier:verifier});
      if(!auth.access_token)throw new ApiError(400,'Não foi possível confirmar sua conta Google.');
      if(getCookie('adega_pkce_kind')==='recovery'){
        recoveryHeaders(auth).getSetCookie().forEach(value=>headers.append('Set-Cookie',value));
        return redirect('/#redefinir',headers);
      }
      sessionHeaders(request,auth).getSetCookie().forEach(value=>headers.append('Set-Cookie',value));
      return redirect('/#painel',headers);
    }catch(error){return redirect('/?auth_error='+encodeURIComponent(error.message)+'#login',headers);}
  }
  return null;
}

const PERSISTENCE = 365 * 24 * 60 * 60;
export const readCookie = (request,name) => request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
export function privateCookie(request,name,value,age) {
 return `${name}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export function sessionHeaders(request,auth) {
 const headers=new Headers({'Cache-Control':'no-store'});
 headers.append('Set-Cookie',privateCookie(request,'adega_session',auth.access_token,Math.min(auth.expires_in||3600,3600)));
 // Sliding persistence: renew this cookie whenever Supabase rotates the pair.
 // Never retain a previous account's refresh token after a new login.
 headers.append('Set-Cookie',privateCookie(request,'adega_refresh',auth.refresh_token||'',auth.refresh_token?PERSISTENCE:0));
 return headers;
}
export function requestSession(request,env,rawCall,ApiError) {
 const originalAccess=readCookie(request,'adega_session');
 let access=originalAccess, refreshed=false, pending;
 let cookies=[];
 async function refresh() {
  if(pending)return pending;
  const refreshToken=readCookie(request,'adega_refresh');
  if(!refreshToken)throw new ApiError(401,'Entre novamente para manter sua sessão conectada.');
  pending=(async()=>{
   let auth;
   try{auth=await rawCall(env,'/auth/v1/token?grant_type=refresh_token',null,{refresh_token:refreshToken});}
   catch(error){
    if(error.status===401||error.status===400)throw new ApiError(401,'Sua sessão foi encerrada. Entre novamente.');
    throw error; // Connection failures must not sign the user out.
   }
   if(!auth?.access_token||!auth.refresh_token)throw new ApiError(502,'Não foi possível renovar o acesso. Tentando novamente.');
   access=auth.access_token;refreshed=true;cookies=sessionHeaders(request,auth).getSetCookie();
   return access;
  })();
  return pending;
 }
 return {
  async token(){
   if(!access)return refresh();
   // This is only a renewal hint; Supabase still verifies every access token.
   try{const claims=JSON.parse(atob(access.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(Number.isFinite(claims.exp)&&claims.exp*1000<Date.now()+60000&&readCookie(request,'adega_refresh'))return refresh();}catch{}
   return access;
  },
  async call(targetEnv,path,token,data,method){
   if(!token||(token!==access&&token!==originalAccess))return rawCall(targetEnv,path,token,data,method);
   try{return await rawCall(targetEnv,path,access,data,method);}
   catch(error){
    if(error.status!==401||refreshed||!readCookie(request,'adega_refresh'))throw error;
    await refresh();
    return rawCall(targetEnv,path,access,data,method);
   }
  },
  apply(response){
   if(!cookies.length)return response;
   const headers=new Headers(response.headers);cookies.forEach(value=>headers.append('Set-Cookie',value));
   return new Response(response.body,{status:response.status,headers});
  }
 };
}

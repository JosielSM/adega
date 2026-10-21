import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'};
const req=(path,cookie='',data)=>new Request('https://adega.example/api/'+path,{method:data?'POST':'GET',headers:{origin:'https://adega.example','content-type':'application/json',cookie},body:data?JSON.stringify(data):undefined});
const jwt=exp=>'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({exp}))+'.signature';
const pair={access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'rotated-refresh',expires_in:3600};

test('login persists refresh token in a private cookie and never sends credentials in JSON',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json(pair));
 const response=await worker.fetch(req('login','',{email:'user@example.com',password:'password'}),env);
 assert.deepEqual(await response.json(),{ok:true});
 const refresh=response.headers.getSetCookie().find(c=>c.startsWith('adega_refresh='));
 assert.match(refresh,/Max-Age=31536000; Secure/);assert.match(refresh,/HttpOnly; SameSite=Strict/);
});
test('returning after access-cookie expiration restores the session using the refresh cookie',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push(url);
  if(url.includes('grant_type=refresh_token')){assert.deepEqual(JSON.parse(options.body),{refresh_token:'old-refresh'});return Response.json(pair);}
  assert.equal(options.headers.Authorization,'Bearer '+pair.access_token);return Response.json({products:[],movements:[]});
 });
 const response=await worker.fetch(req('state','adega_refresh=old-refresh'),env);
 assert.equal(response.status,200);assert.equal(calls.length,2);assert.match(response.headers.get('set-cookie'),/adega_refresh=rotated-refresh/);
});
test('signup, email confirmation and OAuth preserve renewal without granting recovery access',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json(pair));
 const flows=[req('auth/signup','',{email:'new@example.com',password:'Abcdefg1!'}),req('auth/confirm?token_hash=valid&type=signup'),req('auth/callback?code=valid','adega_pkce=proof; adega_pkce_kind=google')];
 for(const request of flows){
  const response=await worker.fetch(request,env);
  assert.ok([200,303].includes(response.status));
  assert.ok(response.headers.getSetCookie().some(c=>c.startsWith('adega_refresh=rotated-refresh;')));
 }
 const recovery=await worker.fetch(req('auth/confirm?token_hash=valid&type=recovery'),env);
 assert.ok(recovery.headers.getSetCookie().some(c=>c.startsWith('adega_recovery_refresh=rotated-refresh;')));
 assert.ok(!recovery.headers.getSetCookie().some(c=>c.startsWith('adega_refresh=')));
});
test('refresh happens before token expiry without exposing expired tokens to database',async t=>{
 const old=jwt(Math.floor(Date.now()/1000)+30);
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.includes('grant_type=refresh_token'))return Response.json(pair);
  assert.equal(options.headers.Authorization,'Bearer '+pair.access_token);return Response.json({products:[],movements:[]});
 });
 assert.equal((await worker.fetch(req('state',`adega_session=${old}; adega_refresh=old-refresh`),env)).status,200);
});
test('database token rejection refreshes and retries all profile reads under the new token',async t=>{
 let renewals=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.includes('grant_type=refresh_token')){renewals++;return Response.json(pair);}
  if(options.headers.Authorization==='Bearer old-token')return Response.json({code:'PGRST301'},{status:401});
  assert.equal(options.headers.Authorization,'Bearer '+pair.access_token);
  return Response.json(url.endsWith('/user')?{email:'owner@example.com'}:{companyName:'Minha empresa',logo:''});
 });
 const response=await worker.fetch(req('profile','adega_session=old-token; adega_refresh=old-refresh'),env);
 assert.equal(response.status,200);assert.equal(renewals,1);assert.equal((await response.json()).email,'owner@example.com');
});
test('transient failures never expire cookies or report a logout; invalid refresh is rejected',async t=>{
 for(const upstream of [503,429,400]){
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:upstream===400?'refresh_token_not_found':'unavailable'},{status:upstream}));
  const response=await worker.fetch(req('state','adega_refresh=old-refresh'),env);
  assert.equal(response.status,upstream===400?401:upstream===429?429:502);
  assert.equal(response.headers.get('set-cookie'),null);
  t.mock.restoreAll();
 }
});
test('logout after access expiration revokes session and clears every renewal cookie',async t=>{
 let revoked=false;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.includes('grant_type=refresh_token'))return Response.json(pair);
  assert.match(url,/logout\?scope=local/);assert.equal(options.headers.Authorization,'Bearer '+pair.access_token);revoked=true;return new Response(null,{status:204});
 });
 const response=await worker.fetch(req('logout','adega_refresh=old-refresh',{}),env);
 assert.equal(response.status,200);assert.ok(revoked);
 for(const name of ['adega_session','adega_refresh','adega_recovery','adega_recovery_refresh'])assert.ok(response.headers.getSetCookie().some(c=>c.startsWith(name+'=;')&&c.includes('Max-Age=0')));
 assert.doesNotMatch(response.headers.get('set-cookie'),/rotated-refresh/);
});
test('public catalog never refreshes or receives private session credentials',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.match(url,/rpc\/adega_public_catalog$/);assert.equal(options.headers.Authorization,undefined);return Response.json({products:[]});});
 const response=await worker.fetch(req('catalog?v=2&loja=12345678-1234-1234-1234-123456789012','adega_refresh=private-refresh'),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
});

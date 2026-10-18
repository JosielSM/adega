import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { validPassword } from '../src/auth.js';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'};
const post=(path,data,extra={})=>new Request('https://adega.example/api/'+path,{method:'POST',headers:{origin:'https://adega.example','content-type':'application/json',...extra},body:JSON.stringify(data)});

test('signup and recovery enforce password policy and valid email on server',async()=>{
  for(const value of ['abc','abcdefgh','Abcdefgh','Abcdefg1']) assert.equal(validPassword(value),false);
  assert.equal(validPassword('Abcdefg1!'),true);
  assert.equal((await worker.fetch(post('auth/signup',{email:'new@example.com',password:'weak'}),env)).status,400);
  assert.equal((await worker.fetch(post('auth/recover',{email:'invalid'}),env)).status,400);
});
test('signup with confirmation never exposes tokens and uses same-origin callback',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('redirect_to'),'https://adega.example/api/auth/callback');
    const data=JSON.parse(options.body);assert.equal(data.email,'new@example.com');
    assert.equal(data.code_challenge_method,'s256');assert.ok(data.code_challenge);
    return Response.json({user:{id:'new-id'},session:null});
  });
  const response=await worker.fetch(post('auth/signup',{email:'New@Example.com',password:'Abcdefg1!'}),env);
  assert.equal(response.status,200);assert.match((await response.json()).message,/confirma/);
  assert.match(response.headers.get('set-cookie'),/adega_pkce=/);assert.doesNotMatch(response.headers.get('set-cookie'),/adega_session=/);
});
test('recover requires recovery cookie; regular session cannot change password through recovery',async()=>{
  const response=await worker.fetch(post('auth/password',{password:'Abcdefg1!'},{cookie:'adega_session=regular-token'}),env);
  assert.equal(response.status,400);
});
test('email recovery places token in separate HttpOnly cookie, not application session',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({access_token:'recovery-token',expires_in:3600}));
  const response=await worker.fetch(new Request('https://adega.example/api/auth/confirm?token_hash=test-hash&type=recovery'),env);
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'https://adega.example/#redefinir');
  assert.match(response.headers.get('set-cookie'),/adega_recovery=recovery-token/);
  assert.doesNotMatch(response.headers.get('set-cookie'),/adega_session=/);
});
test('OAuth rejects callback without PKCE verifier',async()=>{
  const response=await worker.fetch(new Request('https://adega.example/api/auth/callback?code=attacker-code'),env);
  assert.equal(response.status,303);assert.match(response.headers.get('location'),/auth_error/);
  assert.doesNotMatch(response.headers.get('set-cookie'),/adega_session=/);
});
test('Google start uses PKCE and restricted scope with HttpOnly verifier',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({external:{google:true}}));
  const response=await worker.fetch(post('auth/google',{}),env);
  assert.equal(response.status,200);
  const destination=new URL((await response.json()).url);
  assert.equal(destination.origin,env.SUPABASE_URL);
  assert.equal(destination.searchParams.get('redirect_to'),'https://adega.example/api/auth/callback');
  assert.equal(destination.searchParams.get('code_challenge_method'),'s256');
  assert.ok(destination.searchParams.get('code_challenge').length>40);
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
});
test('unconfigured Google returns honest actionable error',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({external:{google:false}}));
  const response=await worker.fetch(post('auth/google',{}),env);
  assert.equal(response.status,503);assert.match((await response.json()).error,/configurado/);
});
test('expired confirmation links redirect to recovery, without leaking tokens',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:'otp_expired'},{status:403}));
  const response=await worker.fetch(new Request('https://adega.example/api/auth/confirm?token_hash=test-hash&type=recovery'),env);
  assert.equal(response.status,303);assert.match(response.headers.get('location'),/auth_error/);
  assert.equal(response.headers.get('set-cookie'),null);
});
test('PKCE recovery callback grants only recovery session, not stock access',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.match(url,/grant_type=pkce/);
    assert.equal(JSON.parse(options.body).code_verifier,'proof-from-browser');
    return Response.json({access_token:'recovery-token',expires_in:3600});
  });
  const response=await worker.fetch(new Request('https://adega.example/api/auth/callback?code=valid-code',{headers:{cookie:'adega_pkce=proof-from-browser; adega_pkce_kind=recovery'}}),env);
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'https://adega.example/#redefinir');
  assert.match(response.headers.get('set-cookie'),/adega_recovery=recovery-token/);
  assert.doesNotMatch(response.headers.get('set-cookie'),/adega_session=/);
  assert.equal((await worker.fetch(new Request('https://adega.example/api/state',{headers:{cookie:'adega_recovery=recovery-token'}}),env)).status,401);
});

test('signup without email confirmation signs in with a protected cookie',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({access_token:'new-session',expires_in:3600,user:{id:'new-id'}}));
 const response=await worker.fetch(post('auth/signup',{email:'new@example.com',password:'Abcdefg1!'}),env);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{authenticated:true});
 assert.match(response.headers.get('set-cookie'),/adega_session=new-session/);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});

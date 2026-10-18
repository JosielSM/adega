const COOKIE = 'adega_session';
const LIMIT = 32 * 1024;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

async function body(request) {
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
      if (length > LIMIT) { await reader.cancel(); throw new ApiError(413, 'Requisição muito grande.'); }
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

async function supabase(env, path, token, data) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') throw new ApiError(401, 'Sessão expirada. Entre novamente.');
    if (path.startsWith('/auth/')) throw new ApiError(401, 'E-mail ou senha inválidos.');
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
      if (url.pathname === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new ApiError(503, 'Configure a conexão com o Supabase no Worker.');
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const data = await body(request);
        if (typeof data.email !== 'string' || typeof data.password !== 'string' || !data.email.trim() || !data.password || data.email.length > 254 || data.password.length > 1024) throw new ApiError(400, 'Informe e-mail e senha.');
        const auth = await supabase(env, '/auth/v1/token?grant_type=password', null, { email: data.email.trim(), password: data.password });
        return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, auth.access_token, Math.min(auth.expires_in, 3600)) });
      }
      const token = session(request);
      if (!token) throw new ApiError(401, 'Entre para acessar sua adega.');
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return json(await supabase(env, '/rest/v1/rpc/adega_state', token, {}));
      }
      if (url.pathname === '/api/command' && request.method === 'POST') {
        const data = await body(request);
        if (!['create_product', 'update_product', 'set_active', 'movement'].includes(data.action) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.requestId || '') || !data.payload || typeof data.payload !== 'object' || Array.isArray(data.payload)) throw new ApiError(400, 'Operação inválida.');
        return json(await supabase(env, '/rest/v1/rpc/adega_command', token, { p_action: data.action, p_payload: data.payload, p_request_id: data.requestId }));
      }
      throw new ApiError(404, 'Rota não encontrada.');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(JSON.stringify({ event: 'request_failed', path: url.pathname, name: error.name }));
      return json({ error: error instanceof ApiError ? error.message : 'Falha de conexão. Tente novamente.' }, error.status || 502);
    }
  }
};

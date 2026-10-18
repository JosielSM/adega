# Adega

Sistema de gestão de bebidas em HTML, CSS e JavaScript. Use **Adega** como nome do projeto no Supabase e Cloudflare; o identificador técnico do Worker é `adega`.

## Arquitetura

Navegador → API no Cloudflare Worker → Supabase Data API → Postgres.

O mesmo Worker hospeda a interface com Static Assets e executa a API JavaScript. A Data API acessa o Postgres por HTTPS; não usamos D1 nem conexão TCP direta. Supabase Auth autentica os usuários. O Worker guarda o token em cookie HttpOnly, SameSite e Secure em HTTPS. Nenhuma chave administrativa ou senha do banco vai para o navegador.

As funções SQL validam as operações e calculam estoque e custo médio dentro de transações. Os comandos por conta são serializados, vendas acima do saldo são rejeitadas e um identificador impede duplicações na repetição da mesma requisição. O histórico preserva nome e custo no momento da operação.

## Preparar o Supabase

1. Crie um projeto chamado **Adega**.
2. Execute `supabase/migrations/001_adega.sql` e depois `supabase/migrations/002_account_isolation.sql` no SQL Editor, uma vez cada. A migração cria tabelas, índices, RLS e funções. Use um projeto novo ou confira conflitos de nomes antes da aplicação.
3. Em Authentication, habilite cadastro público com confirmação de e-mail e mantenha login anônimo desabilitado. Configure senha mínima de 8 caracteres, com letras maiúsculas, minúsculas, número e símbolo. Contas existentes continuam disponíveis.
4. Copie a URL e a chave **publishable** (ou a chave legada **anon**). Não use `service_role`, secret key ou senha do Postgres.

Cada usuário tem estoque próprio, isolado por `auth.uid()`. O mesmo usuário acessa os mesmos dados em dispositivos diferentes. Contas distintas não compartilham estoque; equipes com usuários separados exigem organizações e permissões.

## Desenvolvimento

Requer Node.js 22 ou superior e npm.

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
# Preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em .dev.vars.
npm run dev
```

Abra o endereço informado pelo Wrangler. Desenvolvimento usa o projeto Supabase configurado: utilize um projeto separado para testes. Abrir index.html diretamente não executa a API.

## Publicar na Cloudflare

```powershell
npx wrangler login
npm run build
npx wrangler deploy --dry-run
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npm run deploy
```

Informe os valores nos prompts. O build copia somente os arquivos públicos index.html, styles.css, auth.css, app.js, auth.js, visual.js e os arquivos assets/adega-bar.png e assets/logo.svg para dist. SQL, fontes do servidor e credenciais não são assets públicos. A publicação usa o Worker `adega`, configurado em wrangler.jsonc.

## Verificar

```powershell
npm run check
npm run build
npx wrangler deploy --dry-run
npm run types
```

Os testes da API usam respostas simuladas. O teste de banco executa a migração real no Postgres embarcado PGlite, simulando o schema de autenticação do Supabase, e verifica custo médio, saldo, duplicação, rollback e isolamento entre contas. O teste da interface verifica chamadas à API e repetição segura após falha de conexão. Antes de operar em produção, aplique a migração e valide login, cadastro, compra e venda no projeto Supabase real, incluindo vendas simultâneas e acesso com duas contas.

A sessão exige novo login quando expira, no máximo após uma hora; não há renovação automática. O botão Atualizar busca o estado atual do servidor. Não há atualização em tempo real.

## Dados e relatórios

Inclui cadastro, edição e inativação de bebidas, compras com custo médio, vendas, estoque mínimo, relatórios e CSV. Lucro é bruto, sem taxas, despesas e impostos. Editar custo no cadastro afeta operações futuras. Movimentações confirmadas são imutáveis nesta versão; cancelamentos e devoluções ainda não estão implementados.

O download JSON exporta os registros da conta para consulta. A restauração local foi removida: restaurações devem usar os recursos de backup do Postgres/Supabase pelo administrador. Dados anteriores em localStorage não são migrados automaticamente. Exporte-os antes de trocar de versão, caso existam registros.

## Referências

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Boas práticas de Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Identidade visual

Paleta azul petróleo, marrom e fundo claro, com fotografia própria gerada para a Adega. A faixa usa parallax suave na rolagem, desativado quando o dispositivo pede movimento reduzido. A imagem é servida pelo próprio Worker.

## Cadastro, recuperação e Google

A área pública possui login, cadastro somente com e-mail e senha e recuperação. O painel e os menus ficam ocultos por padrão, até a confirmação da sessão. A interface mostra carregamento, erros, lista de requisitos de senha e botão para mostrar/ocultar a senha. A API valida novamente a senha; validação visual não substitui a validação no servidor. Cada conta tem estoque próprio.

### Supabase Auth

- Site URL: https://adega.santosjosiel2003.workers.dev
- Redirect URLs: /api/auth/callback e /api/auth/confirm no mesmo domínio completo.
- Cadastro público habilitado, confirmação de e-mail mantida.
- Senha: mínimo 8 caracteres, maiúsculas, minúsculas, número e símbolo.
- Login e cadastro: /#login e /#cadastro. Recuperação: /#recuperar; nova senha: /#redefinir.

Os fluxos de e-mail usam PKCE: o link deve ser aberto no mesmo navegador em que a solicitação foi iniciada. A prova fica em cookie HttpOnly. O retorno de recuperação cria uma sessão temporária separada, sem acesso ao estoque, e permite salvar a nova senha. O endpoint /api/auth/confirm também aceita token_hash para futuros templates personalizados.

### Pendências de serviços externos

O SMTP de produção ainda precisa ser configurado no Supabase. O remetente padrão de testes envia somente para membros autorizados da organização; não serve para cadastro e recuperação de outras pessoas. A aplicação não indica sucesso quando o provedor retorna erro. Não desative confirmação de e-mail para contornar essa configuração.

O código de acesso com Google usa OAuth PKCE, mas o provedor ainda depende de Client ID e Client Secret no Supabase. O projeto Google Cloud Adega foi criado com autorização específica do proprietário, e a marca OAuth foi configurada após aceite autorizado da política. O cliente Web Adega está preparado; sua criação e o armazenamento das credenciais no Supabase aguardam confirmação específica. Nenhum serviço pago foi contratado. O botão informa que a configuração está pendente enquanto o provedor estiver desabilitado.

Para configurar Google: criar projeto Adega, configurar marca e público externo, criar cliente OAuth do tipo Web com origem https://adega.santosjosiel2003.workers.dev e callback https://gcyktgzpsbteugztugtq.supabase.co/auth/v1/callback. Guardar Client ID/Secret diretamente no provedor Google do Supabase, sem versionar. Habilitar apenas escopos openid, email e profile. Validar o login real depois da configuração.

## Isolamento reforçado entre contas

A migração 002 exige que cada movimentação pertença à mesma conta do produto. As leituras respeitam RLS sem privilégios elevados; escritas diretas e leitura dos comandos internos são bloqueadas. O proprietário vem da sessão autenticada, nunca de campos enviados pelo navegador. Produtos, compras, vendas, relatórios e exportações usam somente os dados dessa conta. Trocar a sessão limpa os dados na interface, notifica outras abas e descarta respostas antigas em trânsito.

Os 20 testes locais incluem duas contas, tentativa de falsificar o proprietário, acesso cruzado por ID e reutilização de códigos e identificadores entre contas. O roteiro supabase/tests/account-isolation.sql também foi executado no Postgres de produção com resultado positivo e rollback integral.

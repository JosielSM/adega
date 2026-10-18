# Adega

Sistema de gestão de bebidas em HTML, CSS e JavaScript. Use **Adega** como nome do projeto no Supabase e Cloudflare; o identificador técnico do Worker é `adega`.

## Arquitetura

Navegador → API no Cloudflare Worker → Supabase Data API → Postgres.

O mesmo Worker hospeda a interface com Static Assets e executa a API JavaScript. A Data API acessa o Postgres por HTTPS; não usamos D1 nem conexão TCP direta. Supabase Auth autentica os usuários. O Worker guarda o token em cookie HttpOnly, SameSite e Secure em HTTPS. Nenhuma chave administrativa ou senha do banco vai para o navegador.

As funções SQL validam as operações e calculam estoque e custo médio dentro de transações. Os comandos por conta são serializados, vendas acima do saldo são rejeitadas e um identificador impede duplicações na repetição da mesma requisição. O histórico preserva nome e custo no momento da operação.

## Preparar o Supabase

1. Crie um projeto chamado **Adega**.
2. Execute `supabase/migrations/001_adega.sql` no SQL Editor uma vez. A migração cria tabelas, índices, RLS e funções. Use um projeto novo ou confira conflitos de nomes antes da aplicação.
3. Em Authentication, desative cadastro público e crie o usuário de operação com e-mail confirmado e senha. Esta versão possui login; cadastro e redefinição de senha são administrados no Supabase.
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

Informe os valores nos prompts. O build copia somente os arquivos públicos index.html, styles.css, app.js, visual.js e a fotografia assets/adega-bar.png para dist. SQL, fontes do servidor e credenciais não são assets públicos. A publicação usa o Worker `adega`, configurado em wrangler.jsonc.

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

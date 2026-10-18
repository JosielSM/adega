# Publicação da Adega

Atualizado em 18/10/2026.

- Worker Cloudflare: `adega`.
- Endereço: https://adega.santosjosiel2003.workers.dev
- Versão publicada: `2a504e55-ddd8-408a-959d-4bbd5bfed611`.
- HTML, JavaScript e CSS públicos verificados com HTTP 200.
- Testes locais: 10 aprovados, incluindo a migração em Postgres embarcado.

## Banco conectado

O projeto Supabase **Adega**, referência `gcyktgzpsbteugztugtq`, foi criado na região São Paulo. A estrutura SQL foi aplicada com sucesso pelo SQL Editor. URL e chave publishable foram configuradas como secrets no Worker. Nenhuma chave administrativa é utilizada pela aplicação.

A Data API está habilitada, com exposição automática de tabelas desabilitada e RLS habilitada. O usuário de operação foi criado pelo proprietário. O cadastro público foi habilitado a pedido do proprietário, com confirmação de e-mail e contas isoladas. O envio de e-mails para novos usuários depende da configuração SMTP descrita abaixo.

O projeto anterior da conta contém migrações de outro sistema e não foi alterado.

## Validação em produção

Um teste SQL executado no Postgres real verificou cadastro de produto, compra, venda, custo médio, idempotência, bloqueio de estoque negativo, preservação do custo histórico e isolamento entre contas. O teste foi executado dentro de uma transação revertida ao final: não deixou produtos, movimentações nem comandos no banco.

A validação completa pela interface foi concluída com o proprietário autenticado. Foram verificados cadastro de produto com estoque inicial, compra, bloqueio de venda acima do saldo, venda válida, relatórios e persistência após recarregar a página. O teste resultou em saldo de 5 unidades, custo médio de R$ 15,00, receita de R$ 450,00, lucro bruto de R$ 225,00 e estoque avaliado em R$ 75,00, conforme esperado.

Com confirmação explícita do proprietário, foram removidos somente o produto fictício de código `ADEGA-E2E-20261018`, suas três movimentações e seus três comandos técnicos. A limpeza usou filtros por proprietário, código, nome e marca e conferência de contagens dentro de transação. A interface foi atualizada e confirmou estoque, receita, lucro e movimentações zerados. O sistema está pronto para o cadastro dos produtos reais.

A senha não foi solicitada nem registrada no chat ou no repositório. O usuário fez a autenticação diretamente na interface.

Não registrar senhas, tokens administrativos ou chaves privadas neste arquivo.

## Atualização visual

Publicada a identidade azul petróleo e marrom, com fotografia própria em assets/adega-bar.png, servida pelo Worker, e parallax em visual.js. Revisados layouts móvel e desktop (1440 px), carregamento da imagem e ausência de transbordamento horizontal. O deslocamento da imagem foi confirmado durante a rolagem. Movimento reduzido desativa a animação. Os 10 testes existentes continuam aprovados.

## Nova área de acesso

Logo vetorial própria em assets/logo.svg. Novas telas públicas de login, cadastro, recuperação e nova senha, com olhinho, carregamento, estados de erro e requisitos de senha em tempo real. O painel começa oculto e só aparece após autenticação. Política de senha também aplicada no Supabase: mínimo 8 caracteres, maiúsculas/minúsculas, número e símbolo. Site URL e callbacks foram configurados no domínio da Adega.

19 testes aprovados. Revisão real: menus e painel invisíveis na tela de acesso, responsividade móvel sem transbordamento, olhinho alterna o tipo do campo, tentativa de login inválido mostra erro e retira o estado de carregamento. Novos usuários mantêm estoques separados conforme decisão do proprietário.

Pendências: SMTP de produção para confirmação e recuperação de qualquer usuário; credenciais OAuth Google. Após autorização específica, o projeto Google Cloud Adega foi criado e a marca OAuth configurada com aceite autorizado da política. O cliente Web está preparado; a criação da credencial e seu armazenamento no Supabase aguardam confirmação específica. Não foi possível validar cadastro por e-mail ou Google de ponta a ponta sem essas configurações externas.

## Isolamento entre adegas

Migração 002 aplicada em produção: integridade por proprietário entre movimentação e produto, leitura sem elevação de privilégio e permissões restritas. Teste no Postgres real com duas contas temporárias confirmou RLS, bloqueio de alteração cruzada e integridade; a transação foi revertida integralmente. Nenhum registro real foi alterado. Testes locais: 20 aprovados. Frontend publicado limpa dados ao trocar de sessão e descarta respostas da sessão anterior, inclusive entre abas.

O proprietário informou que ainda não possui domínio nem serviço SMTP e deseja manter serviços gratuitos. SMTP e login Google ainda não foram validados de ponta a ponta.

## PWA e responsividade

Versão publicada: abd7b4bf-9020-4f3b-b1e4-78fedc32c38d. Manifesto, dois ícones PNG, instalação orientada e tela pública offline publicados. Os 20 testes anteriores e dois novos testes de privacidade do service worker passaram. Telas autenticadas verificadas em 320/768/1024 pixels; modal de produto e instalação em 390 pixels. Instalador nativo não foi confirmado em aparelho físico. API e dados de usuários não são armazenados no cache do PWA.

## Perfil, logo por conta e navegação móvel

Publicação 8eb548c9-484a-41ce-a6a2-e1b2c07ed880. Migração 003 aplicada com sucesso. Nome e logo ficam no Postgres com RLS por usuário. Teste real confirmou envio, gravação e persistência da logo após recarregar; configuração padrão restaurada após teste. Menu móvel abre/fecha e navega; perfil mostra e-mail e configurações. Testes de API validam restrição ao usuário atual; teste Postgres verifica isolamento do perfil entre duas contas. 24 testes aprovados, além do teste de isolamento ampliado. Publicação anterior do menu móvel, bloqueada temporariamente por limite de revisão, foi concluída nesta versão.

## Atualização automática

Versão 8f0b360f-789f-4790-b9b7-cde059b86671. Removidos Atualizar e Sair da barra; saída permanece no perfil. Consulta automática a cada 15 segundos em aba visível, ao focar, navegar e reconectar. Requisições não se sobrepõem e respostas iniciadas antes de uma gravação são descartadas. Formulários em preenchimento são preservados, filtros são reaplicados. Os 24 testes existentes e o novo teste de sincronização passaram.

## Resumos móveis

Versão 52b66c32-71c7-4a1a-8c97-768bd2cfa5ad. Listas móveis expansíveis para produtos e movimentações, Ver mais e cartões menores. Revisão autenticada em 390 px: detalhes, ação Editar, cancelamento e detalhes de movimentação conferidos; página sem transbordamento horizontal. 25 testes aprovados e teste de sincronização repetido após ajuste para preservar detalhes abertos.

## Catálogo compartilhável

Publicação 13b2379f-7e5b-42d5-9403-dcc4ae7591ca. Migração 004 aplicada com sucesso. Configuração por conta, publicação optativa, link independente, cópia/compartilhamento e desativação. Página pública de consulta com busca e categorias. 27 testes aprovados, incluindo isolamento entre lojas, campos públicos restritos e bloqueio após desativar. Nenhuma adega foi publicada automaticamente.

## Pedidos pelo WhatsApp

Versão b9d7063d-1409-4af1-ab4b-0d5053080de8. Migração 005 aplicada com sucesso. Carrinho público, quantidades/remoção, total, observações e mensagem para WhatsApp configurável por adega. 30 testes aprovados, incluindo texto do pedido, revalidação de preço/disponibilidade e normalização de contato autenticado. Nenhuma mensagem foi enviada durante os testes. A adega precisa preencher seu WhatsApp e publicar o catálogo para disponibilizar pedidos.

## Confirmação de e-mail temporariamente desativada

Em 18/10/2026, após solicitação e confirmação explícita do proprietário, Confirm email foi desativado e salvo no Supabase. Cadastro público permanece ativo e autentica automaticamente novos usuários com e-mail e senha. A aplicação já suporta esse retorno; não houve mudança no Worker publicado. Teste específico confirmou sessão em cookie HttpOnly sem expor tokens. Requisitos de senha e isolamento entre contas permanecem. Recuperação de senha para terceiros ainda depende da configuração SMTP.

## Cancelamento de vendas

Versão ba77691a-2167-48a8-9902-65cb59e593fa. Migração 007 aplicada com sucesso após renovar sessão administrativa expirada. Venda cancelada permanece no histórico com data/status, devolve quantidade ao estoque com custo histórico ponderado e deixa de entrar nos indicadores. Confirmação informa que não há estorno de pagamento. Trinta e três testes passaram no conjunto completo; teste adicional da API de cancelamento também passou. Não houve cancelamento de venda real em produção.

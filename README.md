# Adega

Sistema de gestão de bebidas em HTML, CSS e JavaScript. Use **Adega** como nome do projeto no Supabase e Cloudflare; o identificador técnico do Worker é `adega`.

## Arquitetura

Navegador → API no Cloudflare Worker → Supabase Data API → Postgres.

O mesmo Worker hospeda a interface com Static Assets e executa a API JavaScript. A Data API acessa o Postgres por HTTPS; não usamos D1 nem conexão TCP direta. Supabase Auth autentica os usuários. O Worker guarda o token em cookie HttpOnly, SameSite e Secure em HTTPS. Nenhuma chave administrativa ou senha do banco vai para o navegador.

As funções SQL validam as operações e calculam estoque e custo médio dentro de transações. Os comandos por conta são serializados, vendas acima do saldo são rejeitadas e um identificador impede duplicações na repetição da mesma requisição. O histórico preserva nome e custo no momento da operação.

## Preparar o Supabase

1. Crie um projeto chamado **Adega**.
2. Execute as migrações de `supabase/migrations/001_adega.sql` até `010_product_images.sql`, em ordem, uma vez cada, no SQL Editor. A migração cria tabelas, índices, RLS e funções. Use um projeto novo ou confira conflitos de nomes antes da aplicação.
3. Em Authentication, habilite cadastro público; no estado atual, a confirmação de e-mail está desativada temporariamente por decisão do proprietário e mantenha login anônimo desabilitado. Configure senha mínima de 8 caracteres, com letras maiúsculas, minúsculas, número e símbolo. Contas existentes continuam disponíveis.
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

A sessão exige novo login quando expira, no máximo após uma hora; não há renovação automática. O estado é consultado automaticamente a cada 15 segundos com a aba visível e também ao voltar ao aplicativo, navegar ou reconectar. Não há assinatura Realtime. O preenchimento de formulários é preservado e operações são validadas no banco.

## Dados e relatórios

Inclui cadastro, edição e inativação de bebidas, compras com custo médio, vendas, estoque mínimo, relatórios e CSV. Lucro é bruto, sem taxas, despesas e impostos. Editar custo no cadastro afeta operações futuras. Vendas podem ser canceladas integralmente em Movimentações, com devolução ao estoque e exclusão dos indicadores de vendas. O registro original permanece marcado como cancelado. Cancelamento de compras e devoluções parciais não estão implementados.

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
- Cadastro público habilitado; confirmação de e-mail desativada temporariamente por autorização do proprietário.
- Senha: mínimo 8 caracteres, maiúsculas, minúsculas, número e símbolo.
- Login e cadastro: /#login e /#cadastro. Recuperação: /#recuperar; nova senha: /#redefinir.

Os fluxos de e-mail usam PKCE: o link deve ser aberto no mesmo navegador em que a solicitação foi iniciada. A prova fica em cookie HttpOnly. O retorno de recuperação cria uma sessão temporária separada, sem acesso ao estoque, e permite salvar a nova senha. O endpoint /api/auth/confirm também aceita token_hash para futuros templates personalizados.

### Pendências de serviços externos

O SMTP de produção ainda precisa ser configurado no Supabase. O remetente padrão de testes envia somente para membros autorizados da organização; não serve para cadastro e recuperação de outras pessoas. A aplicação não indica sucesso quando o provedor retorna erro. O proprietário autorizou desativar temporariamente a confirmação de e-mail. Recuperação de senha por e-mail ainda depende de SMTP.

O código de acesso com Google usa OAuth PKCE, mas o provedor ainda depende de Client ID e Client Secret no Supabase. O projeto Google Cloud Adega foi criado com autorização específica do proprietário, e a marca OAuth foi configurada após aceite autorizado da política. O cliente Web Adega está preparado; sua criação e o armazenamento das credenciais no Supabase aguardam confirmação específica. Nenhum serviço pago foi contratado. O botão informa que a configuração está pendente enquanto o provedor estiver desabilitado.

Para configurar Google: criar projeto Adega, configurar marca e público externo, criar cliente OAuth do tipo Web com origem https://adega.santosjosiel2003.workers.dev e callback https://gcyktgzpsbteugztugtq.supabase.co/auth/v1/callback. Guardar Client ID/Secret diretamente no provedor Google do Supabase, sem versionar. Habilitar apenas escopos openid, email e profile. Validar o login real depois da configuração.

## Isolamento reforçado entre contas

A migração 002 exige que cada movimentação pertença à mesma conta do produto. As leituras respeitam RLS sem privilégios elevados; escritas diretas e leitura dos comandos internos são bloqueadas. O proprietário vem da sessão autenticada, nunca de campos enviados pelo navegador. Produtos, compras, vendas, relatórios e exportações usam somente os dados dessa conta. Trocar a sessão limpa os dados na interface, notifica outras abas e descarta respostas antigas em trânsito.

Os 20 testes locais incluem duas contas, tentativa de falsificar o proprietário, acesso cruzado por ID e reutilização de códigos e identificadores entre contas. O roteiro supabase/tests/account-isolation.sql também foi executado no Postgres de produção com resultado positivo e rollback integral.

## Aplicativo PWA e telas de toque

Publicado com nome Adega, manifesto, ícones PNG 192/512, modo standalone e botão Instalar Adega. Navegadores compatíveis exibem o instalador nativo quando o disponibilizam; os demais recebem orientações. No iPhone/iPad, use Safari > Compartilhar > Adicionar à Tela de Início. A instalação final no dispositivo físico não foi executada nesta revisão.

A conexão continua obrigatória para estoque e operações. O service worker armazena somente o aviso público offline; nunca intercepta API, callbacks de autenticação, gravações ou sessões. Não há fila offline de compras ou vendas.

Responsividade revisada nas cinco telas de gestão em 320, 768 e 1024 pixels, sem transbordamento horizontal da página. Tabelas largas têm rolagem própria. Formulário de produto e ajuda de instalação conferidos em 390 pixels. Ajustados alvos de toque, campos de 16 px em celulares, safe areas, modais com rolagem e navegação superior em tablets.

## Perfil e identidade da empresa

Execute também a migração 003_company_profile.sql uma vez. A tabela adega_profiles guarda nome e logo por proprietário com RLS; os dados são apenas de apresentação e não concedem permissões. Nenhuma imagem é incluída no token de autenticação. A API /api/profile usa somente o usuário da sessão e ignora IDs de proprietário enviados pelo cliente.

O menu de perfil mostra e-mail, empresa e saída. Em Minha empresa e logo, escolha nome e imagem PNG/JPG/WebP de até 5 MB. O navegador ajusta a imagem para PNG de 192 px, com limite final de 48 KB. A identidade aparece na marca da área autenticada e é carregada novamente ao entrar em outro dispositivo. Usar logo padrão remove a personalização ao salvar. Nome e ícone da instalação PWA continuam Adega.

No celular, barra superior fixa com perfil e menu de três linhas. O menu fecha ao navegar, tocar fora ou pressionar Escape. Perfil e marca personalizados são limpos ao encerrar ou trocar a sessão.

## Listas compactas no celular

Em até 700 px, produtos usam resumo expansível com nome, preço, saldo e status; detalhes exibem categoria, marca, código, custo e ações. Primeiros oito produtos visíveis; Ver mais revela os demais sem perder os filtros. Movimentações mostram três resumos iniciais, detalhes de data/valor/cliente/pagamento e expansão para as restantes. Desktop mantém tabelas. Banner e cartões reduzidos no celular. Atualizações automáticas não substituem detalhes abertos; alterações pendentes aparecem ao terminar a interação. Expansão nativa funciona por toque ou teclado, com foco visível e ações identificadas.

## Catálogo público por adega

Execute a migração 004_public_catalog.sql uma vez. No perfil, Catálogo para clientes permite publicar e gerar link próprio, copiar, compartilhar e desativar. Nenhum catálogo é ativado automaticamente. Nome, logo, produtos ativos com saldo positivo, marca, categoria e preço de venda ficam públicos somente após publicação. A disponibilidade em unidades e embalagens completas permite validar o carrinho público. Custos, histórico, e-mail e IDs de proprietário não são retornados pela função pública. Configurações têm RLS e exigem a conta autenticada. O link usa UUID independente e mantém o mesmo endereço ao reativar.

A página catalog.html funciona sem login, tem busca/categorias e consulta novamente os dados a cada 30 segundos enquanto visível. Desativar bloqueia novas consultas; cópias já vistas ou salvas por clientes não podem ser recolhidas. O catálogo permite consulta e carrinho para pedidos pelo WhatsApp, sem baixa automática de estoque.

## Carrinho e pedido por WhatsApp

Execute a migração 005_catalog_whatsapp.sql uma vez. Em Perfil > Catálogo para clientes, salve o WhatsApp brasileiro com DDD; o número fica público quando o catálogo é publicado. Sem número configurado, compras pelo catálogo ficam indisponíveis. O cliente adiciona itens ao carrinho em memória, ajusta quantidades até o saldo disponível, remove, informa bairro, rua e número de entrega e finaliza pelo WhatsApp. O navegador abre uma mensagem para o número da adega; o cliente confirma o envio no WhatsApp.

Antes de continuar, o catálogo é consultado novamente. Produtos indisponíveis são removidos e mudanças de preço pedem nova conferência. Total é estimado; disponibilidade, entrega e pagamento são confirmados pela adega. Abrir ou enviar a mensagem não registra venda, cobra pagamento ou baixa estoque. O carrinho não é salvo após recarregar/fechar a página.

## Excluir produtos

Migração 006_delete_product.sql: exclusão autenticada, somente do próprio produto, com idempotência e bloqueio de exclusão quando houver qualquer movimentação (inclusive estoque inicial). Em Produtos, Excluir abre confirmação; se houver histórico, oferece inativar. Exclusão não remove histórico nem registros de outras contas. Teste no Postgres embarcado verificou exclusão, repetição segura, bloqueio de acesso cruzado e preservação de produtos com histórico.

## Cancelar venda

Execute a migração 007_cancel_sale.sql uma vez. Em Movimentações ou nas movimentações recentes, Cancelar venda pede confirmação, devolve a quantidade ao estoque e retira o valor da receita, lucro, gráficos e ranking. O registro permanece com cancelledAt e status cancelado, inclusive no CSV. Reposição usa o custo histórico da venda ponderado com o estoque atual, sem alterar outras vendas. O cancelamento é integral e não estorna pagamentos. O operador deve confirmar que as bebidas permanecem ou retornaram à adega.

A operação valida proprietário e tipo, usa a mesma trava por conta e idempotência dos comandos de estoque, rejeita segundo cancelamento e bloqueia compras/estoque inicial. Testes em Postgres embarcado verificaram reposição após compra com custo diferente, idempotência, isolamento e permissões anônimas. Nenhuma venda real foi cancelada durante a implementação.

## Caixas, fardos e unidades

A migração 008 mantém o saldo em unidades como fonte única. No produto, configure unidades por embalagem, nome (Caixa, Fardo, Pacote etc.) e preço da embalagem completa, independente do preço por unidade. Produtos antigos continuam com embalagem de uma unidade; não há conversão automática dos seus saldos existentes. Estoque inicial pode ser informado em unidades ou embalagens; o custo de cadastro é sempre por unidade. Reposição e venda permitem escolher a apresentação e informar quantidade e preço daquela apresentação.

Com 24 unidades e caixa de 12, aparecem 2 caixas + 0 avulsas; vender uma unidade deixa 1 caixa + 11 avulsas. Repor 3 caixas acrescenta 36 unidades. O modelo considera possível formar caixas completas a partir do saldo, sem controlar lacres físicos. Não crie outro produto para a caixa da mesma bebida.

O catálogo oferece unidade e embalagem como opções de compra, com seus preços próprios. A embalagem só aparece quando tem preço e há unidades suficientes para completá-la. As duas opções dividem o mesmo saldo no carrinho; uma consulta antes do WhatsApp confere preços e disponibilidade novamente. Pedidos por WhatsApp não reservam estoque e precisam ser registrados como vendas pelo proprietário.

O histórico guarda quantidade de embalagens, unidades por embalagem, nome e total pago na operação. Alterar a embalagem depois não muda vendas anteriores. Custo médio usa o valor total da reposição dividido pelas unidades recebidas; totais financeiros não dependem do arredondamento do preço convertido por unidade. Cancelar venda devolve as unidades originais. Testes cobrem embalagens de 12 e 6, vendas avulsas, reposição, preços distintos, cancelamento, repetição idempotente, isolamento e carrinho misto.

Seleções de produto, categoria, pagamento e data usam controles próprios da Adega, com busca, teclado e fundo desfocado. Os controles originais permanecem como valores do formulário, sem exibir seletores nativos.

## Exclusão de produtos com histórico

A migração 009 substitui a antiga restrição de exclusão: Excluir produto pede confirmação e registra deleted_at, retirando o cadastro de Produtos, estoque disponível e catálogo. Movimentações e indicadores históricos permanecem. O código pode ser reutilizado em um novo cadastro, com outro ID e estoque independente. Compras, vendas, edições e reativação do produto removido são rejeitadas pelo banco; repetir o mesmo pedido de exclusão é idempotente. A operação usa o proprietário autenticado e a trava por conta.

Cancelar uma venda antiga de produto excluído mantém o produto fora do estoque disponível e não credita o saldo a um novo produto com o mesmo código. O modal informa essa condição. Exclusão não estorna pagamentos nem apaga o histórico financeiro. Não há restauração pela interface; os registros técnicos permanecem no banco. Nenhum produto real foi excluído durante a validação.

## Cadastro guiado de bebidas

O formulário reúne três seções: bebida, forma da compra e preços de venda. Escolher Por caixa revela quantidade de caixas, unidades por caixa e custo pago por caixa. O resumo calcula saldo total e custo por unidade imediatamente; o comando existente recebe o custo convertido e a quantidade de caixas, sem dupla conversão do saldo. Por unidade oculta e desabilita campos de caixa. Marca, código, nome da embalagem e alerta mínimo ficam em Mais informações.

Na edição não há entrada de estoque; o custo continua sendo informado por unidade, preservando a precisão do custo médio existente. Os preços de caixa e unidade continuam independentes. Alterações de saldo devem usar Repor estoque.

O tipo de embalagem fica visível na seção da compra: Caixa, Grade, Fardo ou Pack. As perguntas de quantidade, custo e venda acompanham o nome escolhido, que também é salvo para estoque, movimentações e catálogo. Nomes personalizados já cadastrados são mantidos ao editar.

## Máscaras e valores de entrada

Novos cadastros iniciam estoque, tamanho da embalagem e alerta mínimo sem números pré-preenchidos. Exemplos são placeholders. Quantidade em novas vendas e reposições também começa vazia. Valores monetários usam uma entrada visual em reais, com vírgula e duas casas, mantendo o controle numérico original como única fonte do FormData e dos cálculos. Valores salvos e preços do produto selecionado continuam disponíveis; o custo médio de edição mantém a precisão armazenada até uma alteração explícita.

## Escolha de quantidade no catálogo

Adicionar ao carrinho abre um diálogo com campo numérico vazio, botões de aumentar/diminuir, disponibilidade e subtotal. Antes de adicionar a quantidade escolhida, o catálogo é consultado novamente; mudanças de preço ou carrinho pedem nova conferência. Dentro do carrinho, a quantidade pode ser digitada diretamente ou ajustada pelos botões. O limite fixo de 99 foi removido; quantidades inteiras respeitam o estoque compartilhado entre unidades e embalagens. Pedidos continuam sem reserva ou baixa automática, com conferência adicional antes de abrir o WhatsApp.

Na finalização do catálogo, o cliente precisa escolher Pix, Dinheiro, Cartão de débito ou Cartão de crédito. A seleção começa vazia e usa o seletor visual da Adega. A mensagem do WhatsApp inclui a forma de pagamento após o endereço, sem coletar dados de cartão ou processar pagamentos.

## Conferência de estoque do pedido

O catálogo usa o protocolo v=2; abas antigas recebem aviso para recarregar e não podem concluir pelo fluxo antigo. A API POST /api/catalog/checkout consulta o catálogo publicado no banco, calcula a apresentação pelo produto (sem confiar no tamanho/preço enviados), soma caixas e unidades por produto e responde 409 se o pedido exceder o saldo. A mensagem usa os itens e preços conferidos pelo servidor. Saldo desconhecido bloqueia a compra; não há mais fallback de estoque ilimitado. Quantidades digitadas no carrinho são limitadas ao saldo compartilhado.

A conferência não reserva nem baixa estoque: pedidos por WhatsApp continuam sendo propostas até a venda ser registrada pelo proprietário. Duas consultas simultâneas podem obter o mesmo saldo disponível. O proprietário escolheu explicitamente manter apenas a conferência do saldo antes do envio, sem reservas. Validado no endpoint de produção: 5 caixas solicitadas contra saldo de 4 resultaram em 409, sem registrar venda.

## Fotos por apresentação do produto

A migração 010 adiciona fotos opcionais e independentes da unidade e da embalagem. O cadastro e a edição permitem selecionar JPG/PNG/WebP de até 5 MB, ver a prévia e remover. O navegador redimensiona para até 512 px e converte em JPEG otimizado de até 48 KB (64 KB de data URL). Imagens são persistidas no Postgres por conta, sem novos serviços pagos. A caixa/grade/fardo/pack usa sua própria foto no catálogo, sem reutilizar silenciosamente a foto da unidade.

A API e os constraints do banco aceitam somente o formato raster gerado e limitam o tamanho. Comandos com duas fotos têm limite de 160 KB; os demais endpoints mantêm seus limites. O histórico de idempotência guarda apenas o checksum das fotos, sem duplicar seus dados. Editar sem selecionar fotos preserva as imagens existentes.

Consultas automáticas de estoque recebem apenas indicadores e versão das fotos. Os bytes são carregados sob demanda em endpoints próprios. A prévia privada exige a sessão da conta; a imagem pública exige catálogo publicado e produto da mesma adega, ativo, não excluído e com saldo positivo. Desativar o catálogo ou retirar o produto impede novas leituras públicas. Cópias já vistas ou salvas por clientes não podem ser recolhidas.

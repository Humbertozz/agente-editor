# Flamefields: como colocar no ar (venda automática)

Tempo estimado: 40 a 60 minutos, uma vez só. Você vai precisar de 4 contas: **Anthropic Console**, **Supabase**, **Vercel** e **Hypercash**.

## Cadastro grátis (3 vídeos)

Qualquer pessoa clica em **Teste grátis** no site, cria a conta com nome, e-mail e senha e ganha **3 vídeos** (variável `TRIAL_VIDEOS` na Vercel e `TRIAL_VIDEOS` no `config.js`).
- Com o Supabase ligado: a pessoa confirma o e-mail e o servidor libera os 3 vídeos uma única vez por e-mail. O cadastro aparece no `/admin` com o plano "teste". Gasto máximo de IA por conta de teste: `TRIAL_MAX_COST_CENTS` (padrão 300 = R$ 3).
- Sem o Supabase: a conta fica guardada só no navegador da pessoa e os vídeos são gerados pela demonstração. Funciona para mostrar, mas você não recebe os contatos e quem limpar o navegador consegue testar de novo.

Domínio próprio (ex.: flamefieldai.online): na Vercel, em **Settings > Domains**, adicione o domínio e crie no seu registrador os registros DNS que ela mostrar. Depois troque `SITE_URL` e, no Supabase, a Site URL e as Redirect URLs para `https://flamefieldai.online/?app=1`.

## Como funciona depois de pronto

1. O cliente entra no seu site e compra o **Acesso vitalício (R$ 1.190,90, pagamento único)** na Hypercash.
2. A Hypercash avisa o seu sistema (webhook). O acesso é criado sozinho, com **1.000 vídeos de crédito**, e o cliente recebe um e-mail de convite.
3. O cliente entra em `seusite.com/app` com o e-mail da compra (recebe um link, sem senha).
4. Cada vídeo gerado desconta 1 crédito. Cada **análise de estilo** (o cliente manda um vídeo de referência e o agente identifica o estilo e escreve o prompt) desconta 5 créditos.
5. Dentro do estúdio, o cliente pode assinar os **Créditos mensais** (seu link da Hypercash): cada mês pago soma +300 vídeos. Os créditos acumulam.
6. Créditos zerados: o chat trava e mostra o botão da assinatura mensal (e recargas avulsas, se você criar).
7. Estorno de uma mensalidade tira só aqueles créditos. Estorno ou chargeback do acesso vitalício bloqueia o acesso.
8. Você acompanha tudo em `seusite.com/admin`: clientes, faturamento, custo de API e lucro.

| Produto | Preço | O que libera |
|---|---|---|
| Acesso vitalício | R$ 1.190,90 (único) | Acesso para sempre + 1.000 vídeos |
| Plano mensal | R$ 329,90 por mês | Acesso enquanto pagar + 120 vídeos que renovam todo mês (não acumulam) |
| Créditos mensais | você define | +300 vídeos a cada mês pago |
| Recarga 100 / 300 (opcional) | R$ 49,90 / R$ 119,90 | +100 / +300 vídeos |

Custo de API estimado: cerca de R$ 0,12 por vídeo e R$ 0,15 por análise de estilo. Os 1.000 vídeos do vitalício custam por volta de R$ 120 se o cliente usar tudo.
Para mudar quantidades: `PLANS_JSON` na Vercel (formato em `api/_lib.js`) e `public/config.js` (MONTHLY_CREDITS, STYLE_COST).

---

## Passo 1: Chave da Anthropic (o "cérebro")

1. Acesse **console.anthropic.com**, crie a conta e adicione créditos (comece com US$ 20).
2. Em **API Keys**, clique em **Create Key** e copie a chave (começa com `sk-ant-`).
3. Em **Limits**, defina um limite mensal de gasto (ex.: US$ 50) para nunca ter surpresa.

## Passo 2: Supabase (login e banco de dados)

1. Acesse **supabase.com**, crie um projeto (região São Paulo).
2. Vá em **SQL Editor**, cole todo o arquivo `supabase.sql` e clique em **Run**.
3. Vá em **Project Settings > API** e copie:
   - `Project URL`
   - `anon public` (chave pública)
   - `service_role` (chave secreta: **nunca** coloque no site, só na Vercel)
4. Vá em **Authentication > URL Configuration**:
   - Site URL: `https://seusite.com` (ou o endereço `.vercel.app`)
   - Redirect URLs: adicione `https://seusite.com/app` e `https://seusite.com/admin`
5. Vá em **Authentication > Email Templates** e traduza os e-mails "Invite user" e "Magic Link" para português (ex.: "Seu acesso ao Flamefields está liberado. Clique para entrar.").
6. Para enviar muitos e-mails, configure um SMTP próprio em **Authentication > SMTP** (o grátis do Supabase tem limite baixo por hora). Resend ou Brevo funcionam bem.

## Passo 3: Preencher o `public/config.js`

Abra `public/config.js` e coloque:
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` do passo 2
- os links de checkout da Hypercash (passo 5) e o preço da mensalidade. Pode voltar aqui depois.

## Passo 4: Vercel (o site no ar)

1. Crie um repositório no GitHub e suba esta pasta inteira (ou use `vercel` pela linha de comando).
2. Em **vercel.com > Add New > Project**, importe o repositório. Framework: **Other**.
3. Em **Settings > Environment Variables**, adicione:

| Variável | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sua chave `sk-ant-...` |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_ANON_KEY` | chave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role |
| `HYPERCASH_WEBHOOK_KEY` | senha do webhook (passo 5) |
| `HYPERCASH_SECRET_KEY` | chave `sk_...` da Hypercash (recomendado) |
| `HYPERCASH_PRODUCT_MAP` | opcional (passo 5) |
| `MONTHLY_PRICE_CENTS` | preço da mensalidade em centavos (ex.: `19790`) |
| `STYLE_COST` | `5` (créditos por análise de estilo) |
| `ADMIN_EMAILS` | seu e-mail (pode pôr mais de um, separados por vírgula) |
| `SITE_URL` | `https://seusite.com` |
| `USD_BRL` | cotação do dólar (ex.: `5.6`) |
| `PRICE_IN_USD_MTOK` / `PRICE_OUT_USD_MTOK` | preço do modelo por milhão de tokens (ex.: `2` e `10`; confira em docs.claude.com) |
| `COST_CAP_RATIO` | `0.3` (trava se o custo de API passar de 30% do que o cliente pagou) |

4. Clique em **Deploy**. Depois, em **Settings > Domains**, ligue seu domínio.

## Passo 5: Hypercash (pagamento e liberação automática)

1. Na Hypercash, crie os produtos:
   - **Flamefields Acesso Vitalício**: pagamento único, R$ 1.190,90 (o nome precisa ter "Vitalício")
   - **Flamefields Plano Mensal**: recorrência mensal, R$ 329,90 (o nome precisa ter "Mensal" e NÃO pode ter "Créditos"). Seu link: `https://pay.hypercash.com.br/pt/checkout/2c1c2a00-c873-43a0-ab96-dca3162aaa33`
   - **Flamefields Créditos Mensais**: recorrência mensal (o nome precisa ter "Créditos" e "Mensais"). O seu link atual: `https://pay.hypercash.com.br/pt/checkout/b470cd3b-9c39-4ba3-b2cf-d76210413e74`
   - Opcional: **Recarga 100 créditos** e **Recarga 300 créditos** (pagamento único)
2. Coloque os links de checkout no `public/config.js` (e o preço da mensalidade em `MONTHLY_PRICE`).
3. Invente uma senha longa para o webhook (ex.: `ff-8K2p9xQ...`) e coloque em `HYPERCASH_WEBHOOK_KEY` na Vercel.
4. Na Hypercash, configure o webhook/postback de transações para:
   `https://seusite.com/api/webhook-hypercash?key=SUA_SENHA_DO_PASSO_3`
5. Recomendado: em **Configurações > Chave de API** da Hypercash, gere a chave secreta (`sk_...`) e coloque em `HYPERCASH_SECRET_KEY`. Com ela, o sistema confere cada pagamento direto na Hypercash antes de liberar.
6. Se os nomes dos produtos forem diferentes, ligue cada produto ao plano em `HYPERCASH_PRODUCT_MAP` (o ID ou o título do item):
   ```
   {"Meu Produto X":"vitalicio","Assinatura Y":"creditos_mensal","Pack 100":"recarga100"}
   ```
   Sem isso, o sistema também reconhece pelo valor pago (R$ 1.190,90 = vitalício; o valor de `MONTHLY_PRICE_CENTS` = mensal).
7. Faça uma compra de teste com seu e-mail e confira em `/admin`.

> A Kiwify continua funcionando (`/api/webhook-kiwify`) se um dia você quiser usar as duas.

## Passo 6: Testar

1. Abra `seusite.com/admin`, entre com seu e-mail e libere um plano manualmente para você mesmo (formulário "Liberar acesso manual").
2. Abra `seusite.com/app`, entre com o mesmo e-mail, anexe takes e peça os vídeos.
3. Confira no painel o custo do pedido e os créditos descontados.

## Venda direta (Pix, sem Kiwify)

No `/admin`, use **Liberar acesso manual**: informe o e-mail do cliente e o plano. Ele recebe o convite na hora.

## Ajustes rápidos

- **Estilo de edição padrão:** `api/_style.js`
- **Regras do agente e formato do roteiro:** `api/agent.js`
- **Textos do site (PT e EN):** dicionário `I18N` em `public/index.html`

## Testes automáticos

`node test/flow.test.mjs` simula compra (Hypercash e Kiwify), acesso vitalício, créditos mensais, uso, análise de estilo, estorno, chargeback, painel e lead, com Supabase e Anthropic simulados.

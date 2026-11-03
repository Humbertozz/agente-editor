# Flamefields

Editor de vídeos de lançamento imobiliário com IA: o cliente anexa os takes, escreve a ideia no chat e recebe vídeos verticais de 30s com motion design, cortes no ritmo, cor de cinema, trilha original e locução.

- **Site de vendas + estúdio:** pasta `public/` (no GitHub Pages abre em `.../agente-editor/public/`)
- **Servidor (IA, créditos, pagamentos):** pasta `api/` (roda na Vercel)
- **Banco e login:** `supabase.sql` (Supabase)

## Seu login de produtor (e-mail e senha)

1. No Supabase: **Authentication > Users > Add user > Create new user**. Coloque seu e-mail e a senha que quiser e marque **Auto Confirm User**.
2. Na Vercel, coloque o mesmo e-mail em `ADMIN_EMAILS`.
3. Pronto: em `.../?app=1` você entra com e-mail e senha e usa o estúdio sem precisar comprar. O painel fica em `.../admin.html`.

> Nunca coloque senha nem chave secreta em arquivo deste repositório. Ele é público: qualquer pessoa consegue ler.

Os clientes entram com o e-mail da compra. No primeiro acesso clicam em **"Criar ou trocar senha"** (ou entram pelo link enviado por e-mail).

## Por que só o site não basta

O GitHub Pages hospeda só a parte visual. O login, a IA e os créditos precisam do Supabase e do servidor na Vercel (passos abaixo). Com o site no GitHub Pages, preencha `API_BASE` no `public/config.js` com o endereço da Vercel.

---

## Como colocar no ar (venda automática)
Tempo estimado: 40 a 60 minutos, uma vez só. Você vai precisar de 4 contas: **Anthropic Console**, **Supabase**, **Vercel** e **Hypercash**.

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

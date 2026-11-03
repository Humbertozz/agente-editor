-- Flamefields: banco de dados (cole no Supabase > SQL Editor > Run)
-- Só o servidor (chave service_role) acessa estas tabelas. O navegador nunca lê direto.

create table if not exists public.profiles (
  email            text primary key,
  name             text,
  plan             text,                         -- mensal | trimestral | anual
  status           text not null default 'ativo', -- ativo | cancelado | bloqueado
  period_end       timestamptz,                  -- até quando o acesso está pago
  monthly_credits  int not null default 0,       -- franquia de vídeos por mês do plano
  plan_credits     int not null default 0,       -- saldo da franquia do mês atual
  extra_credits    int not null default 0,       -- recargas compradas (não vencem)
  next_refill      timestamptz,                  -- quando a franquia mensal renova
  paid_cents       bigint not null default 0,    -- total pago pelo cliente (centavos)
  cost_cents       numeric not null default 0,   -- custo de API acumulado (centavos de real)
  videos_total     int not null default 0,
  sub_until        timestamptz,                  -- assinatura mensal de créditos ativa até
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.events (
  id          text primary key,      -- order_id:evento (evita processar duas vezes)
  email       text,
  type        text,
  product     text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.usage (
  id             bigserial primary key,
  email          text not null,
  videos         int not null default 0,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cost_cents     numeric not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists usage_email_idx on public.usage(email, created_at desc);

create table if not exists public.leads (
  id          bigserial primary key,
  nome        text, empresa text, whatsapp text, plano text, idioma text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.usage    enable row level security;
alter table public.leads    enable row level security;
-- Sem policies: ninguém com a chave pública acessa. O servidor usa a service_role.

-- Renova a franquia mensal quando chega a data (chamada antes de cada uso)
create or replace function public.ff_refill(p_email text)
returns public.profiles language plpgsql security definer as $$
declare r public.profiles;
begin
  select * into r from public.profiles where email = lower(p_email) for update;
  if not found then return null; end if;
  if r.status <> 'bloqueado' and r.period_end is not null and r.period_end > now()
     and r.next_refill is not null and r.next_refill <= now() then
    r.plan_credits := r.monthly_credits;
    while r.next_refill <= now() loop
      r.next_refill := r.next_refill + interval '1 month';
    end loop;
    update public.profiles set plan_credits = r.plan_credits, next_refill = r.next_refill, updated_at = now()
      where email = r.email;
  end if;
  return r;
end $$;

-- Desconta créditos (primeiro da franquia, depois das recargas) e registra o custo
create or replace function public.ff_debit(p_email text, p_videos int, p_cost numeric, p_in int, p_out int)
returns public.profiles language plpgsql security definer as $$
declare r public.profiles; from_plan int; from_extra int;
begin
  select * into r from public.profiles where email = lower(p_email) for update;
  if not found then return null; end if;
  from_plan  := least(r.plan_credits, p_videos);
  from_extra := least(r.extra_credits, p_videos - from_plan);
  update public.profiles set
    plan_credits  = plan_credits - from_plan,
    extra_credits = extra_credits - from_extra,
    cost_cents    = cost_cents + p_cost,
    videos_total  = videos_total + p_videos,
    updated_at    = now()
  where email = r.email
  returning * into r;
  insert into public.usage(email, videos, input_tokens, output_tokens, cost_cents)
    values (r.email, p_videos, p_in, p_out, p_cost);
  return r;
end $$;

-- Registra só o custo (pedido sem vídeo, ex.: conversa)
create or replace function public.ff_cost(p_email text, p_cost numeric, p_in int, p_out int)
returns void language sql security definer as $$
  update public.profiles set cost_cents = cost_cents + p_cost, updated_at = now() where email = lower(p_email);
  insert into public.usage(email, videos, input_tokens, output_tokens, cost_cents) values (lower(p_email), 0, p_in, p_out, p_cost);
$$;

-- Cobra créditos avulsos (ex.: análise de estilo) e registra o custo
create or replace function public.ff_charge(p_email text, p_credits int, p_cost numeric, p_in int, p_out int)
returns public.profiles language plpgsql security definer as $$
declare r public.profiles; from_plan int; from_extra int;
begin
  select * into r from public.profiles where email = lower(p_email) for update;
  if not found then return null; end if;
  from_plan  := least(r.plan_credits, p_credits);
  from_extra := least(r.extra_credits, p_credits - from_plan);
  update public.profiles set plan_credits = plan_credits - from_plan, extra_credits = extra_credits - from_extra,
    cost_cents = cost_cents + p_cost, updated_at = now() where email = r.email returning * into r;
  insert into public.usage(email, videos, input_tokens, output_tokens, cost_cents) values (r.email, 0, p_in, p_out, p_cost);
  return r;
end $$;

-- Para quem já rodou a versão anterior do banco:
alter table public.profiles add column if not exists sub_until timestamptz;

revoke all on function public.ff_refill(text) from public, anon, authenticated;
revoke all on function public.ff_debit(text, int, numeric, int, int) from public, anon, authenticated;
revoke all on function public.ff_cost(text, numeric, int, int) from public, anon, authenticated;
revoke all on function public.ff_charge(text, int, numeric, int, int) from public, anon, authenticated;

// Flamefields — utilidades do servidor (não vira rota: arquivos com "_" são ignorados pela Vercel)
import crypto from "node:crypto";

export const env = (k, d) => (process.env[k] ?? d);
const SB_URL = () => env("SUPABASE_URL", "").replace(/\/$/, "");
const SB_KEY = () => env("SUPABASE_SERVICE_ROLE_KEY", "");

/* ---------------- planos, recargas e preços ---------------- */
// Pode sobrescrever tudo com a variável de ambiente PLANS_JSON (mesmo formato).
// vitalicio = pagamento único (acesso para sempre + créditos de boas-vindas)
// creditos_mensal = assinatura mensal de créditos, comprada de dentro do app (cada cobrança paga soma créditos)
const DEFAULT_PLANS = {
  vitalicio:       { kind: "lifetime", credits: 1000, price_cents: 119090 },
  creditos_mensal: { kind: "monthly_credits", credits: 300, price_cents: +env("MONTHLY_PRICE_CENTS", 0) },
  recarga100:      { kind: "pack", credits: 100, price_cents: 4990 },
  recarga300:      { kind: "pack", credits: 300, price_cents: 11990 },
  // planos antigos (continuam funcionando se você usar)
  mensal:     { kind: "plan", months: 1,  monthly: 300, price_cents: 38990 },
  trimestral: { kind: "plan", months: 3,  monthly: 300, price_cents: 78990 },
  anual:      { kind: "plan", months: 12, monthly: 200, price_cents: 129790 }
};
export const STYLE_COST = () => +env("STYLE_COST", 5); // créditos por análise de estilo
export function plans() { try { return JSON.parse(env("PLANS_JSON", "")) } catch { return DEFAULT_PLANS; } }

// Liga o produto da Kiwify ao plano. PRODUCT_MAP = {"<id ou nome do produto>": "mensal", ...}
export function productKey(payload) {
  const P = payload.Product || payload.product || {};
  const S = payload.Subscription || payload.subscription || {};
  const cands = [P.product_id, P.id, payload.product_id, P.product_name, P.name, payload.product_name, S.plan && S.plan.name, S.plan && S.plan.id, S.plan_id].filter(Boolean).map(String);
  let map = {}; try { map = JSON.parse(env("PRODUCT_MAP", "{}")); } catch {}
  for (const c of cands) if (map[c]) return map[c];
  const txt = cands.join(" ").toLowerCase();
  if (/vital[ií]c|lifetime|[uú]nico|acesso completo/.test(txt)) return "vitalicio";
  if (/(mensa(l|is)|m[eê]s|monthly|recorr)/.test(txt) && /cr[eé]dito|token|v[ií]deo/.test(txt)) return "creditos_mensal";
  if (/300/.test(txt) && /recarga|cr[eé]dito|pack/.test(txt)) return "recarga300";
  if (/100/.test(txt) && /recarga|cr[eé]dito|pack/.test(txt)) return "recarga100";
  if (/anual|annual|year/.test(txt)) return "anual";
  if (/trimes|quarter/.test(txt)) return "trimestral";
  if (/mensal|monthly|month/.test(txt)) return "mensal";
  return null;
}

/* ---------------- custo da API ---------------- */
// Preços em dólar por milhão de tokens (confira a tabela oficial e ajuste nas variáveis).
export function costCents(usage) {
  const pin = +env("PRICE_IN_USD_MTOK", 2), pout = +env("PRICE_OUT_USD_MTOK", 10), rate = +env("USD_BRL", 5.6);
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  const usd = inTok / 1e6 * pin + (usage.output_tokens || 0) / 1e6 * pout;
  return Math.round(usd * rate * 100 * 1000) / 1000;
}

/* ---------------- Supabase (REST, com a chave de serviço) ---------------- */
async function sb(path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(SB_URL() + path, {
    method,
    headers: { apikey: SB_KEY(), Authorization: "Bearer " + SB_KEY(), "Content-Type": "application/json", ...headers },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data };
}
export const db = {
  async profile(email) { const r = await sb(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`); return r.ok && r.data && r.data[0] || null; },
  async upsertProfile(row) { return sb(`/rest/v1/profiles?on_conflict=email`, { method: "POST", body: row, headers: { Prefer: "resolution=merge-duplicates,return=representation" } }); },
  async patchProfile(email, patch) { return sb(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } }); },
  async listProfiles() { const r = await sb(`/rest/v1/profiles?select=*&order=created_at.desc`); return r.data || []; },
  async deleteEvent(id) { return sb(`/rest/v1/events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); },
  async insertEvent(ev) { return sb(`/rest/v1/events`, { method: "POST", body: ev, headers: { Prefer: "return=minimal" } }); },
  async insertLead(l) { return sb(`/rest/v1/leads`, { method: "POST", body: l, headers: { Prefer: "return=minimal" } }); },
  async listLeads() { const r = await sb(`/rest/v1/leads?select=*&order=created_at.desc&limit=200`); return r.data || []; },
  async rpc(fn, args) { const r = await sb(`/rest/v1/rpc/${fn}`, { method: "POST", body: args }); return r; },
  async invite(email, redirectTo) {
    return sb(`/auth/v1/invite`, { method: "POST", body: { email, data: {}, ...(redirectTo ? { redirect_to: redirectTo } : {}) } });
  },
  async createUser(email) { return sb(`/auth/v1/admin/users`, { method: "POST", body: { email, email_confirm: true } }); }
};

/* ---------------- quem está logado ---------------- */
export async function authEmail(request) {
  const h = request.headers.get("authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(SB_URL() + "/auth/v1/user", { headers: { apikey: env("SUPABASE_ANON_KEY", SB_KEY()), Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.email ? String(u.email).toLowerCase() : null;
}

/* ---------------- acesso e saldo ---------------- */
export function isAdminEmail(email) { return !!email && env("ADMIN_EMAILS", "").toLowerCase().split(/[,\s]+/).filter(Boolean).includes(String(email).toLowerCase()); }
export function accessFor(email, p) { if (isAdminEmail(email)) return { ok: true, credits: Math.max(999, ((p && p.plan_credits) || 0) + ((p && p.extra_credits) || 0)), admin: true }; return accessState(p); }
export function accessState(p) {
  if (!p) return { ok: false, reason: "sem_assinatura" };
  if (p.status === "bloqueado") return { ok: false, reason: "bloqueado" };
  const active = p.period_end && new Date(p.period_end) > new Date();
  const credits = (p.plan_credits || 0) + (p.extra_credits || 0);
  if (!active && (p.extra_credits || 0) <= 0) return { ok: false, reason: "expirado" };
  const cap = +env("COST_CAP_RATIO", 0.3);
  if (p.paid_cents > 0 && +p.cost_cents > cap * p.paid_cents) return { ok: false, reason: "limite_custo", credits };
  if (credits <= 0) return { ok: false, reason: "sem_creditos", credits: 0 };
  return { ok: true, credits };
}
export function publicProfile(p) {
  if (!p) return null;
  return { email: p.email, name: p.name, plan: p.plan, status: p.status, period_end: p.period_end, next_refill: p.next_refill,
    monthly_credits: p.monthly_credits, plan_credits: p.plan_credits, extra_credits: p.extra_credits,
    credits: (p.plan_credits || 0) + (p.extra_credits || 0), videos_total: p.videos_total, sub_until: p.sub_until || null,
    monthly_active: !!(p.sub_until && new Date(p.sub_until) > new Date()) };
}

/* ---------------- respostas ---------------- */
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/* ---------------- Kiwify ---------------- */
export function kiwifySignatureOk(raw, signature) {
  const token = env("KIWIFY_TOKEN", "");
  if (!token || !signature) return false;
  const calc = crypto.createHmac("sha1", token).update(raw, "utf8").digest("hex");
  const a = Buffer.from(calc), b = Buffer.from(String(signature).toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- liberar / renovar / bloquear ---------------- */
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
export async function grant(email, key, { name, renew = false } = {}) {
  const P = plans()[key]; if (!P) throw new Error("produto desconhecido: " + key);
  email = email.toLowerCase();
  const cur = await db.profile(email);
  const now = new Date();
  if (P.kind === "lifetime") {
    const row = { email, name: name || (cur && cur.name) || null, plan: "vitalicio", status: "ativo", period_end: "2099-12-31T23:59:59Z",
      extra_credits: ((cur && cur.extra_credits) || 0) + P.credits, paid_cents: ((cur && +cur.paid_cents) || 0) + P.price_cents, updated_at: now.toISOString() };
    if (cur) await db.patchProfile(email, row); else await db.upsertProfile(row);
    return { kind: "plan", plan: "vitalicio", credits: P.credits };
  }
  if (P.kind === "monthly_credits") {
    const sub = new Date(now); sub.setDate(sub.getDate() + 35);
    const row = cur ? { extra_credits: (cur.extra_credits || 0) + P.credits, paid_cents: (+cur.paid_cents || 0) + (P.price_cents || 0), sub_until: sub.toISOString() }
                    : { email, name: name || null, status: "ativo", extra_credits: P.credits, paid_cents: P.price_cents || 0, sub_until: sub.toISOString() };
    if (cur) await db.patchProfile(email, row); else await db.upsertProfile(row);
    return { kind: "monthly_credits", credits: P.credits };
  }
  if (P.kind === "pack") {
    const row = cur ? { extra_credits: (cur.extra_credits || 0) + P.credits, paid_cents: (+cur.paid_cents || 0) + P.price_cents, status: cur.status === "bloqueado" ? "bloqueado" : cur.status }
                    : { email, name: name || null, status: "ativo", extra_credits: P.credits, paid_cents: P.price_cents };
    if (cur) await db.patchProfile(email, row); else await db.upsertProfile(row);
    return { kind: "pack", credits: P.credits };
  }
  const base = cur && cur.period_end && new Date(cur.period_end) > now ? new Date(cur.period_end) : now;
  const period_end = addMonths(base, P.months);
  period_end.setDate(period_end.getDate() + 3); // 3 dias de tolerância
  const row = {
    email, name: name || (cur && cur.name) || null, plan: key, status: "ativo", period_end: period_end.toISOString(),
    monthly_credits: P.monthly, plan_credits: P.monthly, next_refill: addMonths(now, 1).toISOString(),
    paid_cents: ((cur && +cur.paid_cents) || 0) + P.price_cents, updated_at: now.toISOString()
  };
  if (cur) await db.patchProfile(email, row); else await db.upsertProfile(row);
  return { kind: "plan", plan: key, period_end: row.period_end };
}
export async function revoke(email, key) {
  const P = plans()[key]; email = email.toLowerCase();
  if (!P || P.kind === "lifetime" || P.kind === "plan") return block(email);
  const cur = await db.profile(email); if (!cur) return null;
  return db.patchProfile(email, { extra_credits: Math.max(0, (cur.extra_credits || 0) - (P.credits || 0)), ...(P.kind === "monthly_credits" ? { sub_until: null } : {}) });
}
export async function block(email) { return db.patchProfile(email.toLowerCase(), { status: "bloqueado", plan_credits: 0, extra_credits: 0 }); }
export async function cancel(email) { return db.patchProfile(email.toLowerCase(), { status: "cancelado" }); }

/* ---------------- Hypercash ---------------- */
// Segurança: a URL do webhook leva uma chave secreta (?key=...). Se HYPERCASH_SECRET_KEY estiver configurada,
// o sistema ainda confirma a transação direto na API da Hypercash antes de liberar.
export function hypercashKeyOk(request) {
  const want = env("HYPERCASH_WEBHOOK_KEY", "");
  const got = new URL(request.url).searchParams.get("key") || "";
  if (!want || !got) return false;
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function hypercashConfirm(id) {
  const sk = env("HYPERCASH_SECRET_KEY", "");
  if (!sk) return null; // sem chave de API: confia na chave do webhook
  const base = env("HYPERCASH_API", "https://api.hypercashbrasil.com.br").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/api/user/transactions/${encodeURIComponent(id)}`, { headers: { Authorization: "Basic " + Buffer.from("x:" + sk).toString("base64") } });
    if (!r.ok) return { ok: false, status: r.status };
    const d = await r.json(); const t = d && (d.data || d);
    return { ok: true, status: String(t.status || "").toLowerCase(), email: String((t.customer && t.customer.email) || "").toLowerCase() };
  } catch (e) { return { ok: false, error: String(e) }; }
}
export function hypercashKey(data) {
  let map = {}; try { map = JSON.parse(env("HYPERCASH_PRODUCT_MAP", "{}")); } catch {}
  const items = Array.isArray(data.items) ? data.items : [];
  for (const it of items) for (const c of [it.id, it.title, it.externalRef]) if (c && map[String(c)]) return map[String(c)];
  if (data.metadata && data.metadata.produto && plans()[data.metadata.produto]) return data.metadata.produto;
  const byTitle = productKey({ product_name: items.map(i => i.title || "").join(" ") });
  if (byTitle) return byTitle;
  const amt = +data.amount || 0;
  for (const [k, P] of Object.entries(plans())) if (P.price_cents && Math.abs(P.price_cents - amt) < 2) return k;
  return null;
}

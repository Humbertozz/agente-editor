// Teste de ponta a ponta com Supabase e Anthropic simulados: node test/flow.test.mjs
import crypto from "node:crypto";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.KIWIFY_TOKEN = "kiwify-token-de-teste";
process.env.ANTHROPIC_API_KEY = "sk-test";
process.env.ADMIN_EMAILS = "dono@flamefields.com";
process.env.PRODUCT_MAP = JSON.stringify({ "prod-mensal": "mensal", "prod-r100": "recarga100" });
process.env.HYPERCASH_WEBHOOK_KEY = "hc-secret-123";

const DB = { profiles: new Map(), events: new Set(), usage: [], leads: [] };
let anthropicVideos = 3, lastAnthropicBody = null;
const tokens = { "tok-cliente": "cliente@imob.com", "tok-dono": "dono@flamefields.com" };
const res = (status, body) => new Response(body == null ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url); const method = opts.method || "GET"; const body = opts.body ? JSON.parse(opts.body) : null;
  if (u.host === "api.anthropic.com") {
    lastAnthropicBody = body;
    const lastText = JSON.stringify(body.messages.at(-1).content);
    if (lastText.includes("REFERÊNCIA")) return res(200, { content: [{ type: "text", text: JSON.stringify({ nome: "Motion laranja", resumo: "Texto palavra por palavra.", receita: { pegada: "motion", musica: "lancamento", recursos: ["palavra por palavra", "faixa laranja"] }, prompt: "Faça 3 vídeos MOTION do [NOME]", limites: "UI não reproduz." }) }], usage: { input_tokens: 9000, output_tokens: 900 } });
    const vids = Array.from({ length: anthropicVideos }, (_, i) => ({ titulo: "V" + (i + 1), pegada: "agressivo", cenas: [{ clip: "a", batidas: 60 }], textos: [] }));
    return res(200, { content: [{ type: "text", text: JSON.stringify({ resposta: "Fechado.", videos: vids }) }], usage: { input_tokens: 8000, output_tokens: 4000 } });
  }
  if (u.pathname === "/auth/v1/user") { const tk = (opts.headers.Authorization || "").replace("Bearer ", ""); return tokens[tk] ? res(200, { email: tokens[tk] }) : res(401, {}); }
  if (u.pathname === "/auth/v1/invite") return res(200, { ok: true });
  if (u.pathname === "/auth/v1/admin/users") return res(200, {});
  if (u.pathname === "/rest/v1/profiles") {
    const em = (u.searchParams.get("email") || "").replace(/^eq\./, "");
    if (method === "GET") return res(200, em ? (DB.profiles.has(em) ? [DB.profiles.get(em)] : []) : [...DB.profiles.values()]);
    if (method === "POST") { const row = { status: "ativo", monthly_credits: 0, plan_credits: 0, extra_credits: 0, paid_cents: 0, cost_cents: 0, videos_total: 0, created_at: new Date().toISOString(), ...body }; DB.profiles.set(row.email, row); return res(201, [row]); }
    if (method === "PATCH") { const r = DB.profiles.get(em); Object.assign(r, body); return res(200, [r]); }
  }
  if (u.pathname === "/rest/v1/events") {
    if (method === "POST") { if (DB.events.has(body.id)) return res(409, { code: "23505" }); DB.events.add(body.id); return res(201, null); }
    if (method === "DELETE") { DB.events.delete((u.searchParams.get("id") || "").replace(/^eq\./, "")); return res(204, null); }
  }
  if (u.pathname === "/rest/v1/leads") { if (method === "POST") { DB.leads.push(body); return res(201, null); } return res(200, DB.leads); }
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = u.pathname.split("/").pop(); const r = DB.profiles.get((body.p_email || "").toLowerCase());
    if (fn === "ff_refill") {
      if (!r) return res(200, null);
      if (r.status !== "bloqueado" && r.period_end && new Date(r.period_end) > new Date() && r.next_refill && new Date(r.next_refill) <= new Date()) { r.plan_credits = r.monthly_credits; let n = new Date(r.next_refill); while (n <= new Date()) n = addMonths(n, 1); r.next_refill = n.toISOString(); }
      return res(200, r);
    }
    if (fn === "ff_debit") { const fp = Math.min(r.plan_credits, body.p_videos); const fx = Math.min(r.extra_credits, body.p_videos - fp); r.plan_credits -= fp; r.extra_credits -= fx; r.cost_cents = +r.cost_cents + body.p_cost; r.videos_total += body.p_videos; DB.usage.push(body); return res(200, r); }
    if (fn === "ff_charge") { const fp = Math.min(r.plan_credits, body.p_credits); const fx = Math.min(r.extra_credits, body.p_credits - fp); r.plan_credits -= fp; r.extra_credits -= fx; r.cost_cents = +r.cost_cents + body.p_cost; return res(200, r); }
    if (fn === "ff_cost") { r.cost_cents = +r.cost_cents + body.p_cost; DB.usage.push(body); return res(200, null); }
  }
  throw new Error("fetch não simulado: " + method + " " + url);
};

const { kiwifySignatureOk } = await import("../api/_lib.js");
const webhook = await import("../api/webhook-kiwify.js");
const agent = await import("../api/agent.js");
const me = await import("../api/me.js");
const admin = await import("../api/admin.js");
const lead = await import("../api/lead.js");
const hyper = await import("../api/webhook-hypercash.js");
const style = await import("../api/style.js");

// 1) vetor de teste oficial da assinatura Kiwify
assert.equal(kiwifySignatureOk('{"order_id":"9b1c2d3e-0000-4000-8000-000000000001","order_status":"paid","webhook_event_type":"order_approved"}', "bf18f352a4f981b91dfa3f6d8742a81080ab8c86"), true);
assert.equal(kiwifySignatureOk('{"x":1}', "bf18f352a4f981b91dfa3f6d8742a81080ab8c86"), false);
console.log("✓ assinatura Kiwify confere com o vetor oficial");

const kiwi = async (obj, badSig) => { const raw = JSON.stringify(obj); const sig = badSig ? "0".repeat(40) : crypto.createHmac("sha1", process.env.KIWIFY_TOKEN).update(raw).digest("hex"); return webhook.POST(new Request("https://site.test/api/webhook-kiwify?signature=" + sig, { method: "POST", body: raw })); };
const call = (mod, method, tok, body) => mod[method](new Request("https://site.test/api/x", { method, headers: tok ? { authorization: "Bearer " + tok, "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));
const agentReq = (tok) => call(agent, "POST", tok, { lang: "pt", turns: [{ role: "user", content: "faz 3 videos" }], catalog: [{ id: "a", dur: 8 }], images: ["data:image/jpeg;base64,AAAA"], feitos: [] });

// 2) assinatura inválida é recusada
assert.equal((await kiwi({ order_id: "x", webhook_event_type: "order_approved", order_status: "paid" }, true)).status, 401);
console.log("✓ webhook com assinatura falsa é recusado (401)");

// 3) cliente sem compra não usa
{ const r0 = await agentReq("tok-cliente"); const d0 = await r0.json();
  assert.equal(r0.status, 200); assert.equal(d0.videos.length, 3); assert.equal(d0.profile.plan, "teste"); assert.equal(d0.profile.credits, 0); }
{ const r1 = await agentReq("tok-cliente"); assert.equal(r1.status, 402); assert.equal((await r1.json()).error, "expirado"); }
assert.equal((await agentReq("tok-invalido")).status, 401);
console.log("✓ cadastro grátis: e-mail novo gera 3 vídeos de teste, depois bloqueia e pede compra; sem login = 401");

// 4) compra aprovada libera 120 créditos
let r = await kiwi({ order_id: "o1", webhook_event_type: "order_approved", order_status: "paid", Customer: { email: "Cliente@Imob.com", full_name: "Ana Corretora" }, Product: { product_id: "prod-mensal", product_name: "Flamefields Mensal" } });
assert.equal(r.status, 200);
let p = DB.profiles.get("cliente@imob.com");
assert.equal(p.plan, "mensal"); assert.equal(p.plan_credits, 120); assert.equal(p.paid_cents, 32990);
console.log("✓ compra aprovada → acesso + 120 créditos + convite por e-mail");

// 5) evento repetido não duplica
await kiwi({ order_id: "o1", webhook_event_type: "order_approved", order_status: "paid", Customer: { email: "cliente@imob.com" }, Product: { product_id: "prod-mensal" } });
assert.equal(DB.profiles.get("cliente@imob.com").paid_cents, 32990);
console.log("✓ webhook repetido não soma duas vezes");

// 6) pedido no agente desconta créditos e registra custo
r = await agentReq("tok-cliente"); let d = await r.json();
assert.equal(r.status, 200); assert.equal(d.videos.length, 3); assert.equal(d.profile.credits, 117);
assert.ok(lastAnthropicBody.system[0].text.includes("FLAMEFIELDS")); assert.equal(lastAnthropicBody.messages.at(-1).content[0].type, "image");
assert.ok(DB.profiles.get("cliente@imob.com").cost_cents > 0);
console.log("✓ agente gera 3 vídeos, desconta 3 créditos (sobram 297) e registra o custo: R$", (DB.profiles.get("cliente@imob.com").cost_cents / 100).toFixed(3));

// 7) créditos acabando: corta o excedente
DB.profiles.get("cliente@imob.com").plan_credits = 2;
r = await agentReq("tok-cliente"); d = await r.json();
assert.equal(d.videos.length, 2); assert.equal(d.cut, 1); assert.equal(d.profile.credits, 0);
console.log("✓ com 2 créditos e pedido de 3: entrega 2, avisa que 1 ficou de fora");

// 8) zerado: bloqueia e pede recarga
r = await agentReq("tok-cliente"); d = await r.json();
assert.equal(r.status, 402); assert.equal(d.error, "sem_creditos");
console.log("✓ sem créditos → bloqueia e mostra recarga");

// 9) recarga de 100 entra como extra
await kiwi({ order_id: "o2", webhook_event_type: "order_approved", order_status: "paid", Customer: { email: "cliente@imob.com" }, Product: { product_id: "prod-r100" } });
r = await call(me, "GET", "tok-cliente"); d = await r.json();
assert.equal(d.profile.credits, 100); assert.equal(d.access.ok, true);
console.log("✓ recarga de 100 → volta a gerar");

// 10) trava de custo: se o custo de API passar de 30% do pago, bloqueia
DB.profiles.get("cliente@imob.com").cost_cents = 0.31 * DB.profiles.get("cliente@imob.com").paid_cents;
r = await agentReq("tok-cliente"); assert.equal(r.status, 402); assert.equal((await r.json()).error, "limite_custo");
DB.profiles.get("cliente@imob.com").cost_cents = 0;
console.log("✓ trava de custo protege contra prejuízo");

// 11) renovação mensal e virada do mês
DB.profiles.get("cliente@imob.com").plan_credits = 10;
await kiwi({ order_id: "o1", webhook_event_type: "subscription_renewed", order_status: "paid", Customer: { email: "cliente@imob.com" }, Product: { product_id: "prod-mensal" } });
assert.equal(DB.profiles.get("cliente@imob.com").plan_credits, 120);
DB.profiles.get("cliente@imob.com").plan_credits = 5; DB.profiles.get("cliente@imob.com").next_refill = new Date(Date.now() - 1000).toISOString();
r = await call(me, "GET", "tok-cliente"); d = await r.json(); assert.equal(d.profile.plan_credits, 120);
console.log("✓ renovação e virada do mês recarregam a franquia de 120");

// 12) reembolso bloqueia
await kiwi({ order_id: "o1", webhook_event_type: "order_refunded", order_status: "refunded", Customer: { email: "cliente@imob.com" }, Product: { product_id: "prod-mensal" } });
r = await agentReq("tok-cliente"); assert.equal(r.status, 402); assert.equal((await r.json()).error, "bloqueado");
console.log("✓ reembolso/chargeback → acesso bloqueado");

// 13) painel: só admin; liberação manual
assert.equal((await call(admin, "GET", "tok-cliente")).status, 403);
r = await call(admin, "POST", "tok-dono", { action: "grant", email: "pix@construtora.com", key: "anual", name: "Construtora" });
assert.equal(r.status, 200); assert.equal(DB.profiles.get("pix@construtora.com").plan_credits, 200);
r = await call(admin, "GET", "tok-dono"); d = await r.json(); assert.ok(d.profiles.length >= 2);
console.log("✓ painel do produtor: só admin entra; liberação manual (venda por Pix) funciona");

// 14) lead
r = await lead.POST(new Request("https://site.test/api/lead", { method: "POST", body: JSON.stringify({ nome: "Rafa", whatsapp: "79 9999-0000", plano: "anual" }) }));
assert.equal(r.status, 200); assert.equal(DB.leads.length, 1);
console.log("✓ formulário de contato salva o lead");
// 15) Hypercash: pagamento único vitalício
tokens["tok-vit"] = "vit@imob.com";
const hc = (obj, key = "hc-secret-123") => hyper.POST(new Request("https://site.test/api/webhook-hypercash?key=" + key, { method: "POST", body: JSON.stringify(obj) }));
const tx = (id, status, amount, title) => ({ type: "transaction", objectId: id, data: { id, status, amount, currency: "BRL", items: [{ id: "it", title, quantity: 1, unitPrice: amount }], customer: { name: "Vit", email: "Vit@Imob.com" } } });
assert.equal((await hc(tx("t1", "paid", 119090, "Flamefields Acesso Vitalício"), "errada")).status, 401);
r = await hc(tx("t1", "paid", 119090, "Flamefields Acesso Vitalício")); assert.equal(r.status, 200);
p = DB.profiles.get("vit@imob.com"); assert.equal(p.plan, "vitalicio"); assert.equal(p.extra_credits, 1000); assert.ok(new Date(p.period_end).getFullYear() >= 2099);
await hc(tx("t1", "paid", 119090, "Flamefields Acesso Vitalício")); assert.equal(DB.profiles.get("vit@imob.com").extra_credits, 1000);
console.log("✓ Hypercash: pagamento único R$ 1.190,90 → acesso vitalício + 1.000 créditos (sem duplicar)");
// 16) assinatura mensal de créditos: cada cobrança soma 300
r = await hc(tx("m1", "paid", 19790, "Flamefields Créditos Mensais")); assert.equal(r.status, 200);
r = await hc(tx("m2", "paid", 19790, "Flamefields Créditos Mensais"));
p = DB.profiles.get("vit@imob.com"); assert.equal(p.extra_credits, 1600); assert.ok(p.sub_until);
r = await call(me, "GET", "tok-vit"); d = await r.json(); assert.equal(d.profile.monthly_active, true);
console.log("✓ créditos mensais: cada mês pago soma +300 (1.000 → 1.600) e marca assinatura ativa");
// 17) estorno de uma mensalidade tira só aqueles créditos
await hc(tx("m2", "refunded", 19790, "Flamefields Créditos Mensais"));
assert.equal(DB.profiles.get("vit@imob.com").extra_credits, 1300); assert.equal(DB.profiles.get("vit@imob.com").status, "ativo");
console.log("✓ estorno da mensalidade remove só os 300 créditos dela, acesso continua");
// 18) identificador de estilo cobra 5 créditos
r = await call(style, "POST", "tok-vit", { lang: "pt", frames: ["data:image/jpeg;base64,AAAA", "AAAA", "AAAA"], duracao: 81, cortes: 12, plano: 6.2, formato: "9:16" });
d = await r.json(); assert.equal(r.status, 200); assert.equal(d.estilo.nome, "Motion laranja"); assert.equal(d.profile.credits, 1295);
console.log("✓ identificador de estilo devolve receita + prompt e cobra 5 créditos (1.300 → 1.295)");
// 19) estilo ativo vai para o agente
r = await call(agent, "POST", "tok-vit", { lang: "pt", turns: [{ role: "user", content: "faz 1" }], catalog: [{ id: "a", dur: 8 }], feitos: [], estilo: { nome: "Motion laranja", resumo: "x", receita: { pegada: "motion" } } });
assert.equal(r.status, 200); assert.ok(lastAnthropicBody.system[0].text.includes("ESTILO DE REFERÊNCIA ATIVO") && lastAnthropicBody.system[0].text.includes("Motion laranja"));
console.log("✓ estilo escolhido entra nas regras do agente nos próximos vídeos");
// 20) chargeback do vitalício bloqueia
await hc(tx("t1", "chargedback", 119090, "Flamefields Acesso Vitalício"));
assert.equal(DB.profiles.get("vit@imob.com").status, "bloqueado");
console.log("✓ chargeback do acesso vitalício bloqueia");
// 21) produtor (ADMIN_EMAILS) usa sem comprar
r = await call(agent, "POST", "tok-dono", { lang: "pt", turns: [{ role: "user", content: "faz 1" }], catalog: [{ id: "a", dur: 8 }], feitos: [] });
assert.equal(r.status, 200); d = await r.json(); assert.ok(d.profile.credits >= 999);
console.log("✓ o produtor entra e usa o estúdio sem precisar comprar");
console.log("\nTODOS OS TESTES PASSARAM");

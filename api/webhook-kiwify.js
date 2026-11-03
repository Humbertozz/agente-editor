// POST /api/webhook-kiwify?signature=... — a Kiwify avisa cada venda, renovação, reembolso e chargeback.
import { json, db, env, kiwifySignatureOk, productKey, grant, block, cancel } from "./_lib.js";

export async function POST(request) {
  const raw = await request.text();
  const sig = new URL(request.url).searchParams.get("signature");
  if (!kiwifySignatureOk(raw, sig)) return json({ error: "assinatura inválida" }, 401);
  let p; try { p = JSON.parse(raw); } catch { return json({ error: "json" }, 400); }

  const type = p.webhook_event_type || "";
  const orderId = p.order_id || (p.Subscription && p.Subscription.id) || "";
  const C = p.Customer || p.customer || {};
  const email = String(C.email || p.email || "").trim().toLowerCase();
  const name = C.full_name || C.name || p.name || null;
  const key = productKey(p);

  // idempotência: o mesmo pedido+evento só é processado uma vez
  const ins = await db.insertEvent({ id: `${orderId}:${type}`, email, type, product: key, payload: p });
  if (!ins.ok && ins.status === 409) return json({ ok: true, duplicate: true });
  if (!email) return json({ ok: true, ignored: "sem e-mail" });

  try {
    if (type === "order_approved" && p.order_status === "paid") {
      if (!key) return json({ ok: true, ignored: "produto não mapeado" });
      const res = await grant(email, key, { name });
      if (res.kind === "plan") {
        const site = env("SITE_URL", "");
        const inv = await db.invite(email, site ? site + "/app" : undefined);
        if (!inv.ok) await db.createUser(email); // já existia ou convite falhou: garante o usuário
      }
      return json({ ok: true, granted: res });
    }
    if (type === "subscription_renewed") {
      if (!key || key.startsWith("recarga")) return json({ ok: true, ignored: "renovação sem plano" });
      return json({ ok: true, renewed: await grant(email, key, { name, renew: true }) });
    }
    if (type === "order_refunded" || type === "chargeback") { await block(email); return json({ ok: true, blocked: true }); }
    if (type === "subscription_canceled") { await cancel(email); return json({ ok: true, canceled: true }); }
    return json({ ok: true, ignored: type });
  } catch (e) {
    console.error(e);
    await db.deleteEvent(`${orderId}:${type}`); // deixa a Kiwify tentar de novo
    return json({ error: String(e.message || e) }, 500);
  }
}

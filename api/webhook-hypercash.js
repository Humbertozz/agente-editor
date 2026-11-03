// POST /api/webhook-hypercash?key=SUA_CHAVE — a Hypercash avisa cada transação (pagamento único, mensalidade de créditos, reembolso).
import { json, db, env, grant, revoke, hypercashKeyOk, hypercashConfirm, hypercashKey } from "./_lib.js";

export async function POST(request) {
  if (!hypercashKeyOk(request)) return json({ error: "chave inválida" }, 401);
  let p; try { p = JSON.parse(await request.text()); } catch { return json({ error: "json" }, 400); }
  const d = p.data || p;
  const id = String(d.id || p.objectId || "");
  const status = String(d.status || "").toLowerCase();
  const email = String((d.customer && d.customer.email) || "").trim().toLowerCase();
  const name = (d.customer && d.customer.name) || null;
  const key = hypercashKey(d);
  if (!id || !email) return json({ ok: true, ignored: "sem id ou e-mail" });

  const evId = `hc:${id}:${status}`;
  const ins = await db.insertEvent({ id: evId, email, type: "hypercash_" + status, product: key, payload: p });
  if (!ins.ok && ins.status === 409) return json({ ok: true, duplicate: true });

  try {
    if (status === "paid" || status === "authorized" && env("HYPERCASH_GRANT_ON_AUTHORIZED", "") === "1") {
      const conf = await hypercashConfirm(id);
      if (conf && (!conf.ok || conf.status !== "paid" || (conf.email && conf.email !== email))) { await db.deleteEvent(evId); return json({ error: "não confirmado na Hypercash", conf }, 409); }
      if (!key) return json({ ok: true, ignored: "produto não mapeado" });
      const res = await grant(email, key, { name });
      if (res.kind === "plan") { const site = env("SITE_URL", ""); const inv = await db.invite(email, site ? site + "/app" : undefined); if (!inv.ok) await db.createUser(email); }
      return json({ ok: true, granted: res });
    }
    if (status === "refunded" || status === "chargedback" || status === "in_protest") { await revoke(email, key || "vitalicio"); return json({ ok: true, revoked: key }); }
    return json({ ok: true, ignored: status });
  } catch (e) {
    console.error(e); await db.deleteEvent(evId);
    return json({ error: String(e.message || e) }, 500);
  }
}

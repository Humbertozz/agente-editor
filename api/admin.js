// /api/admin — painel do produtor (só e-mails em ADMIN_EMAILS)
import { json, authEmail, db, env, grant, block, plans } from "./_lib.js";

async function isAdmin(request) {
  const email = await authEmail(request);
  const admins = env("ADMIN_EMAILS", "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  return email && admins.includes(email) ? email : null;
}

export async function GET(request) {
  if (!(await isAdmin(request))) return json({ error: "forbidden" }, 403);
  const [profiles, leads] = await Promise.all([db.listProfiles(), db.listLeads()]);
  const rate = 1;
  const totals = profiles.reduce((a, p) => ({ paid: a.paid + (+p.paid_cents || 0), cost: a.cost + (+p.cost_cents || 0), videos: a.videos + (p.videos_total || 0), ativos: a.ativos + (p.status !== "bloqueado" && p.period_end && new Date(p.period_end) > new Date() ? 1 : 0) }), { paid: 0, cost: 0, videos: 0, ativos: 0 });
  return json({ profiles, leads, totals, plans: plans(), rate });
}

// ações: { action: "grant", email, key, name } | { action: "block", email } | { action: "credits", email, add }
export async function POST(request) {
  if (!(await isAdmin(request))) return json({ error: "forbidden" }, 403);
  let b; try { b = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  if (!email) return json({ error: "email" }, 400);
  if (b.action === "grant") {
    const res = await grant(email, b.key, { name: b.name || null });
    if (res.kind === "plan") { const site = env("SITE_URL", ""); const inv = await db.invite(email, site ? site + "/app" : undefined); if (!inv.ok) await db.createUser(email); }
    return json({ ok: true, res });
  }
  if (b.action === "block") { await block(email); return json({ ok: true }); }
  if (b.action === "credits") {
    const p = await db.profile(email); if (!p) return json({ error: "não encontrado" }, 404);
    await db.patchProfile(email, { extra_credits: Math.max(0, (p.extra_credits || 0) + (+b.add || 0)) });
    return json({ ok: true });
  }
  return json({ error: "ação" }, 400);
}

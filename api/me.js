// GET /api/me — saldo e situação da assinatura do cliente logado
import { json, authEmail, db, accessState, publicProfile, env } from "./_lib.js";

export async function GET(request) {
  const email = await authEmail(request);
  if (!email) return json({ error: "login" }, 401);
  let p = (await db.rpc("ff_refill", { p_email: email })).data;
  if (!p || !p.email) p = await db.profile(email);
  const st = accessState(p);
  const admins = env("ADMIN_EMAILS", "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  return json({ email, access: st, profile: publicProfile(p), admin: admins.includes(email) });
}

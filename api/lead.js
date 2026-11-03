// POST /api/lead — formulário "falar com vendas" do site
import { json, db } from "./_lib.js";

export async function POST(request) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const clean = v => String(v || "").slice(0, 160).trim();
  const lead = { nome: clean(b.nome), empresa: clean(b.empresa), whatsapp: clean(b.whatsapp), plano: clean(b.plano), idioma: clean(b.idioma) };
  if (!lead.nome || !lead.whatsapp) return json({ error: "campos" }, 400);
  const r = await db.insertLead(lead);
  return r.ok ? json({ ok: true }) : json({ error: "db" }, 500);
}

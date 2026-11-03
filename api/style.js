// POST /api/style — identifica o estilo de um vídeo de referência e devolve uma "receita" + prompt pronto. Cobra créditos.
import { env, json, authEmail, db, accessState, publicProfile, costCents, STYLE_COST } from "./_lib.js";

export const maxDuration = 120;

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const f = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

const PROMPT = (lang, meta, note) => `Você é o FLAMEFIELDS, diretor de arte e editor de vídeos curtos para lançamentos imobiliários. Nunca diga que é o Claude ou outra IA.
As imagens são quadros, em ordem, de um vídeo de REFERÊNCIA que o cliente quer copiar o estilo. Dados medidos: duração ${meta.duracao}s, ${meta.cortes} trocas de cena detectadas (≈ ${meta.plano}s por cena), formato ${meta.formato}.
${note ? "Observação do cliente: " + note : ""}
Analise como um editor profissional: ritmo de cortes, entrada dos textos (palavra por palavra, digitado, desfoque, sobe), tipografia (peso, caixa alta/baixa, alinhamento, itálico serifado, contraste), uso de cor de destaque (palavra pintada, faixa/caixa atrás da palavra, riscado), tratamento da imagem (escurecida, granulada, quente/fria, widescreen), elementos gráficos e a estrutura narrativa (gancho, virada, fechamento/CTA).
Depois TRADUZA para os recursos que o editor Flamefields tem: pegada "motion"|"agressivo"|"tranquilo"; musica "lancamento"|"epico"|"cinema"|"house" (nunca trap); cor "punchy"|"warm"|"teal"|"dark"|"film"; escurecer 0 a 0.6; brilho bool; pontos bool (grade de pontinhos); destaque hex; alinha "esquerda"|"centro"; layout "cheio"|"cinema"; textos com anim "palavra"|"digita"|"desfoca"|"sobe"|"fade"|"pisca", "marca" (palavra em cor), "caixa" (faixa), "risco", "estilo":"serif", tamanhos xg/gg/g/m/p, cor "cinza" para linhas de contexto.
Escreva em ${lang === "en" ? "inglês" : "português do Brasil"}.
RESPONDA SÓ COM JSON:
{"nome": string curto e marcante para o estilo,
 "resumo": 2 a 3 frases descrevendo o estilo,
 "receita": {"pegada", "musica", "bpm", "cor", "escurecer", "brilho", "pontos", "destaque", "alinha", "layout", "ritmo": frase sobre a duração das cenas, "tipografia": frase sobre como os textos aparecem, "recursos": [lista curta de técnicas a usar sempre], "estrutura": [lista dos blocos do roteiro em ordem]},
 "prompt": um pedido completo e profissional que o cliente pode colar para gerar vídeos nesse estilo, com [colchetes] onde ele deve preencher nome, data, diferenciais e oferta,
 "limites": 1 frase sobre o que da referência não dá para reproduzir só com takes (ex.: telas de software, 3D) e como foi adaptado}`;

export async function POST(request) {
  const email = await authEmail(request);
  if (!email) return json({ error: "login" }, 401);
  let p = (await db.rpc("ff_refill", { p_email: email })).data;
  if (!p || !p.email) p = await db.profile(email);
  const st = accessState(p);
  const cost = STYLE_COST();
  if (!st.ok) return json({ error: st.reason, profile: publicProfile(p) }, 402);
  if (st.credits < cost) return json({ error: "sem_creditos", need: cost, profile: publicProfile(p) }, 402);

  let b; try { b = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const frames = (Array.isArray(b.frames) ? b.frames : []).filter(f => typeof f === "string" && f.length < 400000).slice(0, 14);
  if (frames.length < 3) return json({ error: "poucos_quadros" }, 400);
  const meta = { duracao: Math.round(+b.duracao || 0), cortes: Math.round(+b.cortes || 0), plano: (+b.plano || 0).toFixed(1), formato: String(b.formato || "9:16").slice(0, 10) };
  const lang = b.lang === "en" ? "en" : "pt";
  const note = String(b.nota || "").slice(0, 600);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY", ""), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"), max_tokens: 4000,
      messages: [{ role: "user", content: [...frames.map(d => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d.replace(/^data:image\/\w+;base64,/, "") } })), { type: "text", text: PROMPT(lang, meta, note) }] }]
    })
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) { console.error("anthropic", r.status, data); return json({ error: "upstream" }, 502); }
  const text = (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
  const out = parseJSON(text);
  const usage = data.usage || {}, c = costCents(usage);
  if (!out || !out.receita) { await db.rpc("ff_cost", { p_email: email, p_cost: c, p_in: usage.input_tokens || 0, p_out: usage.output_tokens || 0 }); return json({ error: "invalid_json" }, 502); }
  const after = (await db.rpc("ff_charge", { p_email: email, p_credits: cost, p_cost: c, p_in: usage.input_tokens || 0, p_out: usage.output_tokens || 0 })).data;
  return json({ estilo: out, cost, profile: publicProfile(after && after.email ? after : await db.profile(email)) });
}

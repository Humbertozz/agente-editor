// Flamefields — configuração pública (pode ficar visível no navegador).
window.FF_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "COLE_AQUI_A_ANON_KEY",

  // Endereço do servidor na Vercel (ex.: "https://flamefields.vercel.app").
  // Deixe vazio se o site estiver hospedado na própria Vercel. Preencha se o site estiver no GitHub Pages.
  API_BASE: "",

  // Links de pagamento (Hypercash). O e-mail do cliente logado é adicionado automaticamente quando possível.
  CHECKOUT: {
    vitalicio:       "https://pay.hypercash.com.br/pt/checkout/COLE_O_LINK_DO_ACESSO_VITALICIO",   // R$ 1.190,90 pagamento único
    creditos_mensal: "https://pay.hypercash.com.br/pt/checkout/b470cd3b-9c39-4ba3-b2cf-d76210413e74", // assinatura mensal de créditos
    recarga100:      "",  // opcional
    recarga300:      ""   // opcional
  },
  MONTHLY_PRICE: 0,      // preço da assinatura mensal de créditos (ex.: 197.90). 0 = não mostra o preço
  MONTHLY_CREDITS: 300,  // vídeos somados a cada mês pago
  STYLE_COST: 5          // créditos por análise de estilo
};

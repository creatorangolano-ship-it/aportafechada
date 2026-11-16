/**
 * Página /onlyfans-angola, para quem pesquisa no Google por «OnlyFans Angola», «OnlyFans angolano»
 * ou «site tipo OnlyFans em Angola».
 *
 * Regras desta página (para não sermos castigados pelo Google nem termos problemas com a marca):
 * - fala só da A Porta Fechada; o OnlyFans aparece apenas como referência, sem dizer nada
 *   sobre ele que não seja do conhecimento geral (é estrangeiro, cobra em dólares com cartão);
 * - nunca falar de outras plataformas angolanas (pedido do dono);
 * - nunca nos apresentar como «alternativa» (pedido do dono);
 * - fica claro que não temos ligação ao OnlyFans;
 * - o nome aparece onde é natural, nunca repetido à força nem escondido.
 *
 * Texto HTML puro: o servidor desenha-a antes de o JavaScript chegar, e o browser usa a mesma
 * função. Não pode importar nada que toque no DOM ou no Supabase.
 */

export const ROTA_ONLYFANS = 'onlyfans-angola';

/** Perguntas e respostas: aparecem na página e vão para o Google como FAQPage (page.tsx). */
export const ONLYFANS_FAQ: Array<[string, string]> = [
  ['Existe um OnlyFans angolano?', 'A Porta Fechada é a plataforma angolana de conteúdo exclusivo: criadores vendem subscrições, publicações pagas, gorjetas, mensagens e lives, e os fãs pagam em kwanzas com Multicaixa Express.'],
  ['A Porta Fechada é o OnlyFans?', 'Não. A Porta Fechada é uma plataforma angolana independente e não tem qualquer ligação ao OnlyFans.'],
  ['Preciso de cartão internacional para pagar?', 'Não. Pagas com Multicaixa Express ou referência Multicaixa (no ATM ou no internet banking), em kwanzas. Também podes carregar a carteira e pagar com o saldo.'],
  ['Quanto tempo demora a receber como criador?', 'Depois de pedires o levantamento, o valor chega à tua conta bancária em Angola em até 48 horas, sempre em nome do titular.'],
  ['Que conteúdos posso publicar?', 'Fotografias, vídeos, texto e lives, dentro das regras da comunidade: música, fitness, moda, humor, culinária, bastidores e muito mais. Cada publicação pode ser grátis, para subscritores ou vendida à parte.'],
  ['Criar conta é grátis?', 'Sim. Criar conta é grátis, para fãs e para criadores. A plataforma só fica com uma parte quando o criador vende.'],
];

export function onlyfansHtml(): string {
  const faq = ONLYFANS_FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('');
  return `<article class="doc">
   <h1>A plataforma de conteúdo exclusivo feita para Angola</h1>
   <p class="lead">Conheces o OnlyFans? A Porta Fechada funciona com a mesma ideia, mas foi feita para Angola: os fãs pagam em kwanzas com Multicaixa Express e os criadores recebem no banco angolano em até 48 horas.</p>
   <p><a class="btn pri lg" href="/registar">Criar conta grátis</a></p>

   <h2>O que é A Porta Fechada</h2>
   <p>A plataforma angolana onde criadores partilham conteúdo exclusivo com os fãs e ganham dinheiro com isso: subscrições mensais, publicações vendidas à parte, gorjetas, mensagens pagas e lives com bilhete. Fotografia, música, fitness, moda, humor, culinária, bastidores: o criador decide o que publica e quanto cobra.</p>

   <h2>Pensada para quem está em Angola</h2>
   <p>Plataformas estrangeiras como o OnlyFans cobram em dólares e pedem cartão internacional, que muitos angolanos não têm. Na A Porta Fechada é tudo em kwanzas:</p>
   <ul>
    <li><b>Pagar é simples:</b> Multicaixa Express, referência Multicaixa no ATM ou internet banking, ou saldo da carteira.</li>
    <li><b>O criador recebe depressa:</b> pedes o levantamento e o dinheiro chega à tua conta bancária em Angola em até 48 horas, sem taxa extra da plataforma sobre o levantamento.</li>
    <li><b>Em português, com apoio local:</b> a equipa está em Luanda e responde em até 24 horas úteis.</li>
   </ul>

   <h2>Várias formas de ganhar</h2>
   <ul>
    <li><b>Subscrição mensal:</b> os teus subscritores vêem tudo o que publicas para eles.</li>
    <li><b>Publicações pagas:</b> vende uma foto ou um vídeo à parte.</li>
    <li><b>Gorjetas e mensagens pagas:</b> os fãs mais próximos apoiam-te directamente.</li>
    <li><b>Lives com bilhete:</b> transmite em directo para quem pagou a entrada.</li>
    <li><b>Programa de afiliados:</b> convida criadores e ganha uma parte das vendas deles durante 6 meses.</li>
   </ul>

   <h2>Segurança e privacidade</h2>
   <ul>
    <li><b>Criadores verificados:</b> todos confirmam a identidade e a idade (18+) com documento e selfie antes de poderem receber.</li>
    <li><b>Conteúdo protegido:</b> os ficheiros pagos só abrem com links temporários para quem tem acesso, e cada conteúdo mostra o nome de quem o está a ver.</li>
    <li><b>Os teus dados ficam contigo:</b> o email, a data de nascimento e os dados bancários nunca aparecem no perfil, e os perfis de fãs não aparecem nas pesquisas.</li>
   </ul>

   <h2>Como começar em 3 passos</h2>
   <ol>
    <li><a href="/registar">Cria a tua conta</a> grátis com email ou Google.</li>
    <li>Escolhe «Quero ser criador», define o preço e envia o documento com uma selfie.</li>
    <li>Depois da aprovação, o teu perfil aparece em Explorar e começas a vender.</li>
   </ol>
   <p>Mais detalhes em <a href="/funciona">Como funciona</a> e nas <a href="/faq">Perguntas frequentes</a>.</p>

   <h2>Perguntas frequentes</h2>
   ${faq}

   <p class="small muted" style="margin-top:24px">OnlyFans é uma marca registada de terceiros, citada apenas como referência. A Porta Fechada não tem qualquer ligação ao OnlyFans.</p>
   <p><a class="btn pri lg" href="/registar">Criar conta grátis</a></p>
  </article>`;
}

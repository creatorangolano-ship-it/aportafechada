/**
 * Página «Alternativa ao Oprivado» (/alternativa-oprivado), para quem pesquisa no Google
 * por «Oprivado», «O Privado» ou «sites como o Oprivado».
 *
 * Regras desta página (para não sermos castigados pelo Google nem termos problemas com a marca):
 * - só dizemos coisas verdadeiras sobre a A Porta Fechada; sobre o Oprivado, nada que não
 *   possamos provar (nem preços, nem defeitos);
 * - fica claro que não temos ligação ao Oprivado;
 * - o nome aparece onde é natural (título, subtítulos, perguntas), nunca repetido à força
 *   nem escondido.
 *
 * Texto HTML puro: o servidor desenha-a antes de o JavaScript chegar, e o browser usa a mesma
 * função. Não pode importar nada que toque no DOM ou no Supabase.
 */

export const ROTA_OPRIVADO = 'alternativa-oprivado';

/** Perguntas e respostas: aparecem na página e vão para o Google como FAQPage (page.tsx). */
export const OPRIVADO_FAQ: Array<[string, string]> = [
  ['A Porta Fechada é o Oprivado?', 'Não. A Porta Fechada e o Oprivado (oprivado.ao) são plataformas diferentes, de empresas diferentes. Não temos qualquer ligação ao Oprivado.'],
  ['Qual é a melhor alternativa ao Oprivado em Angola?', 'A Porta Fechada é uma alternativa angolana ao Oprivado: criadores vendem conteúdo exclusivo por subscrição, publicações pagas, gorjetas, mensagens e lives, com pagamentos em kwanzas por Multicaixa Express.'],
  ['Posso estar no Oprivado e na A Porta Fechada ao mesmo tempo?', 'Sim. Não pedimos exclusividade. Muitos criadores usam mais de uma plataforma para chegar a mais fãs.'],
  ['Como pago na A Porta Fechada?', 'Com Multicaixa Express ou referência Multicaixa (no ATM ou no internet banking). Também podes carregar a carteira e pagar com o saldo.'],
  ['Quanto tempo demora a receber como criador?', 'Depois de pedires o levantamento, o valor chega à tua conta bancária em Angola em até 48 horas, sempre em nome do titular.'],
  ['Criar conta é grátis?', 'Sim. Criar conta é grátis, para fãs e para criadores. A plataforma só fica com uma parte quando o criador vende.'],
];

export function oprivadoHtml(): string {
  const faq = OPRIVADO_FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('');
  return `<article class="doc">
   <h1>Alternativa ao Oprivado em Angola</h1>
   <p class="lead">Procuras uma plataforma como o Oprivado (ou «O Privado») para vender ou ver conteúdo exclusivo em Angola? A Porta Fechada é a alternativa angolana, com pagamentos em kwanzas, criadores verificados e levantamentos em até 48 horas.</p>
   <p><a class="btn pri lg" href="/registar">Criar conta grátis</a></p>

   <h2>O que é A Porta Fechada</h2>
   <p>Uma plataforma onde criadores angolanos partilham conteúdo exclusivo com os fãs e ganham dinheiro com isso: subscrições mensais, publicações vendidas à parte, gorjetas, mensagens pagas e lives com bilhete. Fotografia, música, fitness, moda, humor, culinária, bastidores: o criador decide o que publica e quanto cobra.</p>

   <h2>Porque escolher A Porta Fechada como alternativa ao Oprivado</h2>
   <ul>
    <li><b>Pagamentos em kwanzas, à angolana:</b> Multicaixa Express, referência Multicaixa no ATM ou internet banking, ou saldo da carteira.</li>
    <li><b>O criador recebe depressa:</b> pedes o levantamento e o dinheiro chega à tua conta bancária em Angola em até 48 horas, sem taxa extra da plataforma sobre o levantamento.</li>
    <li><b>Várias formas de ganhar:</b> subscrição, publicações pagas, gorjetas, mensagens pagas e lives, tudo no mesmo perfil.</li>
    <li><b>Criadores verificados:</b> todos confirmam a identidade e a idade (18+) com documento e selfie antes de poderem receber.</li>
    <li><b>Conteúdo protegido:</b> os ficheiros pagos só abrem com links temporários para quem tem acesso, e cada conteúdo mostra o nome de quem o está a ver.</li>
    <li><b>Privacidade:</b> o teu email, data de nascimento e dados bancários nunca aparecem no perfil, e os perfis de fãs não aparecem nas pesquisas.</li>
    <li><b>Programa de afiliados:</b> convida criadores e ganha uma parte das vendas deles durante 6 meses.</li>
   </ul>

   <h2>O que comparar antes de escolher uma plataforma</h2>
   <p>Seja o Oprivado, A Porta Fechada ou outra, faz estas perguntas antes de criar o teu perfil de criador:</p>
   <ol>
    <li>Os fãs conseguem pagar com o que já usam (Multicaixa Express, referência)?</li>
    <li>Em quanto tempo o dinheiro chega ao teu banco, e há custos no levantamento?</li>
    <li>Que parte de cada venda fica para a plataforma?</li>
    <li>O conteúdo pago está protegido contra partilhas?</li>
    <li>A plataforma verifica a idade e a identidade de quem publica?</li>
   </ol>
   <p>As nossas respostas estão em <a href="/funciona">Como funciona</a> e nas <a href="/faq">Perguntas frequentes</a>.</p>

   <h2>Como começar em 3 passos</h2>
   <ol>
    <li><a href="/registar">Cria a tua conta</a> grátis com email ou Google.</li>
    <li>Escolhe «Quero ser criador», define o preço e envia o documento com uma selfie.</li>
    <li>Depois da aprovação, o teu perfil aparece em Explorar e começas a vender.</li>
   </ol>

   <h2>Perguntas frequentes sobre o Oprivado e A Porta Fechada</h2>
   ${faq}

   <p class="small muted" style="margin-top:24px">Oprivado é uma marca de terceiros, citada aqui apenas para comparação. A Porta Fechada não tem qualquer ligação ao Oprivado nem é aprovada por ele.</p>
   <p><a class="btn pri lg" href="/registar">Criar conta grátis</a></p>
  </article>`;
}

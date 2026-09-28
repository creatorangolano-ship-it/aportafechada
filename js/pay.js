// Pagamentos: carteira, Multicaixa Express, referência e PayPal
import { sb, $, esc, kz, ic, modal, closeModal, toast, fn, errText, busy, copyText } from './lib.js';
import { S, refreshMe } from './state.js';

let P = null; // pagamento em curso

const METHODS = [
  ['wallet', 'Saldo da carteira', 'phone'],
  ['mcx', 'Multicaixa Express', 'phone'],
  ['reference', 'Referência Multicaixa', 'bank'],
  ['paypal', 'PayPal ou cartão internacional', 'card'],
];

/** Onde o preço de cada tipo de compra é guardado. `null` = o valor é escolhido pelo utilizador. */
const PRICE_TABLE = {
  subscription: { table: 'creators', cols: 'id,price,status,profile:profiles!creators_id_fkey(name,handle)' },
  post: { table: 'posts', cols: 'id,price,status,creator_id,creator:creators(status)' },
  message: { table: 'messages', cols: 'id,ppv_price,thread_id' },
  ticket: { table: 'lives', cols: 'id,price,status,creator_id' },
};

/**
 * Relê o preço no servidor. É a única fonte do valor: nem o `data-price` do botão, nem um
 * argumento do chamador, nem o localStorage decidem quanto se paga. O servidor tem de
 * confirmar outra vez (RLS + create-order), mas o frontend deixa de oferecer o valor errado
 * a um atacante que adultere o DOM.
 */
async function resolvePrice(kind, targetId) {
  const spec = PRICE_TABLE[kind];
  if (!spec) return null;                       // gorjeta/carregamento: o valor é do utilizador
  if (!targetId) throw new Error('Falta o alvo da compra.');
  const { data, error } = await sb.from(spec.table).select(spec.cols).eq('id', targetId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Este conteúdo já não existe.');
  // Bloqueios de estado: comprar uma publicação de rascunho ou o bilhete de uma live terminada
  // pagava-se na mesma, com o dinheiro entregue e nada entregue.
  if (kind === 'subscription' && data.status !== 'approved') throw new Error('Este perfil não está disponível para subscrição.');
  if (kind === 'post' && data.status !== 'published') throw new Error('Esta publicação não está disponível.');
  if (kind === 'message' && !data.ppv_price) throw new Error('Este conteúdo já não está à venda.');
  if (kind === 'ticket' && (data.status === 'ended' || !data.price)) throw new Error('Esta live já não está disponível.');
  const price = Number(kind === 'message' ? data.ppv_price : data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('O preço deste conteúdo não está disponível.');
  return { price: Math.round(price), label: kind === 'subscription' ? (data.profile?.name || data.profile?.handle) : null };
}

/** Teto de segurança para valores escolhidos pelo utilizador (gorjeta / carregamento). */
const MAX_FREE_AMOUNT = 2_000_000;

/**
 * Abre o pagamento.
 * o = { kind, target_id, amount (só gorjeta e carregamento), title, sub, meta, recurring, onPaid }
 *
 * `amount` só é respeitado em 'tip' e 'topup' — os valores que o próprio utilizador escolhe.
 * Em subscrição, publicação, mensagem e bilhete o preço vem sempre da base de dados.
 */
export async function openPay(o) {
  if (!S.me) return toast('Entra na tua conta para pagar.');
  const bal = Number(S.me?.wallet_balance || 0);
  let amount = o.amount;
  try {
    if (PRICE_TABLE[o.kind]) {
      const r = await resolvePrice(o.kind, o.target_id);
      amount = r.price;
      // Se o preço do servidor for diferente do que estava no ecrã, o que vale é o do servidor.
      if (o.amount != null && Number(o.amount) !== amount) console.warn(`Preço de ${o.kind} corrigido: ${o.amount} → ${amount}`);
    } else {
      amount = Number(o.amount);
      const min = o.kind === 'tip' ? Number(S.cfg.min_tip) : Number(S.cfg.min_topup);
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < (min || 1) || amount > MAX_FREE_AMOUNT) {
        return toast(`O valor tem de ser um número inteiro entre ${kz(min || 1)} e ${kz(MAX_FREE_AMOUNT)}.`);
      }
    }
  } catch (e) {
    return toast(errText(e));
  }
  P = { ...o, amount, method: o.kind !== 'topup' && bal >= amount ? 'wallet' : 'mcx', stage: 'form' };
  draw();
}

/** Câmbio para o PayPal. Com usd_rate a 0 ou em falta (definições ainda não carregadas) a
 *  divisão dava Infinity e o botão mostrava "≈ Infinity USD". */
const usdOf = (kzAmount) => {
  const rate = Number(S.cfg.usd_rate) || 0;
  if (!rate) return '—';
  return (Number(kzAmount || 0) / rate).toFixed(2) + ' USD';
};

function draw() {
  const p = P; if (!p) return;
  const bal = Number(S.me?.wallet_balance || 0);
  if (p.stage === 'wait') {
    return modal(`<h3>À espera da confirmação</h3><div class="spin" aria-hidden="true"></div>
      <p class="muted" style="text-align:center">${p.method === 'mcx' ? `Abre a app Multicaixa Express no telemóvel <b>${esc(p.phone)}</b> e aprova o pagamento de <b>${kz(p.amount)}</b>.` : 'A confirmar o pagamento.'}</p>
      <p class="small muted" style="text-align:center">Esta janela atualiza-se sozinha.</p>
      <button class="btn out block" data-act="payCancel">Fechar</button>`, { noClose: true });
  }
  if (p.stage === 'reference') {
    return modal(`<h3>Paga com esta referência</h3>
      <p class="small muted">No ATM, no Multicaixa Express ou no internet banking: Pagamentos › Pagamentos por referência.</p>
      <div class="refbox"><span class="muted">Entidade</span><b>${esc(p.ref.entity)}</b><span class="muted">Referência</span><b>${esc(String(p.ref.reference).replace(/(\d{3})(?=\d)/g, '$1 '))}</b><span class="muted">Valor</span><b>${kz(p.ref.amount)}</b></div>
      <p class="small muted">Válida até ${esc(p.ref.expires)}. Confirmamos automaticamente assim que pagares; podes fechar esta janela.</p>
      <div class="row"><button class="btn out" style="flex:1" data-act="copyRef">${ic('copy')}Copiar referência</button><button class="btn pri" style="flex:1" data-act="payCancel">Fechar</button></div>`);
  }
  if (p.stage === 'ok') {
    return modal(`<div class="okmark">${ic('check')}</div><h3 style="text-align:center">Pagamento confirmado</h3>
      <p class="muted" style="text-align:center">${esc(p.okText || 'Obrigado!')}</p><button class="btn pri block" data-act="closeModal">Fechar</button>`);
  }
  const needsAmount = p.amount == null;
  const methods = METHODS.filter(([m]) => !(m === 'wallet' && p.kind === 'topup'));
  modal(`<div><h3>${esc(p.title)}</h3>${p.sub ? `<p class="small muted" style="margin-top:4px">${esc(p.sub)}</p>` : ''}</div>
   ${needsAmount ? '' : `<div class="sumline"><span>Total</span><b style="color:var(--ink);font-size:18px" class="num">${kz(p.amount)}${p.recurring ? '<span class="small muted" style="font-weight:500">/mês</span>' : ''}</b></div>`}
   <form id="payForm" class="stack" novalidate>
    <div class="stack" style="gap:8px" role="radiogroup" aria-label="Método de pagamento">${methods.map(([v, l, i]) => `<label class="opt"><input type="radio" name="pm" value="${v}" ${p.method === v ? 'checked' : ''}><span style="flex:1"><b>${l}</b><span>${v === 'wallet' ? 'Disponível: ' + kz(bal) : v === 'mcx' ? 'Aprovas na app do telemóvel' : v === 'reference' ? 'Pagas no ATM ou no internet banking' : `Cobrado em dólares (≈ ${usdOf(p.amount)})`}</span></span>${ic(i === 'phone' && v === 'wallet' ? 'wallet' : i, 'style="color:var(--muted)"')}</label>`).join('')}</div>
    ${p.method === 'mcx' ? `<div class="field"><label for="payPhone">Número Multicaixa Express</label><input id="payPhone" inputmode="numeric" autocomplete="tel" placeholder="9XX XXX XXX" value="${esc(p.phone || '')}"></div>` : ''}
    ${p.method === 'wallet' && bal < (p.amount || 0) ? `<div class="aside">${ic('info')}<span>Saldo insuficiente. <a href="#carteira" data-act="closeModal">Carrega a carteira</a> ou escolhe outro método.</span></div>` : ''}
    <span class="err" id="payErr" hidden></span>
    <button class="btn pri block lg" id="payBtn">${p.method === 'reference' ? 'Gerar referência' : p.method === 'paypal' ? 'Continuar para o PayPal' : 'Pagar ' + kz(p.amount)}</button>
    <p class="small muted" style="text-align:center">${p.recurring ? 'Renova todos os meses com o saldo da carteira. Podes cancelar em Subscrições.' : 'Pagamento único.'}</p>
   </form>`);
}

async function submit() {
  const p = P, btn = $('#payBtn');
  const err = (m) => { const e = $('#payErr'); e.hidden = false; e.textContent = m; };
  if (p.method === 'mcx') {
    const v = ($('#payPhone')?.value || '').replace(/\D/g, '').replace(/^244/, '');
    if (!/^9\d{8}$/.test(v)) return err('Escreve um número angolano com 9 dígitos, a começar por 9.');
    p.phone = v.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'); p.phoneRaw = v;
  }
  busy(btn, true, 'A processar…');
  try {
    if (p.method === 'wallet') {
      const { data, error } = await sb.rpc('pay_with_wallet', { p_kind: p.kind, p_target: p.target_id ?? null, p_amount: p.amount ?? null, p_meta: p.meta || {} });
      if (error) throw error;
      p.orderId = data; return done();
    }
    const res = await fn('create-order', { kind: p.kind, target_id: p.target_id ?? null, amount: p.amount ?? null, method: p.method, phone: p.phoneRaw, meta: p.meta || {} });
    p.orderId = res.order_id;
    if (p.method === 'paypal') {
      try { sessionStorage.setItem('apf-pp', JSON.stringify({ id: res.order_id, okText: p.okText, back: location.hash })); } catch { /* ignorar */ }
      location.href = res.approve_url; return;
    }
    watch(p.orderId);
    if (p.method === 'reference') { p.ref = res; p.stage = 'reference'; }
    else { p.stage = 'wait'; }
    draw();
  } catch (e) {
    busy(btn, false); err(errText(e));
  }
}

async function done() {
  const p = P; if (!p) return;
  p.stage = 'ok'; draw();
  await refreshMe();
  try { await p.onPaid?.(); } catch (e) { console.error(e); }
  document.dispatchEvent(new CustomEvent('apf:paid'));
}

/** Acompanha o pedido em tempo real (e por verificação periódica como reserva). */
function watch(orderId) {
  stopWatcher(orderId);
  const ch = sb.channel('order-' + orderId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (x) => onStatus(orderId, x.new.status))
    .subscribe();
  const t = setInterval(async () => {
    const { data } = await sb.from('orders').select('status').eq('id', orderId).maybeSingle();
    if (data) onStatus(orderId, data.status);
  }, 6000);
  const stop = () => { clearInterval(t); clearTimeout(timer); sb.removeChannel(ch); };
  const timer = setTimeout(stop, 30 * 60 * 1000);
  watchers.set(orderId, stop);
}
const watchers = new Map();
function stopWatcher(orderId) { watchers.get(orderId)?.(); watchers.delete(orderId); }
/** Fecha todos os vigilantes. Chamado ao sair da conta e ao trocar de página: sem isto, cada
 *  compra abandonada deixava um canal do Realtime e uma consulta a cada 6 s durante 30 minutos. */
export function stopAllWatchers() { for (const id of [...watchers.keys()]) stopWatcher(id); }
function onStatus(orderId, status) {
  if (status === 'pending') return;
  stopWatcher(orderId);
  const mine = P && P.orderId === orderId;
  if (status === 'paid') {
    if (mine && $('#modalRoot').innerHTML) return done();
    refreshMe().then(() => document.dispatchEvent(new CustomEvent('apf:paid')));
    toast('Pagamento confirmado');
  } else if (mine && P.stage === 'wait') {
    modal(`<h3>Pagamento não concluído</h3><p class="muted">${status === 'failed' ? 'O pagamento foi recusado ou cancelado na app.' : 'O pedido expirou.'} Podes tentar outra vez.</p><button class="btn pri block" data-act="payRetry">Tentar outra vez</button>`);
  }
}

/** Ao voltar do PayPal (?pp=<pedido>) */
export async function handlePaypalReturn() {
  const u = new URL(location.href);
  const id = u.searchParams.get('pp'), cancel = u.searchParams.get('pp_cancel');
  if (!id && !cancel) return;
  let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('apf-pp') || '{}'); sessionStorage.removeItem('apf-pp'); } catch { /* */ }
  history.replaceState(null, '', location.pathname + (saved.back || location.hash || ''));
  if (cancel) { toast('Pagamento com PayPal cancelado'); return; }
  modal(`<h3>A confirmar com o PayPal</h3><div class="spin"></div>`, { noClose: true });
  try {
    const r = await fn('paypal-capture', { order_id: id });
    if (r.status === 'paid') {
      await refreshMe();
      modal(`<div class="okmark">${ic('check')}</div><h3 style="text-align:center">Pagamento confirmado</h3><p class="muted" style="text-align:center">${esc(saved.okText || 'Obrigado!')}</p><button class="btn pri block" data-act="closeModal">Fechar</button>`);
      document.dispatchEvent(new CustomEvent('apf:paid'));
    } else { closeModal(); toast('O PayPal ainda está a processar. Avisamos quando ficar confirmado.'); watch(id); }
  } catch (e) { closeModal(); toast(errText(e)); }
}

export const payActions = {
  payCancel() { closeModal(); P = null; },
  payRetry() { if (P) { P.stage = 'form'; draw(); } },
  copyRef() { if (P?.ref) copyText(String(P.ref.reference)); },
};
export function payChange(t) {
  if (t.name === 'pm' && P) { const ph = $('#payPhone'); if (ph) P.phone = ph.value; P.method = t.value; draw(); return true; }
  return false;
}
export function paySubmit(f) { if (f.id === 'payForm') { submit(); return true; } return false; }

// Pagamentos (camada de apresentação): o ecrã de pagamento e o acompanhamento do pedido.
//
// Preço, métodos disponíveis, validação do telefone e o arranque de cada método vivem no caso
// de uso `Pagamentos` (src/application/commerce): uma estratégia por método (Strategy) e um
// seguimento de pedidos por eventos (Observer). Aqui só se desenha e se reage.
import { $, esc, kz, ic, modal, closeModal, toast, errText, busy, copyText } from './lib';
import { register } from './registry';
import { S, refreshMe, cfgReady } from './state';
import { pagamentos } from '../infrastructure/composicao/pagamentos';
import { metodoInicial, type MetodoPagamento as Method, type PayKind } from '../domain/commerce/purchase.ts';
import { emDolares } from '../domain/shared/money.ts';
import type { Referencia } from '../application/commerce/ports.ts';

/**
 * O que o chamador passa a `openPay`.
 *
 * NOTA sobre `Omit`: não dá para escrever `Omit<Paying, 'method'|'stage'>`.
 * `Paying` tem um index signature (`[k: string]: any`), o que faz `keyof Paying`
 * virar `string | number`; ao excluir `'method' | 'stage'` de `string | number`
 * não sobra nada, e o `Omit` degrada para `{ [x: string]: any }` — sem exigir
 * `kind`. O compilador deixava passar chamadas sem `kind`. Por isso o tipo é
 * escrito à mão.
 */
export type OpenPayOpts = {
  kind: PayKind;
  target_id?: string | null;
  /** Só é respeitado em 'tip' e 'topup'. Nos restantes, o preço vem da base de dados. */
  amount?: number | null;
  title?: string;
  sub?: string;
  meta?: Record<string, unknown>;
  recurring?: boolean;
  onPaid?: () => void | Promise<void>;
  okText?: string;
  [k: string]: unknown;
};

/** O pagamento em curso. Só há um de cada vez — abrir outro substitui este. */
type Paying = OpenPayOpts & {
  amount?: number | null;
  method: Method;
  stage: 'form' | 'wait' | 'reference' | 'ok';
  phone?: string;
  orderId?: string;
  ref?: Referencia;
};

let P: Paying | null = null;

/** Nome e ícone de cada método no ecrã. A lista de métodos disponíveis vem do caso de uso. */
const METODO_UI: Record<Method, [string, string]> = {
  wallet: ['Saldo da carteira', 'wallet'],
  mcx: ['Multicaixa Express', 'phone'],
  reference: ['Referência Multicaixa', 'bank'],
  paypal: ['PayPal ou cartão internacional', 'card'],
};

/**
 * Abre o pagamento.
 * o = { kind, target_id, amount (só gorjeta e carregamento), title, sub, meta, recurring, onPaid }
 *
 * `amount` só é respeitado em 'tip' e 'topup' — os valores que o próprio utilizador escolhe.
 * Em subscrição, publicação, mensagem e bilhete o preço vem sempre da base de dados.
 */
export async function openPay(o: OpenPayOpts): Promise<void> {
  if (!S.me) return toast('Entra na tua conta para pagar.');
  const bal = Number(S.me?.wallet_balance || 0);
  let amount: number;
  try {
    await cfgReady(); // os mínimos de gorjeta/carregamento vêm das definições
    // O preço vem sempre do catálogo (base de dados); o do ecrã é ignorado.
    amount = await pagamentos().cotar(o.kind, o.target_id, o.amount, S.cfg);
  } catch (e) {
    return toast(errText(e));
  }
  P = { ...o, amount, method: metodoInicial(o.kind, bal, amount), stage: 'form' };
  draw();
}

/** Câmbio para o PayPal. Com usd_rate a 0 ou em falta (definições ainda não carregadas) a
 *  divisão dava Infinity e o botão mostrava "≈ Infinity USD". */
const usdOf = (kzAmount: number | null | undefined): string => {
  const usd = emDolares(Number(kzAmount || 0), Number(S.cfg.usd_rate));
  return usd === null ? '—' : usd.toFixed(2) + ' USD';
};

function draw(): void {
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
      <div class="refbox"><span class="muted">Entidade</span><b>${esc(p.ref!.entity)}</b><span class="muted">Referência</span><b>${esc(String(p.ref!.reference).replace(/(\d{3})(?=\d)/g, '$1 '))}</b><span class="muted">Valor</span><b>${kz(p.ref!.amount)}</b></div>
      <p class="small muted">Válida até ${esc(p.ref!.expires)}. Confirmamos automaticamente assim que pagares; podes fechar esta janela.</p>
      <div class="row"><button class="btn out" style="flex:1" data-act="copyRef">${ic('copy')}Copiar referência</button><button class="btn pri" style="flex:1" data-act="payCancel">Fechar</button></div>`);
  }

  if (p.stage === 'ok') {
    return modal(`<div class="okmark">${ic('check')}</div><h3 style="text-align:center">Pagamento confirmado</h3>
      <p class="muted" style="text-align:center">${esc(p.okText || 'Obrigado!')}</p><button class="btn pri block" data-act="closeModal">Fechar</button>`);
  }

  const needsAmount = p.amount == null;
  const methods = pagamentos().metodos(p.kind).map((m) => [m, ...METODO_UI[m]] as const);
  modal(`<div><h3>${esc(p.title || '')}</h3>${p.sub ? `<p class="small muted" style="margin-top:4px">${esc(p.sub)}</p>` : ''}</div>
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

async function submit(): Promise<void> {
  const p = P; if (!p) return;
  const btn = $<HTMLButtonElement>('#payBtn');
  const err = (m: string) => {
    const e = $('#payErr');
    if (e) { e.hidden = false; e.textContent = m; }
  };

  const telefone = p.method === 'mcx' ? ($<HTMLInputElement>('#payPhone')?.value || '') : undefined;
  busy(btn, true, 'A processar…');
  try {
    const r = await pagamentos().iniciar(p.method, {
      kind: p.kind, target_id: p.target_id ?? null, amount: p.amount ?? null, meta: p.meta || {}, telefone,
    });
    p.orderId = r.orderId;
    if (telefone) p.phone = telefone.replace(/\D/g, '').replace(/^244/, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    switch (r.tipo) {
      case 'pago': return done();
      case 'redirecionar':
        try {
          sessionStorage.setItem('apf-pp', JSON.stringify({ id: r.orderId, okText: p.okText, back: location.hash }));
        } catch { /* modo privado */ }
        location.href = r.url;
        return;
      case 'referencia': p.ref = r.ref; p.stage = 'reference'; break;
      case 'aguardar': p.stage = 'wait'; break;
    }
    watch(r.orderId);
    draw();
  } catch (e) {
    busy(btn, false);
    err(errText(e));
  }
}

async function done(): Promise<void> {
  const p = P; if (!p) return;
  p.stage = 'ok';
  draw();
  await refreshMe();
  try { await p.onPaid?.(); } catch (e) { console.error(e); }
  document.dispatchEvent(new CustomEvent('apf:paid'));
}

/** Vigilantes de pedido, por id. Cada um segura um canal do Realtime e uma consulta
 *  periódica; sem isto, cada compra abandonada deixava os dois a correr durante 30 minutos. */
const watchers = new Map<string, () => void>();

/** Acompanha o pedido em tempo real (e por verificação periódica como reserva). */
function watch(orderId: string): void {
  stopWatcher(orderId);
  watchers.set(orderId, pagamentos().observar(orderId, (estado) => onStatus(orderId, estado)));
}

function stopWatcher(orderId: string): void {
  watchers.get(orderId)?.();
  watchers.delete(orderId);
}

/** Fecha todos os vigilantes. Chamado ao sair da conta e ao trocar de página. */
export function stopAllWatchers(): void {
  for (const id of [...watchers.keys()]) stopWatcher(id);
}

function onStatus(orderId: string, status: string): void {
  if (status === 'pending') return;
  stopWatcher(orderId);
  const mine = P && P.orderId === orderId;
  if (status === 'paid') {
    if (mine && $('#modalRoot')!.innerHTML) { void done(); return; }
    void refreshMe().then(() => document.dispatchEvent(new CustomEvent('apf:paid')));
    toast('Pagamento confirmado');
  } else if (mine && P!.stage === 'wait') {
    modal(`<h3>Pagamento não concluído</h3><p class="muted">${status === 'failed' ? 'O pagamento foi recusado ou cancelado na app.' : 'O pedido expirou.'} Podes tentar outra vez.</p><button class="btn pri block" data-act="payRetry">Tentar outra vez</button>`);
  }
}

/** Ao voltar do PayPal (?pp=<pedido>) */
export async function handlePaypalReturn(): Promise<void> {
  const u = new URL(location.href);
  const id = u.searchParams.get('pp'), cancel = u.searchParams.get('pp_cancel');
  if (!id && !cancel) return;
  if (cancel) {
    // Só o cancelamento: há um `pp` no URL mas o utilizador voltou para trás.
    let savedBack: { back?: string } = {};
    try {
      savedBack = JSON.parse(sessionStorage.getItem('apf-pp') || '{}');
      sessionStorage.removeItem('apf-pp');
    } catch { /* modo privado */ }
    history.replaceState(null, '', location.pathname + (savedBack.back || location.hash || ''));
    toast('Pagamento com PayPal cancelado');
    return;
  }
  let saved: { okText?: string; back?: string } = {};
  try {
    saved = JSON.parse(sessionStorage.getItem('apf-pp') || '{}');
    sessionStorage.removeItem('apf-pp');
  } catch { /* modo privado */ }
  history.replaceState(null, '', location.pathname + (saved.back || location.hash || ''));
  modal(`<h3>A confirmar com o PayPal</h3><div class="spin"></div>`, { noClose: true });
  try {
    const estado = await pagamentos().capturarPaypal(id!);
    if (estado === 'paid') {
      await refreshMe();
      modal(`<div class="okmark">${ic('check')}</div><h3 style="text-align:center">Pagamento confirmado</h3><p class="muted" style="text-align:center">${esc(saved.okText || 'Obrigado!')}</p><button class="btn pri block" data-act="closeModal">Fechar</button>`);
      document.dispatchEvent(new CustomEvent('apf:paid'));
    } else {
      closeModal();
      toast('O PayPal ainda está a processar. Avisamos quando ficar confirmado.');
      // `id` só existe se foi guardado no regresso. Sem ele não há nada para
      // vigiar, e chamar `watch(null)` deixaria um `setInterval` a consultar
      // uma ordem inexistente para sempre.
      if (id) watch(id);
    }
  } catch (e) {
    closeModal();
    toast(errText(e));
  }
}

export const payActions = {
  payCancel() { closeModal(); P = null; },
  payRetry() { if (P) { P.stage = 'form'; draw(); } },
  copyRef() { if (P?.ref) void copyText(String(P.ref.reference)); },
};

export function payChange(t: HTMLInputElement): boolean {
  if (t.name === 'pm' && P) {
    const ph = $<HTMLInputElement>('#payPhone');
    if (ph) P.phone = ph.value;
    P.method = t.value as Method;
    draw();
    return true;
  }
  return false;
}

export function paySubmit(f: HTMLFormElement): boolean {
  if (f.id === 'payForm') { void submit(); return true; }
  return false;
}

register({ actions: payActions, submit: paySubmit, change: (t) => payChange(t as HTMLInputElement) });

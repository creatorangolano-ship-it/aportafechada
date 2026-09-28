/**
 * Registo de comandos da interface (padrões Command + Chain of Responsibility).
 *
 * Cada área da app (vistas públicas, fã, estúdio, mensagens, lives, conta,
 * administração, pagamentos) é um módulo carregado só quando é precisa. Ao ser
 * avaliado, o módulo regista aqui os seus comandos (`data-act`) e os seus
 * handlers de formulário. Os despachantes globais em `main.ts` só conhecem este
 * registo — não importam nenhuma vista, e é isso que permite dividir o código
 * por rota.
 *
 * - `actions`: um Command por nome de `data-act`.
 * - `submit` / `change` / `input`: cadeias de responsabilidade — cada handler
 *   devolve `true` quando tratou do evento, e o seguinte já não é chamado.
 */
import type { Actions, ChangeFn, SubmitFn } from './types';

export type InputFn = (t: HTMLInputElement) => boolean | void;
export type Modulo = { actions?: Actions; submit?: SubmitFn; change?: ChangeFn; input?: InputFn };

const actions: Actions = {};
const submits: SubmitFn[] = [];
const changes: ChangeFn[] = [];
const inputs: InputFn[] = [];

export function register(m: Modulo): void {
  if (m.actions) Object.assign(actions, m.actions);
  if (m.submit && !submits.includes(m.submit)) submits.push(m.submit);
  if (m.change && !changes.includes(m.change)) changes.push(m.change);
  if (m.input && !inputs.includes(m.input)) inputs.push(m.input);
}

export const action = (nome: string) => actions[nome];

export async function handleSubmit(f: HTMLFormElement): Promise<boolean> {
  for (const h of submits) if (await h(f)) return true;
  return false;
}
export async function handleChange(t: Parameters<ChangeFn>[0]): Promise<boolean> {
  for (const h of changes) if (await h(t)) return true;
  return false;
}
export function handleInput(t: HTMLInputElement): boolean {
  for (const h of inputs) if (h(t)) return true;
  return false;
}

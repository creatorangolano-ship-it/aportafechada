/**
 * Carregadores das áreas da app (import dinâmico = um ficheiro JS por área).
 *
 * Quem abre a página de entrada descarrega só a área pública; o estúdio, as
 * lives, a administração e o resto chegam quando a pessoa lá vai. O `import()`
 * guarda o módulo em cache, por isso chamar um carregador duas vezes não volta a
 * descarregar nada.
 */
export const modulos = {
  public: () => import('./views/public'),
  fan: () => import('./views/fan'),
  messages: () => import('./views/messages'),
  lives: () => import('./views/lives'),
  studio: () => import('./views/studio'),
  account: () => import('./views/account'),
  admin: () => import('./views/admin'),
  pay: () => import('./pay'),
};

/** Carrega todas as áreas — só para o caso raro de um comando pertencer a uma área ainda não carregada. */
export const carregarTodos = () => Promise.all(Object.values(modulos).map((f) => f()));

/** Pré-carrega áreas em segundo plano, quando o browser está desocupado, para a navegação seguinte ser imediata. */
export function preCarregar(nomes: Array<keyof typeof modulos>): void {
  const agora = () => nomes.forEach((n) => { void modulos[n]().catch(() => {}); });
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(agora, { timeout: 4000 });
  else setTimeout(agora, 1500);
}

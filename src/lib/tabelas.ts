/**
 * Tabelas adaptativas.
 *
 * No computador as tabelas ficam como estão. No telemóvel (CSS em globals.css,
 * «Tabelas no telemóvel») cada linha passa a ser um cartão, sem deslocação
 * horizontal: a primeira coluna é o título do cartão, cada dado aparece como
 * «Etiqueta …… valor» e a última coluna sem título (os botões) fica em baixo.
 *
 * Este módulo só prepara o HTML para isso: copia o título de cada coluna para
 * `data-label` nas células e marca o papel de cada uma. Corre sozinho sempre
 * que aparecem tabelas novas (MutationObserver), por isso nenhuma vista precisa
 * de saber disto — qualquer tabela nova já sai adaptada.
 */

function rotular(tabela: HTMLTableElement): void {
  const titulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent?.trim() || '');
  const ultima = titulos.length - 1;
  for (const tr of tabela.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
    [...tr.cells].forEach((td, i) => {
      td.dataset.label = titulos[i] ?? '';
      td.classList.toggle('tc-titulo', i === 0);
      // Última coluna sem título = acções (botões).
      td.classList.toggle('tc-acoes', i === ultima && i > 0 && !titulos[i]);
      // Célula sem nada dentro (ex.: acções de um pedido já tratado): some no cartão.
      td.classList.toggle('tc-vazia', !td.textContent?.trim() && !td.querySelector('img,video,button,a,select,input'));
    });
  }
  tabela.classList.add('tabela-adaptativa');
}

export function rotularTabelas(raiz: ParentNode = document): void {
  raiz.querySelectorAll<HTMLTableElement>('table').forEach(rotular);
}

/** Liga a adaptação a tudo o que for desenhado dentro de `raiz` (a app e os modais). */
export function observarTabelas(raiz: HTMLElement): void {
  rotularTabelas(raiz);
  let pendente = false;
  new MutationObserver(() => {
    if (pendente) return;
    pendente = true;
    queueMicrotask(() => { pendente = false; rotularTabelas(raiz); });
  }).observe(raiz, { childList: true, subtree: true });
}

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A aplicação toda.
 *
 * O `div#app` que o roteador escreve (`lib/main.ts` faz `app.innerHTML = h`) é
 * controlado pelo React apenas como contentor vazio — o React nunca volta a
 * tocar nos filhos, porque esta página não volta a renderizar depois do primeiro
 * `useEffect`. A vista em si é desenhada pelo roteador, como antes da migração.
 *
 * Isto é o que mantém a migração fiel: nada da lógica de renderização mudou,
 * o que mudou foi o que a envolve — types em todo o lado, e o servidor (as API
 * routes em /api) a passar a viver neste repositório em vez de só no painel do
 * Supabase.
 *
 * O `import()` é dinâmico, e isso é uma exigência e não um gosto. `main.ts`
 * regista os listeners em `document` ao nível do módulo; com um `import`
 * estático, o Next avalia-o também durante o pré-render de `/` no servidor, onde
 * não existe `document`, e o build morre com `ReferenceError: document is not
 * defined`. Carregando-o só dentro do `useEffect`, o módulo nunca é avaliado
 * fora do browser — e, de passagem, `lib/main.ts` deixa de entrar no pacote do
 * servidor, onde não tinha uso nenhum.
 */
export default function Page() {
  const ref = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<Error | null>(null);

  useEffect(() => {
    // Sem isto, o React StrictMode em desenvolvimento chama o efeito duas vezes
    // e a app arrancava em duplicado: dois listeners de clique, dois canais de
    // realtime, duas chamadas a `loadMe`. O boot é idempotente por si só, mas
    // não vale a pena deixar o duplo a acontecer para depois o desligar à mão.
    let vivo = true;
    void import('@/lib/main')
      .then((m) => m.boot())
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e : new Error(String(e))); });
    return () => { vivo = false; };
  }, []);

  if (erro) {
    return (
      <main className="wrap">
        <div className="empty">
          <h2>A aplicação não arrancou</h2>
          <p style={{ marginTop: 8 }}>{erro.message}</p>
          <button className="btn out" style={{ marginTop: 14 }} onClick={() => location.reload()}>
            Recarregar
          </button>
        </div>
      </main>
    );
  }

  return <main className="wrap" id="app" ref={ref}><p className="skel">A carregar…</p></main>;
}

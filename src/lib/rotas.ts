/**
 * Nomes de rotas conhecidos sem carregar nenhuma vista.
 *
 * O roteador precisa de saber, antes de descarregar o código de uma página, se
 * ela é pública ou uma página informativa. Estas listas viviam em `views/public`,
 * o que obrigava a descarregar essa área inteira só para as ler.
 */
export const INFO = ['sobre', 'funciona', 'faq', 'regras', 'termos', 'privacidade', 'dmca', 'contacto', 'afiliados', 'blog'];
export const PUBLIC: string[] = ['inicio', 'registar', 'confirmar', 'nova-senha', 'top', ...INFO];

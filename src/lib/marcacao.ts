/**
 * Marcação pura (texto HTML), sem DOM nem Supabase: usa-a o browser (via `lib.ts`)
 * e também o servidor, que desenha a página de registo antes de o JavaScript chegar.
 */

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/* ---------- Ícones ---------- */

const I: Record<string, string> = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  img: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3Z"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.3c-.6-1-1.7-1.5-3-1.5-1.8 0-3 .9-3 2.2 0 3.3 6 1.6 6 4.8 0 1.3-1.3 2.3-3 2.3-1.4 0-2.6-.6-3.2-1.6M12 6v1.8M12 16.8V18"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.3-9.4C1.5 7.3 3.6 4 7 4c2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 3.4 0 5.5 3.3 4.3 6.6C19.5 15.4 12 20 12 20Z"/>',
  share: '<path d="M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21V3Z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  badge: '<path d="M12 2.5 14.6 5l3.5-.3.6 3.5 3 1.9-1.6 3.1 1.6 3.1-3 1.9-.6 3.5-3.5-.3L12 23.5 9.4 21l-3.5.3-.6-3.5-3-1.9 1.6-3.1-1.6-3.1 3-1.9.6-3.5 3.5.3Z" fill="currentColor" stroke="none"/><path d="m8 12.5 2.8 2.7L16.5 9.5" stroke="#fff"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8v13M12 8c-1.5-3.5-5.5-4-5.5-1.5S12 8 12 8Zm0 0c1.5-3.5 5.5-4 5.5-1.5S12 8 12 8Z"/>',
  send: '<path d="m21 3-9.5 18-2-8-7.5-2.5L21 3Z"/><path d="m21 3-11.5 10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16.5" height="12" rx="2"/><path d="M16 14h4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9.5h19M6 15h4"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 5.7l2.1 2.1M17.7 16.2l2.1 2.1M2.5 12h3M18.5 12h3M4.2 18.3l2.1-2.1M17.7 7.8l2.1-2.1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  // Transmissão ao vivo: um ponto com ondas de sinal dos dois lados.
  live: '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
  play: '<path d="M7 4.5v15l13-7.5L7 4.5Z" fill="currentColor"/>',
  volume: '<path d="M4 9.5v5h4l5 4v-13l-5 4H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  expand: '<path d="M4 9V4.5h4.5M20 9V4.5h-4.5M4 15v4.5h4.5M20 15v4.5h-4.5"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6.5" width="3" height="11" rx="1"/><rect x="15.5" y="3.5" width="3" height="14" rx="1"/>',
  // Selo da conta oficial da gestão: escudo cheio com visto (o dos criadores é a roseta «badge»).
  escudo: '<path d="M12 2.5 3.8 5.8v6.1c0 5 3.5 8.6 8.2 10 4.7-1.4 8.2-5 8.2-10V5.8L12 2.5Z" fill="currentColor" stroke="none"/><path d="m8.3 12.2 2.6 2.5 4.9-5" stroke="#fff" stroke-width="2.2"/>',
};
export const ic = (n: string, x = ''): string =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${x}>${I[n] || ''}</svg>`;

export const GOOGLE =
  '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

export const LOGO = (w = 26, h = 32): string =>
  // Ícone oficial (identidade 2026-11): porta em perspectiva, batente, fechadura e sombra no chão.
  `<svg width="${w}" height="${h}" viewBox="4 8 112 130" aria-hidden="true"><g style="fill:var(--acc)"><polygon points="8,125 112,134 88,122 25,122"/><polygon points="25,28 82,12 82,122 25,122"/><polygon points="85,12 90,15 90,122 85,122"/></g><g fill="#fff"><circle cx="67" cy="72" r="4.5"/><polygon points="65,75 69,75 70.5,87 63.5,87"/></g></svg>`;

// Echappement (spec §3.2, util/escape.ts). Deux fonctions distinctes et non interchangeables :
// l'apostrophe devient &#39; en HTML et &apos; en XML, et le SVG exporte doit rester du XML valide.

export function escapeHtml(str: unknown): string {
  return String(str).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[ch] as string
  );
}

export function escapeXml(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

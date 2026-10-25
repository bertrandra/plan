// Les statistiques simples qu'on recopiait de module en module (audit d'architecture, 25 octobre 2026). Pur, sans toucher aux
// tableaux recus. Les variantes qui ne disent pas la meme chose gardent leur nom : la mediane haute (l'element du milieu sans
// moyenne, facade/detection/detectionCartes.ts) et la mediane qui trie sur place (facade/fusion.ts).

/** La mediane : l'element du milieu, la moyenne des deux du milieu pour un nombre pair ; `vide` pour une liste vide. */
export function mediane(v: readonly number[], vide = 0): number {
  if (!v.length) return vide;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

// L'intention de la personne dans le mode Toit : elle MODIFIE ce qui existe, ou elle AJOUTE un element (retour du proprietaire,
// 24 novembre 2026 : « on ne sait pas ce qui modifie et ce qui cree »). Le panneau du mode ne montre que les gestes de l'intention
// choisie : les formes de toit, les reglages et les gestes d'un cote, le catalogue des pieces a poser de l'autre.
//
// Un etat d'interface, pas un etat du projet : ni Ctrl+Z, ni « projet modifie », rien d'enregistre. Une session s'ouvre en
// « modifier » (le coeur du mode, decision du 4 novembre 2026), sauf par « Ajouter a la maison » ; une piece posee ramene a
// « modifier », sur elle : on regle ce qu'on vient d'ajouter.

export type IntentionToit = 'modifier' | 'ajouter';

let intention: IntentionToit = 'modifier';
const abonnes = new Set<() => void>();

export const intentionToit = (): IntentionToit => intention;

export function poserIntentionToit(i: IntentionToit): void {
  if (i === intention) return;
  intention = i;
  for (const f of [...abonnes]) f();
}

export function abonnerIntentionToit(f: () => void): () => void {
  abonnes.add(f);
  return () => { abonnes.delete(f); };
}

export const estIntentionToit = (v: unknown): v is IntentionToit => v === 'modifier' || v === 'ajouter';

/** Les mots de chaque intention, dits partout de la meme facon (le commutateur, l'indicateur d'etat, l'entree sur la scene). */
export const MOTS_INTENTION: Record<IntentionToit, { verbe: string; promesse: string }> = {
  modifier: { verbe: 'Modifier', promesse: 'rien n’est créé' },
  ajouter: { verbe: 'Ajouter', promesse: 'rien d’existant n’est touché' }
};

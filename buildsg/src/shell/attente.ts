// L'attente : une roue au centre de l'ecran, avec ce qui se passe, pendant un travail long que la
// personne a lance et dont elle attend le resultat — la creation d'un plan depuis une adresse,
// l'actualisation IGN (cadastre, BD TOPO, orthophoto, LiDAR : plusieurs dizaines de secondes).
//
// Chaque travail se declare sous son nom (`source`) avec le texte de son etape, et se retire a la
// fin : deux travaux en meme temps ne s'effacent pas l'un l'autre, le dernier declare se lit. Ce
// module ne dessine rien : la zone des notifications (zones/Attente.tsx) s'y abonne. Il vit dans
// shell/, au niveau zero, comme les notifications : tout le programme peut faire attendre.

export interface EtatAttente {
  /** Le texte de l'etape en cours, ou `null` quand rien n'attend. */
  message: string | null;
}

const travaux = new Map<string, string>();
const abonnes = new Set<() => void>();
let instantane: EtatAttente = { message: null };

function publier(): void {
  const derniers = [...travaux.values()];
  instantane = { message: derniers.length ? (derniers[derniers.length - 1] ?? '') : null };
  abonnes.forEach((f) => f());
}

export const attente = {
  /** Declare (ou met a jour) le travail `source`, avec le texte de son etape ; `null` le retire. */
  poser(source: string, message: string | null): void {
    if (message === null) { if (!travaux.delete(source)) return; }
    else { travaux.delete(source); travaux.set(source, message); }
    publier();
  },
  /** L'etat a dessiner : le meme objet tant que rien ne change (useSyncExternalStore). */
  etat: (): EtatAttente => instantane,
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; },
};

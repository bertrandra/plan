// Les regles du platelage bois sur plots (NF DTU 51.4), partagees par la terrasse et la plage en bois d'une piscine
// (MD/spec-ouvrages.md, etape 6.6). Deplacees sans retouche de engine/constantes.ts, qui les reexporte.

export const PLOT_ENTRAXE_MAX_M = 0.70;   // NF DTU 51.4, appuis sous lambourdes, pose sur 3 appuis ou +
export const PLOT_HAUTEUR_DTU_CM = 30;    // au-dela, le plot reglable sort du domaine du DTU
export const PLOT_HAUTEUR_MAX_CM = 100;   // au-dela, le platelage entier sort du domaine

/** La construction est-elle posee sur plots (plutot que sur vis de fondation) ? */
export function estPlots(c: { typePose?: string }): boolean { return c.typePose === 'plots'; }

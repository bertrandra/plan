// Les mesures des cotes sur le plan (audit UX de la 5.45.0, constat 7) : une preference d'affichage de l'appareil, eteinte par defaut.
//
// Les etiquettes « → -0,62 m · Δ +0,02 m » couvraient la terrasse de la demonstration. Les cotes restent dans le projet, dans
// l'onglet Cotes et dans les exports ; le plan a l'ecran ne les dessine que si la personne le demande (menu Affichage), ou quand elle
// vient d'en poser une. Comme le mode expert (app/modeExpert.ts) : gardee dans le navigateur, ni Ctrl+Z, ni « projet modifie »,
// permise en lecture seule.

interface AvecOptions { options: { mesuresSurLePlan: boolean } }
interface MagasinDesMesures {
  store: { subscribe(f: (s: AvecOptions, avant: AvecOptions) => void): () => void };
  definirOption(cle: 'mesuresSurLePlan', valeur: boolean): void;
}

export const CLE_MESURES_SUR_LE_PLAN = 'plan.mesuresSurLePlan';

/** Lit la preference : eteinte par defaut, et quand le stockage est refuse. */
export function lireMesuresSurLePlan(stockage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): boolean {
  try { return stockage?.getItem(CLE_MESURES_SUR_LE_PLAN) === 'oui'; } catch { return false; }
}

/** Pose la preference lue, puis l'ecrit a chaque bascule. Le plan se redessine par son rendu (la cle des cotes la lit). */
export function brancherMesuresSurLePlan(magasin: MagasinDesMesures, stockage: Pick<Storage, 'getItem' | 'setItem'> | null = globalThis.localStorage ?? null, redessiner?: () => void): () => void {
  magasin.definirOption('mesuresSurLePlan', lireMesuresSurLePlan(stockage));
  return magasin.store.subscribe((s, avant) => {
    if (s.options.mesuresSurLePlan === avant.options.mesuresSurLePlan) return;
    try { stockage?.setItem(CLE_MESURES_SUR_LE_PLAN, s.options.mesuresSurLePlan ? 'oui' : 'non'); } catch { /* preference de session */ }
    redessiner?.();
  });
}

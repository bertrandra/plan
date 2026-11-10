// La demande du mode audit, lue dans l'adresse (MD/spec-audit.md §17).
//
//   ?mode=audit                      la promenade suit le GPS ;
//   ?mode=audit&depart=<adresse>     elle part d'une adresse, la position se deplacant au doigt :
//                                    pour essayer sans sortir, et pour les tests automatiques.
//
// La demande seule ne suffit pas : main.ts ne l'honore que pour un administrateur (app/acces.ts).

export interface DemandeAudit {
  /** L'adresse de depart, ou null pour suivre le GPS. */
  depart: string | null;
}

export function lireDemandeAudit(recherche: string): DemandeAudit | null {
  const p = new URLSearchParams(recherche);
  if (p.get('mode') !== 'audit') return null;
  const depart = (p.get('depart') ?? '').trim();
  return { depart: depart || null };
}

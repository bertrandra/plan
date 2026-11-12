// Ce qui reste a faire a chaque etape du banc, pour les pastilles de l'en-tete (demande du proprietaire, 12 novembre 2026 : « de la
// productivite ») : on voit d'un coup d'oeil ou le travail attend. Sans DOM, testable seul.

import type { MetaImage } from './types.js';

export interface AFaire { redressement: number; validation: number; brouillon: number; catalogue: number; blocs: number; export: number; total: number }

export function aFaire(images: readonly MetaImage[]): AFaire {
  const n = (f: (m: MetaImage) => boolean) => images.filter(f).length;
  return {
    total: n((m) => m.statut !== 'rejetee'),
    redressement: n((m) => m.statut === 'importee'),
    validation: n((m) => m.statut === 'redressee'),
    brouillon: n((m) => m.statut === 'validee'),
    // A relire : un brouillon pas encore corrige, ou une photo corrigee qui garde des objets a qualifier.
    catalogue: n((m) => m.statut === 'brouillon' || (m.statut === 'corrigee' && (m.aQualifier ?? 0) > 0)),
    // A ranger dans un bloc, ou de l'echantillon a verifier.
    blocs: n((m) => m.statut === 'corrigee' && (!m.bloc || (!!m.echantillon && !m.verifiee))),
    export: n((m) => m.statut === 'corrigee' && m.bloc !== 'reserve'),
  };
}

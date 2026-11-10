// Ce que l'ecran de l'audit pose sur la Vue 3D (la prise, les propositions) dit a la camera : ou il
// commence, a chaque changement de taille (une ligne de plus, la liste repliee, l'ecran qui tourne).
// La Vue 3D cadre alors ce qu'il laisse voir (app/audit/parcelle/vuePrise.ts) : au-dessus d'une carte
// posee en bas, a gauche d'un panneau pose a droite.

import { useLayoutEffect, useRef } from 'react';
import type { SessionAuditParcelle } from '../../app/audit/parcelle/controleur.js';

export function useCadrerVue(session: SessionAuditParcelle) {
  const cadre = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const dire = () => { const r = el.getBoundingClientRect(); session.cadrerVue({ haut: r.top, gauche: r.left }); };
    dire();
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(dire) : null;
    obs?.observe(el);
    window.addEventListener('resize', dire);
    return () => { obs?.disconnect(); window.removeEventListener('resize', dire); session.cadrerVue(null); };
  }, [session]);
  return cadre;
}

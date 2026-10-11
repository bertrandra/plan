// La roue du chargement : un plan lourd (un voisinage de 5 km, quatre mille objets) met plusieurs
// secondes a s'ouvrir, et la page montrait pendant ce temps des zones vides, comme figee. Une roue
// au centre, sans message, dit que l'application travaille.
//
// Elle est posee par index.html lui-meme (`#chargementInitial`, avec son style en ligne) : elle se
// voit avant que le programme ne soit charge, ce qui est deja une partie de l'attente. Le programme
// la retire des que l'ecran est pret, ou des qu'il montre autre chose (la porte, une erreur), et la
// remet pendant la lecture du projet. Ce module, au niveau zero, ne depend de rien.

const ID = 'chargementInitial';

/** Montre (`true`) ou retire (`false`) la roue du chargement. */
export function chargement(actif: boolean): void {
  if (typeof document === 'undefined') return;
  const e = document.getElementById(ID);
  if (!actif) { e?.remove(); return; }
  if (e) return;
  const d = document.createElement('div');
  d.id = ID;
  d.setAttribute('role', 'status');
  d.setAttribute('aria-label', 'Chargement');
  d.appendChild(document.createElement('span'));
  document.body.appendChild(d);
}

/** Retire la roue une fois l'ecran dessine : apres l'image suivante, quand React a rendu les zones. */
export function finChargementApresRendu(): void {
  if (typeof requestAnimationFrame === 'undefined') { chargement(false); return; }
  requestAnimationFrame(() => { setTimeout(() => chargement(false), 0); });
}

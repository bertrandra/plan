// Ecrire un grand tableau en JSON par paquets, en rendant la main entre deux (app/projet.ts).
//
// Un projet d'un kilometre de voisinage, c'est 9 000 objets et 8 a 10 Mo de JSON. Le serialiser,
// l'ecrire en texte, en mesurer la taille et l'envoyer d'un seul tenant figeait l'ecran pres de deux
// secondes a chaque enregistrement (mesure d'octobre 2026). Par paquets de quelques centaines, chaque
// tache reste courte, et l'interface repond entre deux.

/** La taille d'une chaine en octets UTF-8, sans la recopier (TextEncoder allouait 8 Mo pour la compter). */
export function octetsUtf8(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    // Une paire de substitution (un caractere hors du plan de base) : quatre octets pour les deux.
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** Rend la main au navigateur : un tour de boucle d'evenements. */
export const cederLaMain = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Transforme `elements` par paquets (`transformer`, applique a chaque tranche) et ecrit le resultat
 * en JSON, en rendant la main (`ceder`) entre deux paquets. Rend le tableau transforme et son JSON
 * en Blob : exactement les octets de JSON.stringify(tableau). Chaque paquet est encode en UTF-8 a son
 * tour ; le Blob final ne fait que les reunir, et `fetch` l'envoie sans recopier 8 Mo d'un coup sur
 * le fil principal (mesure : 250 ms dans fetch pour une chaine de 8 Mo). Sa taille est celle d'envoi.
 */
export async function jsonParPaquets<E, S>(elements: readonly E[], transformer: (tranche: E[]) => S[], taillePaquet = 400, ceder: () => Promise<void> = cederLaMain): Promise<{ valeurs: S[]; json: Blob }> {
  const valeurs: S[] = [];
  const morceaux: Blob[] = [];
  for (let i = 0; i < elements.length; i += taillePaquet) {
    const t = transformer(elements.slice(i, i + taillePaquet));
    for (const v of t) valeurs.push(v);
    const corps = JSON.stringify(t).slice(1, -1);
    if (corps) morceaux.push(new Blob([(morceaux.length ? ',' : '') + corps]));
    if (i + taillePaquet < elements.length) await ceder();
  }
  return { valeurs, json: new Blob(['[', ...morceaux, ']'], { type: 'application/json' }) };
}

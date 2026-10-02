// Z4 en Vue 3D : l'horloge du soleil, en haut a gauche de la scene, quand les ombres sont allumees.
//
// Elle ne regle rien : elle lit l'heure du soleil (`soleilVue3d.minutes`) et la montre, en aiguilles
// et en chiffres. Glisser le curseur d'heure, ou laisser la vitrine faire courir la journee, fait
// tourner les aiguilles avec les ombres - c'est le repere qui manquait pour lire une ombre portee.
//
// Pas de transition sur les aiguilles : a minuit l'aiguille des minutes repartirait a reculons d'un
// tour entier, et le curseur suit deja le glisser pas a pas.

/** Angle d'une aiguille, en degres depuis midi, sens horaire. */
export function anglesAiguilles(minutes: number): { heures: number; minutes: number } {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return { heures: ((m / 60) % 12) * 30, minutes: (m % 60) * 6 };
}

export function Horloge({ minutes, formatHeure }: { minutes: number; formatHeure: (m: number) => string }) {
  const a = anglesAiguilles(minutes);
  const texte = formatHeure(minutes);
  return (
    <div id="horloge3d" className="horloge3d" role="timer" aria-live="off" aria-label={'Heure du soleil : ' + texte}
      title="Heure de la course du soleil - les ombres sont calculees pour cet instant">
      <svg className="cadranHorloge" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <circle cx="24" cy="24" r="21" className="fondCadran" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="24" y1={i % 3 === 0 ? 5 : 6} x2="24" y2="8.5" className={i % 3 === 0 ? 'repereFort' : 'repere'}
            transform={'rotate(' + i * 30 + ' 24 24)'} />
        ))}
        <line x1="24" y1="24" x2="24" y2="13" className="aiguilleHeures" transform={'rotate(' + a.heures + ' 24 24)'} />
        <line x1="24" y1="24" x2="24" y2="8" className="aiguilleMinutes" transform={'rotate(' + a.minutes + ' 24 24)'} />
        <circle cx="24" cy="24" r="1.8" className="axeCadran" />
      </svg>
      <span className="texteHorloge">{texte}</span>
    </div>
  );
}

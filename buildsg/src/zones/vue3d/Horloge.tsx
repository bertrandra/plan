// Z4 en Vue 3D : l'horloge du soleil, en haut a gauche de la scene.
//
// Elle lit l'heure du soleil (`soleilVue3d.minutes`) et la montre, en aiguilles et en chiffres ; un
// clic ouvre dessous l'heure et la date (zones/vue3d/Vue3d.tsx). Glisser le curseur d'heure, ou
// laisser la vitrine faire courir la journee, fait tourner les aiguilles avec les ombres.
//
// Pas de transition sur les aiguilles : a minuit l'aiguille des minutes repartirait a reculons d'un
// tour entier, et le curseur suit deja le glisser pas a pas.

/** Angle d'une aiguille, en degres depuis midi, sens horaire. */
export function anglesAiguilles(minutes: number): { heures: number; minutes: number } {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return { heures: ((m / 60) % 12) * 30, minutes: (m % 60) * 6 };
}

export function Horloge({ minutes, formatHeure, ouvert, basculer }: { minutes: number; formatHeure: (m: number) => string; ouvert: boolean; basculer: () => void }) {
  const a = anglesAiguilles(minutes);
  const texte = formatHeure(minutes);
  return (
    <button type="button" id="horloge3d" className={'horloge3d' + (ouvert ? ' ouverte' : '')} data-controle="vue3d.horloge"
      aria-expanded={ouvert} aria-controls="reglageHeure3d" aria-label={'Heure du soleil : ' + texte + ' — régler l’heure et la date'}
      title="Heure et date du soleil : les ombres sont calculées pour cet instant. Cliquez pour les régler." onClick={basculer}>
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
    </button>
  );
}

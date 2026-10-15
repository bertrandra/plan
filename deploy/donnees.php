<?php
// Ou vivent les donnees du serveur (admin.php et analyse.php ; MD/spec-demos-admin.md, « Où vivent
// les fichiers ») : un seul dossier `data/`, HORS de la racine web, a cote de public_html/ (comme
// plan-admin-config.php), avec un sous-dossier par nature. buildsg/donnees.mjs fait de meme.
//
//   data/demo/         les demos de l'admin et de la vitrine ?mode=demo (<id>.json, .bak, .supprime-…)
//   data/admin/        palette.json, controleurs.json, echecs.json (les reglages de l'admin)
//   data/claude/       journal-AAAA-MM.jsonl, tarifs.json, plafonds.json, modeles.json, batches/
//   data/audits/       <id>.json et <id>.fiche.json ; <id>/analyses/ et <id>/images/ (les traces)
//   data/conformite/   mesures.json
//   data/migration.json  ce que le premier passage a deplace d'un ancien dossier
//
// Le reglage : `dossierDonnees` de la configuration, par defaut `data/` a cote de la racine web (le
// dossier au-dessus de public_html/, meme quand Plan est dans un sous-dossier). Compatibilite :
//   - une configuration qui ne dit que `dossierDemos` (celles d'avant) garde l'ancienne disposition,
//     telle quelle : les demos a la racine de ce dossier, claude/, audits/, conformite/ dedans, et la
//     palette en `.palette.json`. Rien ne bouge sans que l'administrateur le demande ;
//   - sinon, au premier passage, un ancien dossier (`dossierDemos` s'il est encore la, puis
//     plan-demos/ a cote de la configuration ou de la racine web, puis demos/ a cote d'admin.php) est
//     deplace dans data/, rubrique par rubrique, sans rien ecraser ; ce qui ne peut pas l'etre reste
//     en place et `migration.json` le dit. L'ancien dossier recoit DEPLACE-VERS-DATA.txt.

declare(strict_types=1);

// Ce fichier n'est qu'inclus : appele directement, il ne repond rien.
if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

const FORMAT_MIGRATION_DONNEES = 'plan-migration-donnees';
const NOTE_DEPLACEMENT = 'DEPLACE-VERS-DATA.txt';

/**
 * Les dossiers et fichiers des donnees. `$ici` : le dossier d'admin.php ; `$fichierConfig` : la
 * configuration lue (null sans elle).
 */
function dossiersDonnees(?array $config, string $racineWeb, string $ici, ?string $fichierConfig): array {
    $c = is_array($config) ? $config : [];
    $explicite = fn(string $k): ?string => isset($c[$k]) && is_string($c[$k]) && trim($c[$k]) !== '' ? rtrim($c[$k], '/') : null;
    $donnees = $explicite('dossierDonnees');
    $demos = $explicite('dossierDemos');
    if ($donnees === null && $demos !== null) {
        // L'ancienne disposition, celle d'une configuration d'avant `dossierDonnees`.
        return ['disposition' => 'ancienne', 'racine' => $demos, 'demos' => $demos, 'admin' => $demos,
                'palette' => $demos . '/.palette.json', 'controleurs' => $demos . '/.controleurs.json', 'echecs' => $demos . '/.echecs.json',
                'anciens' => []];
    }
    $parent = rtrim($racineWeb !== '' ? dirname($racineWeb) : dirname($ici), '/');
    $racine = $donnees ?? $parent . '/data';
    $anciens = [];
    foreach ([$demos, $fichierConfig !== null ? dirname($fichierConfig) . '/plan-demos' : null, $parent . '/plan-demos', $ici . '/demos'] as $a) {
        if ($a !== null && $a !== $racine && !in_array($a, $anciens, true)) $anciens[] = $a;
    }
    return ['disposition' => 'data', 'racine' => $racine, 'demos' => $racine . '/demo', 'admin' => $racine . '/admin',
            'palette' => $racine . '/admin/palette.json', 'controleurs' => $racine . '/admin/controleurs.json', 'echecs' => $racine . '/admin/echecs.json',
            'anciens' => $anciens];
}

/** Ce qu'un ancien dossier contient vraiment : sans `.`, `..`, ni la note d'un deplacement deja fait. */
function contenuAncien(string $dossier): array {
    if (!is_dir($dossier)) return [];
    return array_values(array_filter(scandir($dossier) ?: [], fn($n) => $n !== '.' && $n !== '..' && $n !== NOTE_DEPLACEMENT));
}

/** Ou va une entree de l'ancien dossier dans data/ ; null : elle reste ou elle est. */
function destinationAncienne(string $nom, bool $dossier, array $d): ?string {
    if ($dossier) return in_array($nom, ['claude', 'audits', 'conformite'], true) ? $d['racine'] . '/' . $nom : null;
    $reglages = ['.palette.json' => 'palette.json', '.palette.json.bak' => 'palette.json.bak', '.controleurs.json' => 'controleurs.json',
                 '.controleurs.json.bak' => 'controleurs.json.bak', '.echecs.json' => 'echecs.json'];
    if (isset($reglages[$nom])) return $d['admin'] . '/' . $reglages[$nom];
    return str_starts_with($nom, '.') ? null : $d['demos'] . '/' . $nom;
}

/**
 * Le premier passage dans la disposition `data` : un ancien dossier est deplace dans data/, une fois.
 * Rend ce que `migration.json` dit (null dans l'ancienne disposition, ou si data/ ne se cree pas).
 */
function migrerDonnees(array $d, ?string $maintenant = null): ?array {
    if ($d['disposition'] !== 'data') return null;
    $fMarque = $d['racine'] . '/migration.json';
    if (is_file($fMarque)) return json_decode((string)file_get_contents($fMarque), true);
    if (!is_dir($d['racine']) && !@mkdir($d['racine'], 0750, true)) return null;
    $verrou = @fopen($d['racine'] . '/.migration.verrou', 'c');
    if ($verrou) flock($verrou, LOCK_EX);
    try {
        // Une autre requete a pu migrer pendant l'attente du verrou.
        if (is_file($fMarque)) return json_decode((string)file_get_contents($fMarque), true);
        $marque = ['format' => FORMAT_MIGRATION_DONNEES, 'version' => 1, 'le' => $maintenant ?? gmdate('Y-m-d\TH:i:s\Z'), 'depuis' => null, 'deplaces' => [], 'laisses' => []];
        $ancien = null;
        foreach ($d['anciens'] as $a) if (contenuAncien($a)) { $ancien = $a; break; }
        if ($ancien !== null) {
            $marque['depuis'] = $ancien;
            foreach (contenuAncien($ancien) as $nom) {
                $source = $ancien . '/' . $nom;
                $cible = destinationAncienne($nom, is_dir($source), $d);
                if ($cible === null || file_exists($cible)) { $marque['laisses'][] = $nom; continue; }
                if (!is_dir(dirname($cible))) @mkdir(dirname($cible), 0750, true);
                if (@rename($source, $cible)) $marque['deplaces'][] = $nom; else $marque['laisses'][] = $nom;
            }
            @file_put_contents($ancien . '/' . NOTE_DEPLACEMENT, "Plan a deplace ce dossier dans " . $d['racine'] . " le " . $marque['le'] . ".\n"
                . ($marque['laisses'] ? "Restent ici (deja presents la-bas, ou non deplacables) : " . implode(', ', $marque['laisses']) . ".\nA comparer et ranger a la main.\n" : "Il peut etre supprime.\n")
                . "Le detail : " . $fMarque . "\n");
            error_log('Plan : donnees deplacees de ' . $ancien . ' vers ' . $d['racine'] . ' (' . count($marque['deplaces']) . ' deplacees, ' . count($marque['laisses']) . ' laissees : ' . implode(', ', $marque['laisses']) . ')');
        }
        $texte = json_encode($marque, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($texte !== false) @file_put_contents($fMarque, $texte . "\n");
        return $marque;
    } finally {
        if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
    }
}

/** Ce que l'etat de l'analyse dit des donnees, a l'administrateur : la disposition et la migration. */
function vueDonnees(array $d): array {
    $m = $d['disposition'] === 'data' && is_file($d['racine'] . '/migration.json') ? json_decode((string)file_get_contents($d['racine'] . '/migration.json'), true) : null;
    return ['disposition' => $d['disposition'], 'racine' => $d['racine'], 'migration' => is_array($m) ? $m : null];
}

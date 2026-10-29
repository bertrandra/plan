<?php
// Les constantes et les fonctions d'analyse.php, sans rien qui s'execute a l'inclusion : analyse.php
// les inclut, et les tests les appellent une a une (tests/fixtures/deploy/appel-analyse.php), sans
// passer par une requete HTTP. Servi seul par erreur, ce fichier ne fait que declarer et ne repond rien.
//
// `erreur()` vient de qui l'inclut : analyse.php repond et s'arrete, le banc des tests leve une
// exception. Le calcul pur, lui, refuse par `Refus`.

declare(strict_types=1);

const VERSION_API = '2023-06-01';
const MODELES = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
// `candidats` (lot G3 bis) : les cas candidats Panoramax du skill regles-toits, qui observent un
// batiment sur des photos de rue avec le prompt et le schema de l'analyse ; un usage a part pour que
// le journal et le tableau de bord en disent le cout.
// `rejeu` (15.5) : l'analyse d'un audit stocke, rejouee par l'administrateur pour comparer les modeles
// et les versions du prompt ; un usage a part pour que le tableau de bord en dise le cout.
// `facade` (MD/spec-facade-calage-audit.md 8, lots F2 et F3) : le run unique d'une facade, sur l'image prise pour la suite ; il rend
// le calage, la forme, les elements du toit, les ouvertures et leurs carreaux. La calibration et le releve l'appellent (appel
// immediat), l'audit dans le batch de l'analyse (une requete par facade). Il a remplace le renfort a trois passes (`renfort`, lot
// L18), retire au lot F3 : une ligne `renfort` ne vit plus que dans le journal, et s'y lit encore.
// `jardin` (lot L3 de la lecture IA elargie) : la lecture du jardin d'une parcelle, sur son orthophoto recadree (et les photos de la
// cloture et du portail) ; une requete dans le batch de l'audit, ou un appel immediat. Le modele rapide par defaut.
const USAGES = ['analyse', 'escalade', 'immediat', 'candidats', 'rejeu', 'facade', 'jardin'];
// Le modele de chaque usage tant que l'administrateur n'a rien regle (`admin/claude/modeles`). Le
// modele rapide partout, decision de l'utilisateur du 15 octobre 2026 : le "rien trouve" des audits
// venait du schema que l'API refusait (PR #317), pas du modele. L'administrateur passe un usage au plus fin dans Reglages > Modeles s'il le faut.
// Sauf l'escalade, au modele plus fin depuis le 29 octobre 2026 (decision de l'utilisateur) : elle ne part qu'a la demande, apres
// trois lectures votees du modele rapide, et un quatrieme passage du meme modele n'apporterait presque rien.
const MODELE_PAR_USAGE = ['analyse' => 'claude-haiku-5-5', 'escalade' => 'claude-sonnet-5-5', 'immediat' => 'claude-haiku-5-5', 'candidats' => 'claude-haiku-5-5', 'rejeu' => 'claude-haiku-5-5', 'facade' => 'claude-haiku-5-5', 'jardin' => 'claude-haiku-5-5'];
// Le prompt et le schema de chaque usage : le run d'une facade (lot F2, generes par `npm run regles:generer`) a les siens ; les autres
// usages (cas candidats compris) lisent ceux de l'analyse d'une maison.
const FICHIERS_PAR_USAGE = ['facade' => ['prompt-facade.md', 'schema-facade.json'], 'jardin' => ['prompt-jardin.md', 'schema-jardin.json']];
const FICHIERS_DEFAUT = ['prompt-analyse.md', 'schema-analyse.json'];
// Le brouillon des regles (Admin › Regles, MD/architecture.md 5.2.4) : le prompt et le schema que
// l'administrateur a edites, gardes ici pour essayer une analyse ou un rejeu AVANT la PR. Il ne remplace
// jamais deploy/ : seule une demande de l'administrateur qui le nomme (`essai: "brouillon"`) le lit.
const FICHIER_BROUILLON = 'regles-brouillon.json';
const BROUILLON_MAX = 2 * 1024 * 1024;
// Un appel immediat (l'aide du releve, « Rappeler Claude » de la calibration) : le run d'une facade, ou ses trois passes (x3), pas plus.
const REQUETES_IMMEDIATES = 3;
// Les usages dont l'appel immediat demande la sortie structuree (`output_config.format`, le schema de l'usage) : le run
// d'une facade. Sans elle, sa reponse reelle n'etait pas lue (« Sortie non JSON », verification de l'API du
// 29 octobre 2026, run 40887362801) ; son schema n'a ni recursion ni contrainte numerique, et l'API le compile. Si elle le
// refusait un jour, la requete repart sans (formatRefuse).
// La lecture du jardin aussi (lot L3) : son schema n'a ni recursion ni contrainte numerique.
const SORTIE_STRUCTUREE = ['facade', 'jardin'];
// Assez pour la reflexion a l'effort `low` et le JSON avec indices : ~600 tokens par facade, et le
// rejeu d'AE 101 (15 octobre 2026) a coupe a 8 000 la passe d'une maison de huit murs
// (reponse perdue, un vote sur deux passes). On ne paie que ce que le modele ecrit.
const MAX_TOKENS = 16000;
const EFFORT = 'low';
const TAILLE_MAX = 48 * 1024 * 1024;
const ID_VALIDE = '/^[A-Za-z0-9_-]{1,64}$/';
const ID_BATCH = '/^[A-Za-z0-9_-]{1,128}$/';
const IMAGES_PAR_REQUETE = 40;
// Les facades qu'une requete couvre (journal, cout par facade du tableau de bord) : un compte, borne.
const FACADES_MAX = 200;
const PRODUIT_PLATEFORME = 'plan';
const PERMISSION_ANALYSE = 'projects.write';
const BLOCS_PAR_REQUETE = 120;
const TEXTE_MAX = 200000;
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PRIX = ['entree', 'ecritureCache5m', 'ecritureCache1h', 'lectureCache', 'sortie'];
// Ce qui vaut tant que l'administrateur n'a rien regle : un dollar par jour, dix par mois.
const PLAFONDS_DEFAUT = ['format' => 'plan-claude-plafonds', 'defaut' => ['jour' => 1, 'mois' => 10], 'organisations' => [], 'requetesParBatch' => 60, 'estimationRequete' => 0.005];

// --- Le calcul, pur -------------------------------------------------------------------------------

function nombre($v): bool { return (is_int($v) || is_float($v)) && is_finite((float)$v); }

/** Le prompt versionne : l'en-tete `---` porte `version:`, le reste part tel quel en system. */
function lirePrompt(string $texte): array {
    if (!preg_match('/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/', $texte, $m)) throw new RuntimeException('prompt-analyse.md : en-tete --- manquant');
    if (!preg_match('/^version:\s*(\d+)\s*$/m', $m[1], $v)) throw new RuntimeException('prompt-analyse.md : version manquante');
    return ['version' => (int)$v[1], 'texte' => trim(substr($texte, strlen($m[0])))];
}

/** Les compteurs de `usage`, tels que l'API les renvoie, sous les noms du journal. */
function tokensDeUsage($u): array {
    $u = is_array($u) ? $u : [];
    $n = fn($x) => nombre($x) && $x > 0 ? (int)round((float)$x) : 0;
    $ecriture = $n($u['cache_creation_input_tokens'] ?? null);
    $detail = is_array($u['cache_creation'] ?? null) ? $u['cache_creation'] : null;
    return [
        'entree' => $n($u['input_tokens'] ?? null),
        'ecritureCache' => $ecriture,
        // Sans detail, toute l'ecriture est au tarif 5 minutes : c'est la duree par defaut du cache.
        'ecritureCache1h' => min($ecriture, $detail ? $n($detail['ephemeral_1h_input_tokens'] ?? null) : 0),
        'lectureCache' => $n($u['cache_read_input_tokens'] ?? null),
        'sortie' => $n($u['output_tokens'] ?? null),
    ];
}

/** La ligne de tarif d'un modele en vigueur ce jour-la : la plus recente qui le precede. */
function tarifEnVigueur(array $tarifs, string $modele, string $jour): ?array {
    $retenu = null;
    foreach (($tarifs['lignes'] ?? []) as $l) {
        if (!is_array($l) || ($l['modele'] ?? null) !== $modele || !is_string($l['depuis'] ?? null) || $l['depuis'] > $jour) continue;
        if ($retenu === null || $l['depuis'] > $retenu['depuis']) $retenu = $l;
    }
    return $retenu;
}

/** Le cout en dollars : palier au-dela du seuil sur toute la requete, remise Batch sur chaque prix. */
function coutAppel(array $t, ?array $ligne, bool $batch): ?float {
    if ($ligne === null) return null;
    $prompt = $t['entree'] + $t['ecritureCache'] + $t['lectureCache'];
    $p = is_array($ligne['auDela'] ?? null) && nombre($ligne['auDela']['seuil'] ?? null) && $prompt > $ligne['auDela']['seuil'] ? $ligne['auDela'] : $ligne;
    $remise = $batch && nombre($ligne['remiseBatch'] ?? null) ? (float)$ligne['remiseBatch'] : 1.0;
    $somme = $t['entree'] * $p['entree']
        + ($t['ecritureCache'] - $t['ecritureCache1h']) * $p['ecritureCache5m']
        + $t['ecritureCache1h'] * $p['ecritureCache1h']
        + $t['lectureCache'] * $p['lectureCache']
        + $t['sortie'] * $p['sortie'];
    return round(($somme / 1e6) * $remise, 8);
}

/** Les depenses d'une organisation ce jour-la et ce mois-la. */
function depenses(array $lignes, string $organisation, string $jour): array {
    $j = 0.0; $m = 0.0;
    foreach ($lignes as $l) {
        if (!is_array($l) || ($l['organisation'] ?? null) !== $organisation || !nombre($l['cout'] ?? null) || !is_string($l['t'] ?? null)) continue;
        if (substr($l['t'], 0, 7) !== substr($jour, 0, 7)) continue;
        $m += $l['cout'];
        if (substr($l['t'], 0, 10) === $jour) $j += $l['cout'];
    }
    return ['jour' => round($j, 8), 'mois' => round($m, 8)];
}

function plafondDe(array $p, string $organisation): array {
    $o = $p['organisations'][$organisation] ?? null;
    return ['jour' => is_array($o) && nombre($o['jour'] ?? null) ? $o['jour'] : $p['defaut']['jour'],
            'mois' => is_array($o) && nombre($o['mois'] ?? null) ? $o['mois'] : $p['defaut']['mois']];
}

final class Refus extends Exception {}

function texteCourt($v, int $max) {
    if ($v === null) return null;
    if (is_string($v) && mb_strlen($v) <= $max) return $v;
    return false;
}

/** La demande de la page : identite de la parcelle et requetes. Seuls des blocs texte et image. */
function verifierDemande($d, array $plafonds, array $modeles = MODELE_PAR_USAGE): array {
    if (!is_array($d) || array_is_list($d)) throw new Refus('Demande illisible.');
    $meta = [];
    foreach (['projet' => 128, 'idu' => 64, 'adresse' => 300, 'audit' => 64] as $cle => $max) {
        $v = texteCourt($d[$cle] ?? null, $max);
        if ($v === false) throw new Refus('Champ « ' . $cle . ' » invalide.');
        $meta[$cle] = $v;
    }
    // L'audit du serveur dont la demande est l'analyse (`depot`, 15.5) : sa trace s'y range.
    $depot = $d['depot'] ?? null;
    if ($depot !== null && (!is_string($depot) || !preg_match(ID_AUDIT, $depot))) throw new Refus('Champ « depot » invalide.');
    $meta['depot'] = $depot;
    // L'essai du brouillon des regles : l'analyse part avec le prompt et le schema edites (administrateur seul, verifie par la route).
    $essai = $d['essai'] ?? null;
    if ($essai !== null && $essai !== 'brouillon') throw new Refus('Champ « essai » invalide.');
    $meta['essai'] = $essai === 'brouillon';
    $usage = $d['usage'] ?? 'analyse';
    if (!in_array($usage, USAGES, true)) throw new Refus('Usage inconnu : ' . (is_string($usage) ? $usage : '?') . '.');
    $modele = $d['modele'] ?? $modeles[$usage];
    if (!in_array($modele, MODELES, true)) throw new Refus('Modèle non admis : ' . (is_string($modele) ? $modele : '?') . '.');
    $rs = $d['requetes'] ?? null;
    if (!is_array($rs) || !array_is_list($rs) || count($rs) === 0) throw new Refus('Aucune requête.');
    if (count($rs) > $plafonds['requetesParBatch']) throw new Refus('Trop de requêtes dans un batch (' . $plafonds['requetesParBatch'] . ' au plus).');
    $vus = [];
    $requetes = [];
    foreach ($rs as $r) {
        if (!is_array($r) || !is_string($r['id'] ?? null) || !preg_match(ID_VALIDE, $r['id'])) throw new Refus('Identifiant de requête invalide.');
        if (isset($vus[$r['id']])) throw new Refus('Identifiant de requête en double : ' . $r['id'] . '.');
        $vus[$r['id']] = true;
        $passe = $r['passe'] ?? null;
        if ($passe !== null && !(is_int($passe) && $passe >= 1 && $passe <= 3)) throw new Refus('Passe invalide (1, 2 ou 3).');
        $blocs = $r['contenu'] ?? null;
        if (!is_array($blocs) || !array_is_list($blocs) || count($blocs) === 0 || count($blocs) > BLOCS_PAR_REQUETE) throw new Refus('Contenu de requête invalide.');
        $images = 0;
        $contenu = [];
        foreach ($blocs as $b) {
            if (is_array($b) && ($b['type'] ?? null) === 'text' && is_string($b['text'] ?? null) && $b['text'] !== '' && mb_strlen($b['text']) <= TEXTE_MAX) {
                $contenu[] = ['type' => 'text', 'text' => $b['text']];
                continue;
            }
            $s = is_array($b) && ($b['type'] ?? null) === 'image' && is_array($b['source'] ?? null) ? $b['source'] : null;
            if ($s && ($s['type'] ?? null) === 'base64' && in_array($s['media_type'] ?? null, TYPES_IMAGE, true) && is_string($s['data'] ?? null) && preg_match('#^[A-Za-z0-9+/]+={0,2}$#', $s['data'])) {
                $images++;
                $contenu[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $s['media_type'], 'data' => $s['data']]];
                continue;
            }
            throw new Refus('Bloc de contenu non admis (texte ou image base64 seulement).');
        }
        if ($images > IMAGES_PAR_REQUETE) throw new Refus('Trop d’images dans une requête (' . IMAGES_PAR_REQUETE . ' au plus).');
        $facades = $r['facades'] ?? 0;
        if (!is_int($facades) || $facades < 0 || $facades > FACADES_MAX) throw new Refus('Nombre de façades invalide.');
        // Une requete peut porter son usage (le run d'une facade dans le batch de l'analyse) :
        // son prompt, son schema et son modele sont alors les siens. Dans une demande `escalade`, elle garde le prompt et le schema
        // de son usage (l'analyse d'une maison, le run d'une facade) et prend le modele de l'escalade ; elle se compte en escalade
        // (`compte`, au journal et au resultat). Avant, une requete d'une maison escaladee prenait le modele de l'analyse.
        $usageR = $r['usage'] ?? $usage;
        if (!in_array($usageR, USAGES, true)) throw new Refus('Usage inconnu : ' . (is_string($usageR) ? $usageR : '?') . '.');
        $escalade = $usage === 'escalade';
        $modeleR = isset($d['modele']) ? $modele : $modeles[$escalade ? 'escalade' : $usageR];
        $requetes[] = ['id' => $r['id'], 'passe' => $passe, 'images' => $images, 'facades' => $facades, 'usage' => $usageR, 'compte' => $escalade ? 'escalade' : $usageR,
                       'modele' => $modeleR, 'contenu' => $contenu];
    }
    return $meta + ['usage' => $usage, 'modele' => $modele, 'requetes' => $requetes];
}

// --- La forme de la reponse ---------------------------------------------------------------------
// Le schema ne part plus en sortie structuree (`output_config.format`) : l'API le compile en
// grammaire, et celle de l'analyse d'une maison depasse sa limite (« The compiled grammar is too
// large », audit d'AE 101, 15 octobre 2026) ; aucune reponse n'etait lue. Il part a la suite du
// prompt, et la reponse y est ramenee ici (`conformer`) : un terme hors vocabulaire devient
// `indetermine`, un champ manquant prend sa valeur par defaut, un element de liste illisible est
// ecarte. La page recoit donc la meme forme qu'avant.
//
// Le run d'une facade (SORTIE_STRUCTUREE, appel immediat) demande la sortie structuree : son schema part
// alors en `output_config.format`, et plus du tout dans le prompt. Sans elle (l'API refuse le schema, ou
// un batch), le prompt montre un EXEMPLE de reponse (`exemple` de son fichier de schema), pas le schema :
// le schema en texte, Haiku le recopiait et logeait ses valeurs dedans (verification de l'API du
// 29 octobre 2026, run 40896695970).

const CONSIGNE_JSON = 'Répondez par un seul objet JSON, sans texte avant ni après et sans bloc de code, conforme à ce schéma JSON :';

/** Le prompt envoye en system : la partie fixe, puis le schema de la reponse (les deux en cache). */
function promptAvecSchema(string $prompt, $schema): string {
    return $prompt . "\n\n# Forme de la réponse\n\n" . CONSIGNE_JSON . "\n\n" . json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

const CONSIGNE_STRUCTUREE = 'Répondez par l’objet JSON que la requête impose (sortie structurée), rien d’autre.';
const CONSIGNE_EXEMPLE = 'Répondez par un seul objet JSON, sans texte avant ni après et sans bloc de code, avec exactement les clés de l’exemple ci-dessous, dans le même ordre. C’est un EXEMPLE, pour un cas inventé : ses valeurs ne sont pas à recopier, la réponse dit ce que votre image montre, et ses listes ont autant d’éléments que vous en voyez (aucun s’il n’y en a pas). Tous les nombres sont des parts, comme expliqué plus haut : jamais des pixels.';

/**
 * Le prompt en system, selon la forme demandee : avec la sortie structuree, la partie fixe et une ligne (le schema part a cote) ; sans
 * elle, l'exemple de reponse quand l'usage en a un ; sinon le schema a la suite (les usages de l'analyse d'une maison).
 */
function systemeDe(string $prompt, $schema, $exemple, bool $structuree): string {
    if ($structuree) return $prompt . "\n\n# Forme de la réponse\n\n" . CONSIGNE_STRUCTUREE;
    if ($exemple !== null) return $prompt . "\n\n# Forme de la réponse\n\n" . CONSIGNE_EXEMPLE . "\n\n" . json_encode($exemple, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return promptAvecSchema($prompt, $schema);
}

/**
 * L'objet JSON d'une reponse sans sortie structuree. Dans l'ordre : le texte entier ; le dernier bloc
 * de code ```json ; le dernier objet equilibre du texte (accolades comptees hors des chaines) qui se
 * lit ; en dernier recours, le meme sans ses virgules finales (« , } »). Le dernier et non le premier :
 * une reponse peut porter un premier jet puis le JSON corrige (deux blocs de texte bout a bout, la
 * reflexion entre eux), ou une phrase avec des accolades avant ou apres l'objet ; « de la premiere
 * accolade a la derniere », la lecture d'avant, n'en lisait rien.
 */
function objetJsonDuTexte(string $texte) {
    $t = trim($texte);
    $d = json_decode($t);
    if (is_object($d)) return $d;
    if (preg_match_all('/```(?:json|JSON)?\s*\n?(.*?)```/s', $t, $m)) {
        foreach (array_reverse($m[1]) as $bloc) { $d = json_decode(trim($bloc)); if (is_object($d)) return $d; }
    }
    $objets = objetsEquilibres($t);
    for ($k = count($objets) - 1; $k >= 0; $k--) { $d = json_decode($objets[$k]); if (is_object($d)) return $d; }
    foreach (array_reverse($objets) as $o) {
        $d = json_decode((string)preg_replace('/,\s*([}\]])/', '$1', $o));
        if (is_object($d)) return $d;
    }
    return null;
}

/** Les objets `{…}` de premier niveau d'un texte, accolades comptees hors des chaines JSON. */
function objetsEquilibres(string $t): array {
    $objets = [];
    $n = strlen($t);
    $prof = 0; $debut = -1; $chaine = false; $echap = false;
    for ($i = 0; $i < $n; $i++) {
        $c = $t[$i];
        if ($chaine) {
            if ($echap) $echap = false;
            elseif ($c === '\\') $echap = true;
            elseif ($c === '"') $chaine = false;
            continue;
        }
        if ($c === '"' && $prof > 0) { $chaine = true; continue; }
        if ($c === '{') { if ($prof === 0) $debut = $i; $prof++; }
        elseif ($c === '}' && $prof > 0) { $prof--; if ($prof === 0) $objets[] = substr($t, $debut, $i - $debut + 1); }
    }
    return $objets;
}

/** Un terme ecrit par Claude, ramene a la graphie du vocabulaire (minuscules, sans accents, tirets). */
function termeNormalise(string $v): string {
    $v = strtr(mb_strtolower(trim($v)), ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i',
                                         'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', '_' => '-', ' ' => '-']);
    return $v;
}

function schemaResolu($s, $defs) {
    for ($n = 0; is_object($s) && isset($s->{'$ref'}) && $n < 8; $n++) {
        $nom = preg_replace('~^#/\$defs/~', '', (string)$s->{'$ref'});
        $s = is_object($defs) && isset($defs->$nom) ? $defs->$nom : null;
    }
    return $s;
}

/**
 * La valeur d'un champ manquant ou illisible, `[vrai, valeur]` quand il en a une sans rien inventer :
 * `indetermine` si son vocabulaire l'a, une liste vide, un texte vide, un objet ramene a son schema.
 * Un nombre (un numero d'ouverture, une cote, une image) ou un terme sans `indetermine` n'en a pas :
 * l'objet qui le porte est alors ecarte de sa liste plutot que complete.
 */
function valeurParDefaut($s, $defs): array {
    $s = schemaResolu($s, $defs);
    if (!is_object($s)) return [false, null];
    if (isset($s->anyOf) && is_array($s->anyOf)) {
        foreach ($s->anyOf as $b) {
            $b = schemaResolu($b, $defs);
            if (is_object($b) && is_array($b->enum ?? null) && in_array('indetermine', $b->enum, true)) return [true, 'indetermine'];
        }
        return [false, null];
    }
    if (is_array($s->enum ?? null)) return in_array('indetermine', $s->enum, true) ? [true, 'indetermine'] : [false, null];
    switch ($s->type ?? null) {
        case 'array': return [true, []];
        case 'string': return [true, ''];
        case 'object': $o = conformer(new stdClass(), $s, $defs, $ok); return [$ok, $o];
        default: return [false, null];
    }
}

/**
 * `$v` ramene au schema `$s` ; `$ok` faux quand il ne s'y ramene pas (le parent decide alors). A la
 * racine, un terme manquant sans `indetermine` prend le premier du vocabulaire : c'est `confiance`,
 * et son premier terme, `faible`, est le plus prudent.
 */
function conformer($v, $s, $defs, ?bool &$ok = null, bool $racine = false) {
    $ok = true;
    $s = schemaResolu($s, $defs);
    if (!is_object($s)) return $v;
    if (isset($s->anyOf) && is_array($s->anyOf)) {
        foreach ($s->anyOf as $b) { $r = conformer($v, $b, $defs, $okB); if ($okB) return $r; }
        $ok = false;
        return null;
    }
    if (is_array($s->enum ?? null)) {
        if (is_string($v)) { $t = termeNormalise($v); if (in_array($t, $s->enum, true)) return $t; }
        $ok = false;
        return null;
    }
    switch ($s->type ?? null) {
        case 'object':
            if (!is_object($v)) break;
            $o = new stdClass();
            foreach ((array)($s->properties ?? []) as $k => $p) {
                $r = conformer(property_exists($v, (string)$k) ? $v->$k : null, $p, $defs, $okP);
                if ($okP) { $o->$k = $r; continue; }
                [$a, $d] = valeurParDefaut($p, $defs);
                if ($a) { $o->$k = $d; continue; }
                $p = schemaResolu($p, $defs);
                if ($racine && is_object($p) && is_array($p->enum ?? null) && $p->enum) { $o->$k = $p->enum[0]; continue; }
                $ok = false;
                return null;
            }
            return $o;
        case 'array':
            if (!is_array($v)) break;
            $l = [];
            foreach ($v as $x) { $r = conformer($x, $s->items ?? null, $defs, $okI); if ($okI) $l[] = $r; }
            return $l;
        case 'integer':
            if (is_int($v)) return $v;
            if (is_float($v) && is_finite($v)) return (int)round($v);
            if (is_string($v) && preg_match('/^\s*-?\d+\s*$/', $v)) return (int)trim($v);
            break;
        case 'number':
            if (is_int($v) || (is_float($v) && is_finite($v))) return $v;
            if (is_string($v) && preg_match('/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/', trim($v))) return 0 + trim($v);
            break;
        case 'string':
            if (is_string($v)) return $v;
            break;
        case 'boolean':
            if (is_bool($v)) return $v;
            break;
        default:
            return $v;
    }
    $ok = false;
    return null;
}

/**
 * La sortie d'une reponse dans la forme de son schema, ou `null` si elle n'est pas un objet JSON, ou si cet objet n'a aucune cle de la
 * reponse et en a d'autres : le schema recopie (`type`, `properties`…) n'est pas une reponse vide a completer par defaut.
 */
function sortieConforme(string $texte, $schema) {
    $d = objetJsonDuTexte($texte);
    if ($d === null) return null;
    if (!is_object($schema)) return $d;
    $cles = array_keys((array)($schema->properties ?? []));
    if (count((array)$d) > 0 && !array_intersect(array_keys((array)$d), $cles)) return null;
    $r = conformer($d, $schema, $schema->{'$defs'} ?? null, $ok, true);
    return $ok && is_object($r) ? $r : null;
}

/**
 * Les parametres d'une requete : le prompt et le schema en cache, l'effort. `$structuree` ajoute la
 * sortie structuree (`output_config.format`) : le texte rendu est alors un objet JSON conforme par
 * construction, au lieu d'une consigne que le modele peut ne pas tenir. Seuls les usages de
 * SORTIE_STRUCTUREE la demandent, et seulement a l'appel immediat (voir appelImmediat) : le schema
 * de l'analyse d'une maison depasse la grammaire que l'API compile.
 */
function parametresRequete(string $modele, string $prompt, $schema, array $contenu, bool $structuree = false, $exemple = null): array {
    return [
        'model' => $modele,
        'max_tokens' => MAX_TOKENS,
        'system' => [['type' => 'text', 'text' => systemeDe($prompt, $schema, $exemple, $structuree), 'cache_control' => ['type' => 'ephemeral']]],
        'messages' => [['role' => 'user', 'content' => $contenu]],
        'output_config' => ['effort' => EFFORT] + ($structuree ? ['format' => ['type' => 'json_schema', 'schema' => $schema]] : []),
    ];
}

/**
 * La sortie structuree refusee par l'API (le schema ou sa grammaire) : son message (300 caracteres au
 * plus), que le resultat et le journal gardent ; la requete repart alors une fois sans elle. null pour
 * toute autre erreur, qui ne se rejoue pas.
 */
function formatRefuse($ligne): ?string {
    $r = is_object($ligne) && isset($ligne->result) && is_object($ligne->result) ? $ligne->result : null;
    if (!$r || ($r->type ?? '') !== 'errored') return null;
    $e = isset($r->error->error) && is_object($r->error->error) ? $r->error->error : ($r->error ?? null);
    if (!is_object($e) || ($e->type ?? '') !== 'invalid_request_error') return null;
    $m = (string)($e->message ?? '');
    return preg_match('/grammar|schema|output_config|format|complex/i', $m) ? mb_substr($m, 0, 300) : null;
}

function prixValides($o): bool {
    if (!is_array($o)) return false;
    foreach (PRIX as $k) if (!nombre($o[$k] ?? null) || $o[$k] < 0) return false;
    return true;
}

function verifierTarifs($d): array {
    $msg = 'Ce n’est pas une table des tarifs (format, lignes datées, prix positifs).';
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-claude-tarifs' || !is_array($d['lignes'] ?? null) || !array_is_list($d['lignes'])) throw new Refus($msg);
    foreach ($d['lignes'] as $l) {
        if (!is_array($l) || !is_string($l['modele'] ?? null) || !preg_match('/^claude-[a-z0-9-]{1,60}$/', $l['modele'])
            || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($l['depuis'] ?? '')) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($l['verifieLe'] ?? ''))) throw new Refus($msg);
        if (!prixValides($l) || !(nombre($l['remiseBatch'] ?? null) && $l['remiseBatch'] > 0 && $l['remiseBatch'] <= 1)) throw new Refus($msg);
        if (array_key_exists('auDela', $l) && !(is_array($l['auDela']) && is_int($l['auDela']['seuil'] ?? null) && $l['auDela']['seuil'] > 0 && prixValides($l['auDela']))) throw new Refus($msg);
    }
    return $d;
}

/** Les lignes passees ne se reecrivent pas : chacune doit revenir a l'identique. */
function passeGarde(array $ancien, array $nouveau, string $jour): bool {
    $signe = function (array $l): string {
        $v = [];
        foreach (PRIX as $k) $v[] = (float)$l[$k];
        $v[] = (float)$l['remiseBatch'];
        if (is_array($l['auDela'] ?? null)) { $v[] = (float)$l['auDela']['seuil']; foreach (PRIX as $k) $v[] = (float)$l['auDela'][$k]; }
        return json_encode($v);
    };
    $nouvelles = [];
    foreach ($nouveau['lignes'] as $l) $nouvelles[$l['modele'] . '@' . $l['depuis']] = $signe($l);
    foreach (($ancien['lignes'] ?? []) as $l) {
        if (!is_array($l) || ($l['depuis'] ?? '') > $jour) continue;
        if (($nouvelles[$l['modele'] . '@' . $l['depuis']] ?? null) !== $signe($l)) return false;
    }
    return true;
}

function verifierPlafonds($d): array {
    $msg = 'Ce ne sont pas des plafonds (format, montants par jour et par mois).';
    $paire = fn($o) => is_array($o) && nombre($o['jour'] ?? null) && $o['jour'] >= 0 && nombre($o['mois'] ?? null) && $o['mois'] >= 0;
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-claude-plafonds' || !$paire($d['defaut'] ?? null) || !is_array($d['organisations'] ?? null)) throw new Refus($msg);
    foreach ($d['organisations'] as $id => $o) if (!preg_match(ID_VALIDE, (string)$id) || !$paire($o)) throw new Refus($msg);
    if (!(is_int($d['requetesParBatch'] ?? null) && $d['requetesParBatch'] >= 1 && $d['requetesParBatch'] <= 1000)) throw new Refus($msg);
    if (!(nombre($d['estimationRequete'] ?? null) && $d['estimationRequete'] >= 0)) throw new Refus($msg);
    return $d;
}

/**
 * Le modele de chaque usage : le reglage de l'administrateur, sinon celui par defaut. Un modele
 * regle qui n'est plus admis (un deploiement l'a retire) retombe sur le defaut, sans tomber.
 */
function modelesParUsage($reglage): array {
    $choisis = is_array($reglage) && is_array($reglage['usages'] ?? null) ? $reglage['usages'] : [];
    $m = [];
    foreach (USAGES as $u) $m[$u] = in_array($choisis[$u] ?? null, MODELES, true) ? $choisis[$u] : MODELE_PAR_USAGE[$u];
    return $m;
}

/** Un reglage des modeles valide : un modele admis par usage connu ; un usage absent garde son defaut. */
function verifierModeles($d): array {
    $msg = 'Ce n’est pas un réglage des modèles (format, un modèle admis par usage).';
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-claude-modeles' || !is_array($d['usages'] ?? null)) throw new Refus($msg);
    if ($d['usages'] !== [] && array_is_list($d['usages'])) throw new Refus($msg);
    foreach ($d['usages'] as $u => $m) {
        if (!in_array($u, USAGES, true)) throw new Refus('Usage inconnu : ' . $u . '.');
        if (!in_array($m, MODELES, true)) throw new Refus('Modèle non admis : ' . (is_string($m) ? $m : '?') . '.');
    }
    return ['format' => 'plan-claude-modeles', 'usages' => $d['usages']];
}

/**
 * L'escalade d'une facade, telle que la page l'annonce sur son bouton : le modele de l'usage `escalade` (le reglage de l'administrateur,
 * sinon celui par defaut) et ses prix du jour, en dollars par million de tokens (null : pas de tarif pour lui).
 */
function escaladeFacade(array $modeles, array $tarifs, string $jour): array {
    $m = $modeles['escalade'];
    $l = tarifEnVigueur($tarifs, $m, $jour);
    return ['modele' => $m, 'prix' => $l !== null && nombre($l['entree'] ?? null) && nombre($l['sortie'] ?? null) ? ['entree' => $l['entree'], 'sortie' => $l['sortie']] : null];
}

/** Ce que `admin/claude/modeles` rend : le modele de chaque usage, les defauts, les modeles admis. */
function vueModeles(?array $reglage): array {
    return ['format' => 'plan-claude-modeles', 'usages' => modelesParUsage($reglage), 'defaut' => MODELE_PAR_USAGE, 'admis' => MODELES, 'regle' => $reglage !== null];
}

// --- Ce que les reponses contiennent (13.3 : comparer les modeles sur ce qu'ils trouvent) ---------
// Le journal ne garde pas la reponse : seulement ces comptes, lus quand le serveur la relit, par la
// forme du schema de l'usage (schema-analyse.json, schema-facade.json).

const COMPTES = ['ouvertures', 'manquees', 'enTrop', 'bouts', 'lucarnes', 'elements', 'ecarts', 'coins', 'determines'];
// Un compte ecrit par le modele est borne : un nombre aberrant ne doit pas noyer le tableau de bord.
const COMPTE_MAX = 999;
const BOUTS_TROUVES = ['pignon', 'croupe', 'demi-croupe', 'brisis'];

/** Un entier positif ecrit par le modele (`2` ou `2.0`), sinon zero : `indetermine` ne compte pas. */
function compte($v): int {
    return nombre($v) && $v > 0 && floor((float)$v) == $v ? (int)min(COMPTE_MAX, $v) : 0;
}
function listeDe($v): array { return is_array($v) && array_is_list($v) ? $v : []; }
function objetDe($v): array { return is_array($v) && ($v === [] || !array_is_list($v)) ? $v : []; }
function determine($v): bool { return is_string($v) && $v !== '' && $v !== 'indetermine'; }

/** Les comptes d'une sortie lue (`null` sans sortie) ; `vide` quand la reponse ne dit rien. */
function comptesSortie($sortie, string $usage): ?array {
    if ($sortie === null) return null;
    // La sortie arrive en objets (elle repart telle quelle vers la page) : relue ici en tableaux.
    $s = objetDe(json_decode((string)json_encode($sortie), true));
    $c = array_fill_keys(COMPTES, 0);
    if ($usage === 'facade') {
        foreach (comptesFacade($s) as $k => $n) $c[$k] = $n;
    } elseif ($usage === 'jardin') {
        // La lecture du jardin (lot L3) : ses objets, et ceux dont la certitude est forte.
        $objets = listeDe($s['objets'] ?? null);
        $c['elements'] = count($objets);
        $c['determines'] = count(array_filter($objets, fn($o) => (objetDe($o)['certitude'] ?? null) === 'forte'));
    } else {
        foreach (listeDe($s['facades'] ?? null) as $f) {
            $o = objetDe(objetDe($f)['ouvertures'] ?? null);
            foreach (listeDe($o['parNiveau'] ?? null) as $n) $c['ouvertures'] += compte($n);
            $c['manquees'] += compte($o['manquees'] ?? null);
            $c['enTrop'] += compte($o['enTrop'] ?? null);
        }
        $bouts = objetDe($s['bouts'] ?? null);
        foreach (['gauche', 'droite'] as $k) if (in_array($bouts[$k] ?? null, BOUTS_TROUVES, true)) $c['bouts']++;
        $c['lucarnes'] = compte(objetDe($s['lucarnes'] ?? null)['nombre'] ?? null);
        $c['elements'] = count(listeDe($s['elements'] ?? null));
        $c['ecarts'] = count(listeDe($s['ecarts'] ?? null));
        foreach ([['forme', 'valeur'], ['profil', 'valeur'], ['faitage', 'sens'], ['couverture', 'valeur'], ['terrasse', 'type']] as [$k, $champ]) {
            if (determine(objetDe($s[$k] ?? null)[$champ] ?? null)) $c['determines']++;
        }
    }
    foreach ($c as $k => $n) $c[$k] = min(COMPTE_MAX, $n);
    return $c + ['vide' => array_sum($c) === 0];
}

/**
 * Les comptes du run d'une facade (schema-facade.json) : ses ouvertures, ses angles du mur situes (`coins`), les pointes de pignon
 * (`bouts`), les elements du toit, et ce qui est determine (la silhouette, le bout). Une sortie deja relue en tableaux.
 */
function comptesFacade(array $s): array {
    $calage = objetDe($s['calage'] ?? null);
    $angles = objetDe($calage['angles'] ?? null);
    $forme = objetDe($s['forme'] ?? null);
    return [
        'ouvertures' => count(listeDe($s['ouvertures'] ?? null)),
        'coins' => count(array_filter([$angles['gauche'] ?? null, $angles['droite'] ?? null], 'is_array')),
        'bouts' => count(listeDe($calage['pointes'] ?? null)),
        'elements' => count(listeDe($s['elements'] ?? null)),
        'determines' => (determine($forme['silhouette'] ?? null) ? 1 : 0) + (determine($forme['bout'] ?? null) ? 1 : 0),
    ];
}

/** Les comptes d'un resultat relu : seulement d'une reponse reussie dont la sortie s'est lue. */
function trouvailles(array $x, string $usage): ?array {
    return $x['statut'] === 'reussi' && $x['erreur'] === null ? comptesSortie($x['sortie'], $usage) : null;
}

// --- Le tableau de bord de la consommation (13.3, lot L16 bis)

// Le journal est garde 24 mois : une periode n'en demande pas plus (25 fichiers mensuels au plus).
const MOIS_CONSULTABLES = 25;
// `idBatch` compte les batches par modele ; `trouve`, les comptes de la reponse (null sur un journal d'avant).
const CHAMPS_CONSOMMATION = ['t', 'organisation', 'projet', 'idu', 'adresse', 'audit', 'usage', 'modele', 'batch', 'idBatch', 'passe', 'tokens', 'images', 'facades', 'cout', 'statut', 'trouve'];

function jourValide($j): bool {
    if (!is_string($j) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $j, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/** Un jour (`AAAA-MM-JJ`) decale de `n` jours, en UTC. */
function decalerJour(string $jour, int $n): string {
    return gmdate('Y-m-d', (int)strtotime($jour . 'T00:00:00Z') + $n * 86400);
}

/** Les mois (`AAAA-MM`) d'une periode, dans l'ordre : un fichier de journal par mois. */
function moisEntre(string $du, string $au): array {
    $mois = [];
    $fin = (int)substr($au, 0, 4) * 12 + (int)substr($au, 5, 2) - 1;
    for ($k = (int)substr($du, 0, 4) * 12 + (int)substr($du, 5, 2) - 1; $k <= $fin; $k++) {
        $mois[] = sprintf('%04d-%02d', intdiv($k, 12), $k % 12 + 1);
    }
    return $mois;
}

/** Les filtres de `GET admin/consommation` ; un filtre mal forme est refuse net, jamais ignore. */
function lireFiltres(array $params, string $aujourdhui): array {
    $au = (string)($params['au'] ?? '') !== '' ? (string)$params['au'] : $aujourdhui;
    $du = (string)($params['du'] ?? '') !== '' ? (string)$params['du'] : (jourValide($au) ? decalerJour($au, -29) : '');
    if (!jourValide($du) || !jourValide($au) || $du > $au) throw new Refus('Période invalide (du et au en AAAA-MM-JJ, du avant au).');
    if (count(moisEntre($du, $au)) > MOIS_CONSULTABLES) throw new Refus('Période trop longue (le journal est gardé 24 mois).');
    $f = ['du' => $du, 'au' => $au, 'organisation' => null, 'modele' => null, 'usage' => null, 'parcelle' => null];
    foreach (['organisation' => ID_VALIDE, 'modele' => '/^claude-[a-z0-9-]{1,60}$/', 'usage' => '/^[a-z]{1,20}$/', 'parcelle' => ID_VALIDE] as $cle => $motif) {
        $v = $params[$cle] ?? null;
        if ($v === null || $v === '') continue;
        if (!is_string($v) || !preg_match($motif, $v)) throw new Refus('Filtre « ' . $cle . ' » invalide.');
        $f[$cle] = $v;
    }
    return $f;
}

/** Les lignes de la periode qui passent les filtres, reduites aux champs du tableau de bord. */
function filtrerConsommation(array $lignes, array $f): array {
    $sortie = [];
    foreach ($lignes as $l) {
        if (!is_array($l) || !is_string($l['t'] ?? null)) continue;
        $j = substr($l['t'], 0, 10);
        if ($j < $f['du'] || $j > $f['au']) continue;
        foreach (['organisation' => 'organisation', 'modele' => 'modele', 'usage' => 'usage', 'parcelle' => 'idu'] as $filtre => $champ) {
            if (($f[$filtre] ?? null) !== null && ($l[$champ] ?? null) !== $f[$filtre]) continue 2;
        }
        $r = [];
        foreach (CHAMPS_CONSOMMATION as $k) $r[$k] = $l[$k] ?? null;
        $sortie[] = $r;
    }
    return $sortie;
}

function chainesDe(array $lignes, string $k): array {
    $v = [];
    foreach ($lignes as $l) if (is_array($l) && is_string($l[$k] ?? null) && $l[$k] !== '') $v[] = $l[$k];
    return $v;
}

function organisationsConnues(array $lignes, array $p): array {
    $ids = array_values(array_unique(array_merge(['admin'], array_map('strval', array_keys($p['organisations'] ?? [])), chainesDe($lignes, 'organisation'))));
    sort($ids, SORT_STRING);
    return $ids;
}

/** Chaque organisation connue (plafonds ou journal du mois) : ses depenses du jour et du mois, ses plafonds. */
function etatOrganisations(array $lignesDuMois, array $p, string $jour): array {
    $etats = [];
    foreach (organisationsConnues($lignesDuMois, $p) as $id) $etats[] = ['id' => $id] + depenses($lignesDuMois, $id, $jour) + ['plafond' => plafondDe($p, $id)];
    return $etats;
}

/** De quoi remplir les listes des filtres : ce que la periode contient, avant filtre. */
function choixConsommation(array $lignes, array $p): array {
    $parcelles = [];
    foreach ($lignes as $l) {
        if (is_array($l) && is_string($l['idu'] ?? null) && $l['idu'] !== '' && !array_key_exists($l['idu'], $parcelles)) {
            $parcelles[$l['idu']] = is_string($l['adresse'] ?? null) ? $l['adresse'] : null;
        }
    }
    ksort($parcelles, SORT_STRING);
    $liste = [];
    foreach ($parcelles as $idu => $adresse) $liste[] = ['idu' => (string)$idu, 'adresse' => $adresse];
    return [
        'organisations' => organisationsConnues($lignes, $p),
        'modeles' => array_values(array_unique(array_merge(MODELES, chainesDe($lignes, 'modele')))),
        'usages' => array_values(array_unique(array_merge(USAGES, chainesDe($lignes, 'usage')))),
        'parcelles' => $liste,
    ];
}

/** Ce qu'une ligne de resultats d'Anthropic devient : pour la page, et pour le journal. */
function lireResultat($ligne, $schema = null): array {
    $r = is_object($ligne) && isset($ligne->result) && is_object($ligne->result) ? $ligne->result : new stdClass();
    $type = $r->type ?? '';
    $statut = ['succeeded' => 'reussi', 'errored' => 'echoue', 'expired' => 'expire', 'canceled' => 'annule'][$type] ?? 'echoue';
    $message = $type === 'succeeded' && isset($r->message) && is_object($r->message) ? $r->message : null;
    // `usage` se relit en tableau : les compteurs, rien d'autre.
    $tokens = tokensDeUsage($message && isset($message->usage) ? json_decode(json_encode($message->usage), true) : null);
    $sortie = null;
    $erreur = null;
    if ($message) {
        // Les blocs de texte bout a bout : la reflexion vient dans ses propres blocs, ignores ici.
        $texte = null;
        foreach ((is_array($message->content ?? null) ? $message->content : []) as $b) {
            if (is_object($b) && ($b->type ?? null) === 'text') $texte = ($texte ?? '') . (string)($b->text ?? '');
        }
        $arret = $message->stop_reason ?? null;
        if ($arret === 'refusal') $erreur = ['type' => 'refusal', 'message' => 'Analyse refusée par le modèle.'];
        elseif ($arret === 'max_tokens') $erreur = ['type' => 'max_tokens', 'message' => 'Réponse coupée (max_tokens).'];
        else {
            // En objets, pas en tableaux : `{}` et `[]` repartent tels quels vers la page.
            $sortie = $texte === null ? null : sortieConforme($texte, $schema);
            // Le debut du texte lu, pour qu'un echec se diagnostique (verifier-api-claude.mjs l'imprime) : ce que le modele a
            // ecrit, rien de la requete.
            if ($sortie === null) $erreur = ['type' => 'sortie_illisible',
                                             'message' => $texte === null ? 'Aucun bloc de texte.' : (objetJsonDuTexte($texte) === null ? 'Sortie non JSON.' : 'Sortie hors du schéma.'),
                                             'apercu' => mb_substr(trim((string)$texte), 0, 400)];
        }
    } elseif ($type === 'errored') {
        $e = isset($r->error->error) && is_object($r->error->error) ? $r->error->error : ($r->error ?? new stdClass());
        $erreur = ['type' => (string)($e->type ?? 'erreur'), 'message' => mb_substr((string)($e->message ?? ''), 0, 300)];
    }
    return ['id' => (string)($ligne->custom_id ?? ''), 'statut' => $statut, 'arret' => $message ? ($message->stop_reason ?? null) : null,
            'tokens' => $tokens, 'sortie' => $sortie, 'erreur' => $erreur];
}

// --- Les fichiers -------------------------------------------------------------------------------

function maintenant(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

function lireJson(string $f): ?array {
    $d = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($d) ? $d : null;
}

/** Ecriture atomique, version precedente gardee en `.bak` : jamais de demi-fichier. */
function ecrireJson(string $f, $d): void {
    if (!is_dir(dirname($f))) @mkdir(dirname($f), 0750, true);
    if (is_file($f)) copy($f, $f . '.bak');
    $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $texte = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($texte === false || file_put_contents($tmp, $texte . "\n") === false || !rename($tmp, $f)) {
        @unlink($tmp);
        erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    }
}

/** La table des tarifs : la premiere lecture pose celle livree avec Plan. */
function tarifs(string $dossierClaude): array {
    $f = $dossierClaude . '/tarifs.json';
    $t = lireJson($f);
    if ($t !== null) return $t;
    $livree = lireJson(__DIR__ . '/claude-tarifs.json');
    if ($livree === null) erreur(500, 'SERVER_ERROR', 'claude-tarifs.json absent a cote d’analyse.php.');
    ecrireJson($f, $livree);
    return $livree;
}

/** Les plafonds ; `organisations` reste un objet en JSON, meme vide. */
function plafonds(string $dossierClaude): array {
    return lireJson($dossierClaude . '/plafonds.json') ?? PLAFONDS_DEFAUT;
}
function plafondsJson(array $p): array { $p['organisations'] = (object)$p['organisations']; return $p; }

/** Le reglage des modeles par l'administrateur, ou `null` tant qu'il n'a rien regle. */
function reglageModeles(string $dossierClaude): ?array { return lireJson($dossierClaude . '/modeles.json'); }

function fJournal(string $dossierClaude, string $t): string { return $dossierClaude . '/journal-' . substr($t, 0, 7) . '.jsonl'; }

/** Une ligne par appel, ajoutee d'un seul trait et verrouillee : le journal ne se reecrit jamais. */
function journaliser(string $dossierClaude, array $lignes): void {
    $parFichier = [];
    foreach ($lignes as $l) {
        $f = fJournal($dossierClaude, $l['t']);
        $parFichier[$f] = ($parFichier[$f] ?? '') . json_encode($l, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION) . "\n";
    }
    foreach ($parFichier as $f => $texte) {
        if (file_put_contents($f, $texte, FILE_APPEND | LOCK_EX) === false) erreur(500, 'SERVER_ERROR', 'Journal impossible a ecrire.');
    }
}

function lireJournal(string $dossierClaude, string $t): array {
    $f = fJournal($dossierClaude, $t);
    if (!is_file($f)) return [];
    $lignes = [];
    foreach (explode("\n", (string)file_get_contents($f)) as $l) {
        if (trim($l) === '') continue;
        $d = json_decode($l, true);
        if (is_array($d)) $lignes[] = $d;
    }
    return $lignes;
}

/** Le brouillon des regles tel que le serveur le garde, ou null. */
function lireBrouillonRegles(string $dossierClaude): ?array {
    $b = lireJson($dossierClaude . '/' . FICHIER_BROUILLON);
    return is_array($b) && is_string($b['prompt'] ?? null) && is_string($b['schema'] ?? null) ? $b : null;
}

/** Ce qu'une demande ecrit comme brouillon : le prompt (avec son en-tete), le schema (son texte JSON) et l'etat de l'editeur. */
function verifierBrouillonRegles($d): array {
    if (!is_array($d) || array_is_list($d)) throw new Refus('Brouillon illisible.');
    if (!is_string($d['prompt'] ?? null) || !is_string($d['schema'] ?? null)) throw new Refus('Le brouillon porte un prompt et un schéma (texte).');
    if (!is_array($d['etat'] ?? null)) throw new Refus('Le brouillon porte l’état de l’éditeur.');
    try { $p = lirePrompt($d['prompt']); } catch (RuntimeException $e) { throw new Refus($e->getMessage()); }
    if ($p['texte'] === '') throw new Refus('Prompt vide.');
    $s = json_decode($d['schema']);
    if (!is_object($s) || !isset($s->schema) || !is_object($s->schema) || !isset($s->version) || !is_int($s->version)) throw new Refus('Schéma illisible : un objet avec `version` et `schema`.');
    return ['format' => 'plan-regles-brouillon', 'version' => 1, 'enregistreLe' => maintenant(), 'versionPrompt' => $p['version'], 'versionSchema' => $s->version,
            'prompt' => $d['prompt'], 'schema' => $d['schema'], 'etat' => $d['etat']];
}

/** Ce que l'etat dit du brouillon : ses versions et sa date, jamais son texte. */
function vueBrouillonRegles(?array $b): ?array {
    return $b === null ? null : ['enregistreLe' => $b['enregistreLe'] ?? null, 'prompt' => (int)($b['versionPrompt'] ?? 0), 'schema' => (int)($b['versionSchema'] ?? 0)];
}

function promptEtSchema(string $usage = 'analyse', ?array $brouillon = null): array {
    // L'essai : les usages de l'analyse lisent le brouillon ; le run d'une facade garde ses fichiers (son brouillon n'est pas celui-ci).
    if ($brouillon !== null && !isset(FICHIERS_PAR_USAGE[$usage])) {
        $s = json_decode($brouillon['schema']);
        return [lirePrompt($brouillon['prompt']), ['version' => (int)$s->version, 'schema' => $s->schema]];
    }
    [$fPrompt, $fSchema] = FICHIERS_PAR_USAGE[$usage] ?? FICHIERS_DEFAUT;
    $prompt = lirePrompt((string)@file_get_contents(__DIR__ . '/' . $fPrompt));
    // Le schema en objets : `{}` et `[]` doivent repartir tels quels vers l'API.
    $s = json_decode((string)@file_get_contents(__DIR__ . '/' . $fSchema));
    if (!is_object($s) || !isset($s->schema)) throw new RuntimeException($fSchema . ' illisible');
    return [$prompt, ['version' => (int)$s->version, 'schema' => $s->schema, 'exemple' => $s->exemple ?? null]];
}

/** Le prompt et le schema de chaque usage des requetes, lus une fois. */
function promptsDesRequetes(array $requetes, ?array $brouillon = null): array {
    $par = [];
    foreach ($requetes as $r) if (!isset($par[$r['usage']])) $par[$r['usage']] = promptEtSchema($r['usage'], $brouillon);
    return $par;
}

/** Un appel HTTP : [statut, texte]. Statut 0 si le serveur est injoignable. */
function appelHttp(string $methode, string $url, array $entetes, ?string $corps = null): array {
    if ($corps !== null) $entetes[] = 'content-type: application/json';
    if (function_exists('curl_init')) {
        $h = curl_init($url);
        curl_setopt_array($h, [CURLOPT_CUSTOMREQUEST => $methode, CURLOPT_HTTPHEADER => $entetes, CURLOPT_RETURNTRANSFER => true,
                               CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 120]);
        if ($corps !== null) curl_setopt($h, CURLOPT_POSTFIELDS, $corps);
        $texte = curl_exec($h);
        $statut = (int)curl_getinfo($h, CURLINFO_HTTP_CODE);
        curl_close($h);
        return [$texte === false ? 0 : $statut, $texte === false ? '' : (string)$texte];
    }
    $contexte = stream_context_create(['http' => ['method' => $methode, 'header' => implode("\r\n", $entetes), 'content' => $corps ?? '',
                                                  'ignore_errors' => true, 'timeout' => 120]]);
    $texte = @file_get_contents($url, false, $contexte);
    $statut = 0;
    foreach ($http_response_header ?? [] as $l) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $l, $m)) $statut = (int)$m[1];
    return [$texte === false ? 0 : $statut, $texte === false ? '' : (string)$texte];
}

/** Un appel a l'API d'Anthropic : [statut, texte]. */
function anthropic(string $methode, string $chemin, ?string $corps = null): array {
    global $anthropicUrl, $cle;
    return appelHttp($methode, $anthropicUrl . $chemin, ['x-api-key: ' . $cle, 'anthropic-version: ' . VERSION_API], $corps);
}

/**
 * Qui appelle : l'administrateur (session d'admin.php), ou un utilisateur de la plateforme, dont le
 * jeton est verifie aupres d'elle a chaque appel (`/me/context`, spec-connexion-plateforme 3.4) : la
 * plateforme seule sait s'il vaut encore, et son organisation est celle qui paie l'analyse.
 */
function acteur(bool $sessionAdmin, ?string $jeton, string $plateformeUrl): array {
    if ($sessionAdmin) return ['admin' => true, 'organisation' => 'admin'];
    if ($jeton === null) erreur(401, 'UNAUTHENTICATED', 'Mot de passe ou jeton de la plateforme requis.');
    [$statut, $texte] = appelHttp('GET', $plateformeUrl . '/api/v1/me/context', ['Authorization: Bearer ' . $jeton, 'X-Product: ' . PRODUIT_PLATEFORME, 'Accept: application/json']);
    if ($statut === 0) erreur(502, 'UPSTREAM', 'Plateforme injoignable.');
    if ($statut === 401) erreur(401, 'UNAUTHENTICATED', 'Jeton de la plateforme refusé.');
    if ($statut !== 200) erreur(403, 'FORBIDDEN', 'Ce compte ne tient pas Plan (' . $statut . ').');
    $c = json_decode($texte, true);
    $org = is_array($c) && is_array($c['tenant'] ?? null) ? (string)($c['tenant']['id'] ?? '') : '';
    if (!preg_match(ID_VALIDE, $org) || $org === 'admin') erreur(502, 'UPSTREAM', 'Réponse de la plateforme illisible.');
    $permissions = is_array($c['permissions'] ?? null) ? $c['permissions'] : [];
    if (!in_array(PERMISSION_ANALYSE, $permissions, true)) erreur(403, 'FORBIDDEN', 'Le droit d’écrire les projets est requis pour lancer une analyse.');
    return ['admin' => false, 'organisation' => $org];
}

// --- Les audits partages pour le corpus (spec-audit 15, lot L21)
// Deposer passe par `acteur` : la session admin, ou le jeton d'un compte qui peut ecrire les projets
// (l'audit de la parcelle demande deja ce droit).

const ID_AUDIT = '/^\d{8}-\d{6}-[0-9a-f]{8}$/';
// L'IDU d'une parcelle, ou son point de calage (`48.900000,2.130000`) pour un plan sans IDU.
const IDU_AUDIT = '/^[A-Za-z0-9_.,-]{1,64}$/';

/** Ce que le serveur verifie d'un audit : sa forme, pas son contenu (la page le relit en entier). */
function verifierAudit($d): array {
    // Une promenade des toits (`plan-audit`, model/audit.ts) : deposee par l'administrateur.
    if (is_array($d) && ($d['format'] ?? null) === 'plan-audit') {
        if (!is_int($d['version'] ?? null) || $d['version'] < 1 || $d['version'] > 2) throw new Refus('Version du fichier de promenade inconnue.');
        if (!is_array($d['promenade'] ?? null) || !is_array($d['cas'] ?? null) || !array_is_list($d['cas'])) throw new Refus('Fichier de promenade incomplet.');
        $commune = is_string($d['promenade']['commune'] ?? null) ? mb_substr($d['promenade']['commune'], 0, 120) : null;
        return ['nature' => 'promenade', 'idu' => '', 'adresse' => $commune, 'commune' => $commune];
    }
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-audit-parcelle') throw new Refus('Ce n’est pas un fichier d’audit de parcelle ni de promenade.');
    if (($d['version'] ?? null) !== 1) throw new Refus('Version du fichier d’audit inconnue.');
    $p = $d['parcelle'] ?? null;
    if (!is_array($p) || !is_string($p['idu'] ?? null) || !preg_match(IDU_AUDIT, $p['idu'])) throw new Refus('Parcelle du fichier d’audit invalide.');
    if (!is_array($d['batiments'] ?? null) || !is_array($d['propositions'] ?? null)) throw new Refus('Fichier d’audit incomplet.');
    $adresse = is_string($p['adresse'] ?? null) ? mb_substr($p['adresse'], 0, 300) : null;
    return ['nature' => 'parcelle', 'idu' => $p['idu'], 'adresse' => $adresse];
}

// Les marques d'un depot (en-tete `X-Plan-Depot`) : absente, c'est un partage pour le corpus.
const MARQUES_AUDIT = ['corpus', 'sauvegarde'];

/** La marque demandee, ou un refus ; `$defaut` : celle d'un depot qui n'en dit rien. */
function marqueAudit(string $entete, string $defaut = 'corpus'): string {
    if ($entete === '') return $defaut;
    if (!in_array($entete, MARQUES_AUDIT, true)) throw new Refus('Marque de dépôt inconnue (corpus ou sauvegarde).');
    return $entete;
}

/**
 * Ce que la fiche dit du fichier pour le catalogue de l'administrateur, sans le relire : ses photos,
 * sa phase (`capture` tant que « Lancer l'analyse » n'est pas passe), le debut de la visite, et sa
 * conclusion : les propositions (de Claude, des mesures) et ce qui en a ete fait, ou les cas d'une
 * promenade et leur statut.
 */
function resumeAudit(array $d): array {
    $nb = fn($l) => is_array($l) ? count($l) : 0;
    if (($d['format'] ?? null) === 'plan-audit') {
        $photos = 0;
        $statuts = [];
        foreach ($d['cas'] as $c) {
            if (!is_array($c)) continue;
            $constat = is_array($c['constat'] ?? null) ? $c['constat'] : [];
            $photos += is_array($constat['photos'] ?? null) ? count($constat['photos']) : (is_array($constat['photo'] ?? null) ? 1 : 0);
            $s = is_string($c['statut'] ?? null) ? $c['statut'] : 'a_corriger';
            $statuts[$s] = ($statuts[$s] ?? 0) + 1;
        }
        $debut = is_string($d['promenade']['debut'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T/', $d['promenade']['debut']) ? substr($d['promenade']['debut'], 0, 40) : null;
        return ['photos' => $photos, 'phase' => 'analyse', 'debut' => $debut, 'cas' => count($d['cas']), 'statuts' => (object)$statuts];
    }
    $photos = $nb($d['cloture']['photos'] ?? null) + $nb($d['portail']['photos'] ?? null);
    foreach ($d['batiments'] as $b) {
        if (!is_array($b)) continue;
        $photos += $nb($b['photos'] ?? null);
        foreach (is_array($b['facades'] ?? null) ? $b['facades'] : [] as $f) $photos += $nb(is_array($f) ? ($f['photos'] ?? null) : null);
    }
    $debut = is_string($d['debut'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T/', $d['debut']) ? substr($d['debut'], 0, 40) : null;
    $p = ['total' => 0, 'claude' => 0, 'mesures' => 0, 'validees' => 0, 'refusees' => 0, 'enAttente' => 0];
    foreach ($d['propositions'] as $x) {
        if (!is_array($x)) continue;
        $p['total']++;
        $p[($x['source'] ?? null) === 'claude' ? 'claude' : 'mesures']++;
        $decision = $x['decision'] ?? null;
        $p[$decision === 'validee' ? 'validees' : ($decision === 'refusee' ? 'refusees' : 'enAttente')]++;
    }
    return ['photos' => $photos, 'phase' => is_string($d['finCapture'] ?? null) && $d['finCapture'] !== '' ? 'analyse' : 'capture', 'debut' => $debut, 'propositions' => $p];
}

/**
 * La conclusion d'un audit, a part, lisible a la main (`decisions.json`) : chaque proposition, d'ou
 * elle vient et ce qu'elle est devenue (validee, refusee, en attente) ; pour une promenade, chaque
 * cas et son statut. Rien n'est calcule : le fichier de l'audit reste la reference.
 */
function decisionsAudit(array $d): array {
    if (($d['format'] ?? null) === 'plan-audit') {
        $cas = [];
        foreach ($d['cas'] as $c) {
            if (!is_array($c)) continue;
            $k = is_array($c['constat'] ?? null) ? $c['constat'] : [];
            $id = is_array($c['identite'] ?? null) ? $c['identite'] : [];
            $cas[] = ['id' => $c['id'] ?? null, 'cle' => $c['cle'] ?? null, 'cleBdtopo' => $id['cleBdtopo'] ?? null, 'adresse' => $id['adresse'] ?? null,
                      'statut' => $c['statut'] ?? null, 'categorie' => $k['categorie'] ?? null, 'problemes' => is_array($k['problemes'] ?? null) ? $k['problemes'] : [],
                      'note' => is_string($k['note'] ?? null) ? $k['note'] : '', 'photos' => is_array($k['photos'] ?? null) ? count($k['photos']) : (is_array($k['photo'] ?? null) ? 1 : 0)];
        }
        return ['format' => 'plan-audit-decisions', 'version' => VERSION_DECISIONS_AUDIT, 'nature' => 'promenade', 'cas' => $cas];
    }
    $propositions = [];
    foreach ($d['propositions'] as $x) {
        if (!is_array($x)) continue;
        $propositions[] = ['id' => $x['id'] ?? null, 'objet' => $x['objet'] ?? null, 'source' => $x['source'] ?? null, 'avant' => $x['avant'] ?? null,
                           'apres' => $x['apres'] ?? null, 'confiance' => $x['confiance'] ?? null, 'decision' => $x['decision'] ?? null,
                           // Version 2 (lot L0) : de quoi exporter les donnees d'analyse sans relire le fichier entier.
                           'cible' => is_array($x['cible'] ?? null) ? $x['cible'] : null, 'effet' => is_string($x['effet']['type'] ?? null) ? $x['effet']['type'] : null,
                           'reserve' => is_string($x['reserve'] ?? null) ? $x['reserve'] : null] + moteurDeProposition($x);
    }
    $decisions = [];
    foreach (is_array($d['decisions'] ?? null) ? $d['decisions'] : [] as $x) {
        if (is_array($x)) $decisions[] = ['t' => $x['t'] ?? null, 'acceptees' => $x['acceptees'] ?? [], 'refusees' => $x['refusees'] ?? []];
    }
    return ['format' => 'plan-audit-decisions', 'version' => VERSION_DECISIONS_AUDIT, 'nature' => 'parcelle', 'propositions' => $propositions, 'decisions' => $decisions];
}

// La conclusion d'un audit de parcelle dit, depuis le lot L0, la cible, l'effet, la reserve, la decision du moteur et l'accord de
// Claude de chaque proposition (l'export des donnees d'analyse). Une conclusion plus ancienne se refait depuis le fichier de l'audit.
const VERSION_DECISIONS_AUDIT = 2;

/**
 * Ce que le moteur a fait d'une proposition, et Claude avec lui : `moteur`, les decisions des arbitrages (`auto`, `manuelle`…), null
 * sans arbitrage ; `accordClaude`, `accord` quand la ligne de Claude est dans le groupe retenu de chaque arbitrage ou elle figure,
 * `desaccord` quand l'un l'a ecartee, `claude-seul` pour une proposition de Claude sans arbitrage, `sans-claude` sinon.
 */
function moteurDeProposition(array $p): array {
    $arbitrages = array_values(array_filter(listeDe($p['arbitrages'] ?? null), 'is_array'));
    if (!$arbitrages) return ['moteur' => null, 'accordClaude' => ($p['source'] ?? null) === 'claude' ? 'claude-seul' : 'sans-claude'];
    $decisions = [];
    $accord = false;
    $desaccord = false;
    foreach ($arbitrages as $a) {
        if (is_string($a['decision'] ?? null)) $decisions[] = $a['decision'];
        foreach (listeDe($a['groupes'] ?? null) as $g) {
            if (!is_array($g)) continue;
            foreach (listeDe($g['lignes'] ?? null) as $l) {
                if (!is_array($l) || ($l['source'] ?? null) !== 'claude') continue;
                if (($g['retenu'] ?? false) === true) $accord = true; else $desaccord = true;
            }
        }
    }
    return ['moteur' => $decisions ? implode(',', array_values(array_unique($decisions))) : null,
            'accordClaude' => $desaccord ? 'desaccord' : ($accord ? 'accord' : 'sans-claude')];
}

/**
 * Le corps d'un fichier d'audit, ou un refus qui dit sa cause. Un corps annonce mais vide : PHP l'a
 * jete (`post_max_size` d'un hebergement plus strict) ; une page qui n'aurait que « JSON illisible »
 * ne saurait quoi faire.
 */
function texteAudit(): string {
    $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
    if (strlen($texte) > TAILLE_MAX) erreur(413, 'TOO_LARGE', 'Fichier d’audit trop gros (48 Mo au plus).');
    $longueur = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($texte === '' && $longueur > 0) {
        $taille = $longueur >= 1048576 ? (int)ceil($longueur / 1048576) . ' Mo' : (int)ceil($longueur / 1024) . ' Ko';
        erreur(413, 'TOO_LARGE', 'Fichier d’audit trop gros pour ce serveur (' . $taille . ' refusés par PHP ; post_max_size = ' . ini_get('post_max_size') . ' dans sa configuration, à porter à 64M).');
    }
    return $texte;
}

// --- Les indicateurs de conformite (spec-regles-toits 13.5, lot G3)
// L'ecran Admin › Conformité mesure le corpus du depot et les audits partages, puis range sa mesure
// ici : l'historique dit si le taux monte, phase apres phase. Le serveur n'en calcule rien.

// Les dernieres mesures gardees : plus, l'historique ne se lit plus d'un coup d'oeil.
const MESURES_CONFORMITE_MAX = 200;
const TAILLE_MESURE_MAX = 2 * 1024 * 1024;
const RESUME_CONFORMITE = ['total', 'observes', 'conformes', 'nonConformes', 'aRevoir', 'sansObservation', 'ecartes', 'horsCalcul'];

/** Ce que le serveur verifie d'une mesure : sa forme et son resume, le reste est relu par la page. */
function verifierMesureConformite($d): array {
    if (!is_array($d) || array_is_list($d) || ($d['format'] ?? null) !== 'plan-conformite-mesure') throw new Refus('Ce n’est pas une mesure de conformité.');
    if (($d['version'] ?? null) !== 1) throw new Refus('Version de la mesure de conformité inconnue.');
    if (!is_string($d['t'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $d['t'])) throw new Refus('Date de la mesure invalide.');
    $r = $d['toits'] ?? null;
    if (!is_array($r)) throw new Refus('Résumé de la mesure invalide.');
    foreach (RESUME_CONFORMITE as $k) if (!nombre($r[$k] ?? null) || $r[$k] < 0) throw new Refus('Résumé de la mesure invalide.');
    foreach (['parForme', 'parRegion', 'parProbleme', 'cas'] as $k) if (!is_array($d[$k] ?? null) || !array_is_list($d[$k])) throw new Refus('Mesure de conformité incomplète.');
    return $d;
}

// --- Le rangement des audits (MD/spec-audit.md 15.4) ---------
// Chaque audit a son dossier, classe pour s'y retrouver a la main (gestionnaire de fichiers, FTP) :
//
//   audits/parcelle/<IDU>/<id>/        audit.json (le fichier tel qu'il est arrive), fiche.json,
//                                      decisions.json (la conclusion, lisible), analyses/, images/
//   audits/promenade/<commune>/<id>/   les memes
//   audits/index.json                  les fiches, sans les secrets : la liste se lit d'un coup ; il
//                                      se reconstruit en relisant l'arborescence s'il manque
//
// `<id>` commence par la date et l'heure de reception (AAAAMMJJ-HHMMSS-xxxxxxxx). Les noms sont en
// ASCII, sans espaces. Les audits d'avant ce rangement (`audits/<id>.json` et `<id>.fiche.json`, a
// plat) y sont ranges au premier passage, sans rien perdre.

const FORMAT_INDEX_AUDITS = 'plan-audits-index';
const ACCENTS_NOMS = ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'å' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
                 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ì' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ò' => 'o', 'õ' => 'o', 'ù' => 'u', 'û' => 'u',
                 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'ý' => 'y', 'ñ' => 'n', 'œ' => 'oe', 'æ' => 'ae', 'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Ç' => 'C',
                 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Î' => 'I', 'Ï' => 'I', 'Ô' => 'O', 'Ö' => 'O', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U',
                 'Œ' => 'OE', 'Æ' => 'AE'];

/** Un nom de dossier sur : ASCII, lettres, chiffres, `-` et `_`, 64 au plus. */
function nomSur(?string $v, string $defaut, bool $minuscules = false): string {
    $t = strtr((string)$v, ACCENTS_NOMS);
    if ($minuscules) $t = strtolower($t);
    $t = trim((string)preg_replace('/[^A-Za-z0-9_-]+/', '-', $t), '-');
    return $t === '' ? $defaut : substr($t, 0, 64);
}

/** Le dossier d'un audit, relatif a `audits/`. */
function dossierRelatifAudit(array $fiche): string {
    if (($fiche['nature'] ?? 'parcelle') === 'promenade') return 'promenade/' . nomSur($fiche['commune'] ?? null, 'sans-commune', true) . '/' . $fiche['id'];
    return 'parcelle/' . nomSur($fiche['idu'] ?? null, 'sans-idu') . '/' . $fiche['id'];
}

/** Les fiches de l'arborescence, relues : ce que l'index dit quand il manque. */
function reconstruireIndex(string $dA): array {
    $index = [];
    foreach (glob($dA . '/*/*/*/fiche.json') ?: [] as $f) {
        $fiche = lireJson($f);
        if ($fiche === null || !is_string($fiche['id'] ?? null) || !preg_match(ID_AUDIT, $fiche['id'])) continue;
        unset($fiche['retrait']);
        $fiche['dossier'] = substr(dirname($f), strlen($dA) + 1);
        $index[$fiche['id']] = $fiche;
    }
    return $index;
}

/** Change l'index sous verrou : deux depots simultanes ne s'effacent pas. */
function majIndex(string $dA, callable $f): void {
    if (!is_dir($dA)) @mkdir($dA, 0750, true);
    $verrou = fopen($dA . '/.index.verrou', 'c');
    if ($verrou) flock($verrou, LOCK_EX);
    $lu = lireJson($dA . '/index.json');
    $index = is_array($lu['audits'] ?? null) ? $lu['audits'] : reconstruireIndex($dA);
    $index = $f($index);
    ecrireJson($dA . '/index.json', ['format' => FORMAT_INDEX_AUDITS, 'version' => 1, 'audits' => (object)$index]);
    if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
}

/**
 * Les audits d'avant le rangement (`<id>.json` et `<id>.fiche.json` a plat dans audits/) : chacun dans
 * son dossier. Un dossier deja la n'est pas ecrase ; l'audit reste alors a plat, toujours lu.
 */
function rangerAnciensAudits(string $dA): void {
    $ranges = false;
    foreach (glob($dA . '/*.fiche.json') ?: [] as $fFiche) {
        $id = basename($fFiche, '.fiche.json');
        $fiche = preg_match(ID_AUDIT, $id) ? lireJson($fFiche) : null;
        if ($fiche === null) continue;
        $fiche += ['id' => $id, 'nature' => 'parcelle'];
        $dir = $dA . '/' . dossierRelatifAudit($fiche);
        if (file_exists($dir . '/audit.json') || (!is_dir($dir) && !@mkdir($dir, 0750, true))) continue;
        if (is_file($dA . '/' . $id . '.json') && !@rename($dA . '/' . $id . '.json', $dir . '/audit.json')) continue;
        $texte = json_encode($fiche, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        if ($texte === false || file_put_contents($dir . '/fiche.json', $texte . "\n") === false) continue;
        $d = lireJson($dir . '/audit.json');
        if ($d !== null) { try { verifierAudit($d); ecrireJson($dir . '/decisions.json', decisionsAudit($d)); } catch (Refus $e) { /* illisible : la fiche suffit */ } }
        if (is_file($fFiche . '.bak')) @rename($fFiche . '.bak', $dir . '/fiche.json.bak');
        @unlink($fFiche);
        $ranges = true;
    }
    if ($ranges) majIndex($dA, fn() => reconstruireIndex($dA));
}

/** L'index des audits (id => fiche sans secret, avec `dossier`), apres le rangement des anciens. */
function indexAudits(string $dA): array {
    rangerAnciensAudits($dA);
    $lu = lireJson($dA . '/index.json');
    if (is_array($lu['audits'] ?? null)) return $lu['audits'];
    $index = reconstruireIndex($dA);
    if ($index) majIndex($dA, fn() => $index);
    return $index;
}

/** Le dossier d'un audit range, ou null. */
function dossierAudit(string $dA, string $id): ?string {
    $e = indexAudits($dA)[$id] ?? null;
    if (!is_array($e) || !is_string($e['dossier'] ?? null)) return null;
    $dir = $dA . '/' . $e['dossier'];
    return is_file($dir . '/fiche.json') ? $dir : null;
}

/** Le fichier tel qu'il est arrive, ecrit d'un coup : le corpus le rejoue a l'octet pres. */
function ecrireAudit(string $dir, string $texte): void {
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier de l’audit impossible a creer.');
    $tmp = $dir . '/audit.json.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $texte) === false || !rename($tmp, $dir . '/audit.json')) { @unlink($tmp); erreur(500, 'SERVER_ERROR', 'Écriture impossible.'); }
}

/** La fiche, la conclusion et l'index d'un audit, apres son fichier. */
function ecrireFicheAudit(string $dA, string $dir, array $fiche, array $d): void {
    ecrireJson($dir . '/fiche.json', $fiche);
    ecrireJson($dir . '/decisions.json', decisionsAudit($d));
    $vue = $fiche;
    unset($vue['retrait']);
    $vue['dossier'] = substr($dir, strlen($dA) + 1);
    majIndex($dA, function (array $index) use ($vue) { $index[$vue['id']] = $vue; return $index; });
}

/** Un dossier et tout ce qu'il contient. */
function effacerDossier(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..') continue;
        is_dir($dir . '/' . $n) && !is_link($dir . '/' . $n) ? effacerDossier($dir . '/' . $n) : @unlink($dir . '/' . $n);
    }
    @rmdir($dir);
}

/** Les fiches des audits recus, les plus recents d'abord, sans l'empreinte du secret. */
function listeAudits(string $dA): array {
    $liste = array_values(indexAudits($dA));
    usort($liste, fn($a, $b) => strcmp((string)($b['recuLe'] ?? ''), (string)($a['recuLe'] ?? '')));
    return $liste;
}

// --- Les traces des analyses et des rejeux (MD/spec-audit.md 15.5, MD/spec-lecture-ia-elargie.md 4.8) --
// Toute requete a Claude garde tout ce qui est parti et tout ce qui est revenu : rien n'est jete (lot L0,
// decision 7 du proprietaire). Un batch ou un appel immediat qui nomme son audit (`depot`, l'identifiant du
// serveur : l'analyse de la session apres sa sauvegarde, un rejeu, une escalade) se range dans le dossier de
// l'audit ; les autres (une analyse sans depot, « Rappeler Claude » de la calibration, l'aide du releve) dans
// claude/analyses/sans-depot/<organisation>/<AAAA-MM>/, gardes 24 mois comme le journal. Le journal de
// claude/, lui, ne garde toujours ni photo ni reponse : leurs empreintes seulement (`empreintes`, `reponse`).
//
//   analyses/<AAAAMMJJ-HHMMSS>-<modele>-<xxxx>/entrant.json   prompt et schema envoyes (texte complet),
//                                                             modele, effort, chaque requete et ses
//                                                             blocs, les images par reference
//   .../sortant.json   chaque reponse : texte brut, sortie ramenee au schema, erreur, tokens, cout
//   .../resume.json    nature (analyse ou rejeu), etat, versions, comptes : ce que la liste montre
//   images/<sha256>.jpg   les images envoyees, une fois par audit (deux rejeux partagent les memes) ou par
//                         mois d'une organisation sans depot (trois passes et une escalade : une image)

const ID_TRACE = '/^\d{8}-\d{6}-[a-z0-9-]{1,48}-[0-9a-f]{4}$/';
const EXTENSIONS_IMAGE = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
const IMAGE_TRACE = '/^[0-9a-f]{64}\.(jpg|png|webp|gif)$/';

/** Ce qui est parti chez Claude : les images rangees dans `images/`, remplacees par leur nom. */
function entrantTrace(array $demande, array $prompts, string $dir): array {
    $requetes = [];
    foreach ($demande['requetes'] as $r) {
        $blocs = [];
        foreach ($r['contenu'] as $b) {
            if ($b['type'] !== 'image') { $blocs[] = $b; continue; }
            $octets = (string)base64_decode($b['source']['data'], true);
            $nom = hash('sha256', $octets) . '.' . EXTENSIONS_IMAGE[$b['source']['media_type']];
            if (!is_dir($dir . '/images')) @mkdir($dir . '/images', 0750, true);
            if (!is_file($dir . '/images/' . $nom)) @file_put_contents($dir . '/images/' . $nom, $octets);
            $blocs[] = ['type' => 'image', 'media_type' => $b['source']['media_type'], 'image' => $nom, 'octets' => strlen($octets)];
        }
        $requetes[] = ['id' => $r['id'], 'passe' => $r['passe'], 'usage' => $r['usage'], 'modele' => $r['modele'], 'facades' => $r['facades'], 'images' => $r['images'], 'contenu' => $blocs];
    }
    $usages = [];
    foreach ($prompts as $usage => [$p, $s]) {
        $usages[$usage] = ['prompt' => $p['version'], 'schema' => $s['version'], 'systeme' => promptAvecSchema($p['texte'], $s['schema']), 'schemaJson' => $s['schema']];
    }
    return ['format' => 'plan-audit-entrant', 'version' => 1, 'max_tokens' => MAX_TOKENS, 'effort' => EFFORT, 'usages' => (object)$usages, 'requetes' => $requetes];
}

/** Le texte brut d'une ligne de resultats, tel que Claude l'a ecrit (blocs de texte bout a bout). */
function texteBrut($ligne): ?string {
    $m = is_object($ligne) && isset($ligne->result->message) && is_object($ligne->result->message) ? $ligne->result->message : null;
    if (!$m) return null;
    $texte = null;
    foreach (is_array($m->content ?? null) ? $m->content : [] as $b) if (is_object($b) && ($b->type ?? null) === 'text') $texte = ($texte ?? '') . (string)($b->text ?? '');
    return $texte;
}

/** Le dossier d'une trace, ou null. */
function dossierTrace(string $dA, string $audit, string $trace): ?string {
    $dir = preg_match(ID_TRACE, $trace) ? dossierAudit($dA, $audit) : null;
    return $dir !== null && is_file($dir . '/analyses/' . $trace . '/resume.json') ? $dir . '/analyses/' . $trace : null;
}

/** Les resumes des analyses et rejeux d'un audit, les plus recents d'abord. */
function listeTraces(string $dir): array {
    $liste = [];
    foreach (glob($dir . '/analyses/*/resume.json') ?: [] as $f) { $r = lireJson($f); if ($r !== null) $liste[] = $r; }
    usort($liste, fn($a, $b) => strcmp((string)($b['creeLe'] ?? ''), (string)($a['creeLe'] ?? '')));
    return $liste;
}

function messageApi(string $texte): string {
    $d = json_decode($texte, true);
    return is_array($d) && isset($d['error']['message']) ? (string)$d['error']['message'] : mb_substr($texte, 0, 200);
}

function vueBatch(array $b): array {
    return ['id' => $b['id'] ?? null, 'etat' => $b['processing_status'] ?? null, 'compte' => $b['request_counts'] ?? null,
            'creeLe' => $b['created_at'] ?? null, 'finLe' => $b['ended_at'] ?? null, 'expireLe' => $b['expires_at'] ?? null];
}

function fBatch(string $dossierBatches, string $id): string { return $dossierBatches . '/' . $id . '.json'; }

/** La fiche d'un batch, `requetes` toujours en objet (un identifiant « 0 » ferait une liste). */
function ecrireFiche(string $dossierBatches, array $fiche): void {
    $fiche['requetes'] = (object)$fiche['requetes'];
    ecrireJson(fBatch($dossierBatches, $fiche['id']), $fiche);
}

/**
 * Les resultats d'un batch termine ; le journal les recoit une fois, a la premiere lecture. La
 * fiche est verrouillee le temps de le faire : deux lectures simultanees ne journalisent pas deux fois.
 */
function resultats(string $dossierClaude, string $dossierBatches, array $fiche): array {
    [$statut, $texte] = anthropic('GET', '/v1/messages/batches/' . rawurlencode($fiche['id']) . '/results');
    if ($statut !== 200) return ['erreur' => [$statut, $texte]];
    $lus = [];
    $schemas = [];
    $bruts = [];
    foreach (explode("\n", $texte) as $l) {
        if (trim($l) === '') continue;
        $ligne = json_decode($l);
        // Chaque reponse se ramene au schema de son usage (le run d'une facade a le sien dans le batch de l'analyse).
        $usageL = (string)($fiche['requetes'][(string)(is_object($ligne) ? ($ligne->custom_id ?? '') : '')]['usage'] ?? $fiche['usage']);
        if (!array_key_exists($usageL, $schemas)) { try { $schemas[$usageL] = promptEtSchema($usageL, is_array($fiche['brouillonCopie'] ?? null) ? $fiche['brouillonCopie'] : null)[1]['schema']; } catch (RuntimeException $e) { $schemas[$usageL] = null; } }
        $lus[] = lireResultat($ligne, $schemas[$usageL]);
        $bruts[(string)(is_object($ligne) ? ($ligne->custom_id ?? '') : '')] = texteBrut($ligne);
    }
    $fin = is_string($fiche['finLe'] ?? null) ? strtotime($fiche['finLe']) : false;
    $t = $fin !== false ? gmdate('Y-m-d\TH:i:s\Z', $fin) : maintenant();
    $table = tarifs($dossierClaude);
    $sortie = [];
    foreach ($lus as $x) {
        $req = $fiche['requetes'][$x['id']] ?? ['passe' => null, 'images' => 0, 'facades' => 0];
        // Une requete du run d'une facade dans le batch de l'analyse a son usage, son modele, son prompt et son schema.
        $modeleR = (string)($req['modele'] ?? $fiche['modele']);
        $ligneTarif = tarifEnVigueur($table, $modeleR, substr($t, 0, 10));
        $usageR = (string)($req['usage'] ?? $fiche['usage']);
        $sortie[] = $x + ['passe' => $req['passe'], 'usage' => $usageR, 'modele' => $modeleR, 'cout' => coutAppel($x['tokens'], $ligneTarif, true), 'trouve' => trouvailles($x, $usageR),
                          'tarif' => $ligneTarif['depuis'] ?? null, 'images' => $req['images'], 'facades' => (int)($req['facades'] ?? 0),
                          'prompt' => (int)($req['prompt'] ?? $fiche['promptVersion']), 'schema' => (int)($req['schema'] ?? $fiche['schemaVersion']),
                          'empreintes' => is_array($req['empreintes'] ?? null) ? $req['empreintes'] : []];
    }
    $verrou = fopen(fBatch($dossierBatches, $fiche['id']) . '.verrou', 'c');
    if ($verrou) flock($verrou, LOCK_EX);
    $actuelle = lireJson(fBatch($dossierBatches, $fiche['id'])) ?? $fiche;
    if (empty($actuelle['journalise'])) {
        $lignes = [];
        foreach ($sortie as $x) {
            $lignes[] = ['t' => $t, 'organisation' => $fiche['organisation'], 'projet' => $fiche['projet'], 'idu' => $fiche['idu'],
                         'adresse' => $fiche['adresse'], 'audit' => $fiche['audit'], 'usage' => $x['usage'], 'modele' => $x['modele'],
                         'batch' => true, 'idBatch' => $fiche['id'], 'requete' => $x['id'], 'passe' => $x['passe'], 'tokens' => $x['tokens'],
                         'images' => $x['images'], 'facades' => $x['facades'], 'cout' => $x['cout'], 'tarif' => $x['tarif'], 'statut' => $x['statut'],
                         'arret' => $x['arret'], 'prompt' => $x['prompt'], 'schema' => $x['schema'], 'trouve' => $x['trouve'],
                         'empreintes' => array_column($x['empreintes'], 'sha256'), 'reponse' => empreinteReponse($bruts[$x['id']] ?? null),
                         'trace' => is_array($fiche['trace'] ?? null) ? ($fiche['trace']['id'] ?? null) : null]
                         + (($fiche['essai'] ?? false) === true ? ['essai' => true] : []);
        }
        journaliser($dossierClaude, $lignes);
        if (is_array($fiche['trace'] ?? null)) completerTrace($fiche, $sortie, $bruts, $t);
        ecrireFiche($dossierBatches, ['journalise' => true, 'etat' => 'ended', 'finLe' => $fiche['finLe'] ?? null] + $actuelle);
    }
    if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
    // Le modele et les versions d'une reponse sont ceux du batch, sauf pour une requete d'un autre usage (le run d'une facade) : la page
    // les garde avec sa reponse enregistree.
    foreach ($sortie as &$x) {
        unset($x['images'], $x['facades'], $x['tarif'], $x['trouve']);
        if ($x['usage'] === ($fiche['usage'] ?? 'analyse')) unset($x['modele'], $x['prompt'], $x['schema']);
    }
    unset($x);
    return ['sortie' => $sortie];
}

/**
 * La trace d'un batch, completee a la lecture de ses resultats (15.5) : chaque reponse brute et remise en forme dans `sortant.json`,
 * les comptes dans `resume.json`. Un audit retire entre-temps n'a plus de dossier : rien ne s'ecrit.
 */
function completerTrace(array $fiche, array $sortie, array $bruts, string $t): void {
    global $dossierAudits, $dossierClaude;
    $dt = dossierDeReference($dossierAudits, $dossierClaude, is_array($fiche['trace'] ?? null) ? $fiche['trace'] : null);
    if ($dt !== null) finirTrace($dt, array_map('strval', array_keys((array)$fiche['requetes'])), $sortie, $bruts, $t, (string)$fiche['id']);
}

/**
 * La fin d'une trace : `sortant.json` (chaque reponse, son texte brut et son empreinte, sa sortie ramenee au schema) et le resume
 * termine (comptes, cout, tokens), les requetes dans l'ordre `$ordre`.
 */
function finirTrace(string $dt, array $ordre, array $sortie, array $bruts, string $t, ?string $idBatch): void {
    $rang = array_flip($ordre);
    usort($sortie, fn($a, $b) => ($rang[$a['id']] ?? PHP_INT_MAX) <=> ($rang[$b['id']] ?? PHP_INT_MAX));
    $complets = [];
    $resume = [];
    $cout = null;
    $tokens = tokensDeUsage(null);
    foreach ($sortie as $x) {
        $texte = $bruts[$x['id']] ?? null;
        $commun = ['id' => $x['id'], 'passe' => $x['passe'], 'usage' => $x['usage'], 'modele' => $x['modele'], 'statut' => $x['statut'], 'arret' => $x['arret'],
                   'erreur' => $x['erreur'], 'tokens' => $x['tokens'], 'cout' => $x['cout'], 'trouve' => $x['trouve'],
                   'prompt' => $x['prompt'] ?? null, 'schema' => $x['schema'] ?? null, 'refusFormat' => $x['refusFormat'] ?? null,
                   'empreintes' => array_column($x['empreintes'] ?? [], 'sha256'), 'reponse' => empreinteReponse($texte)];
        $complets[] = $commun + ['texte' => $texte, 'sortie' => $x['sortie'], 'tarif' => $x['tarif'] ?? null];
        $resume[] = $commun;
        if ($x['cout'] !== null) $cout = ($cout ?? 0) + $x['cout'];
        foreach ($tokens as $k => $v) $tokens[$k] = $v + (int)($x['tokens'][$k] ?? 0);
    }
    ecrireJson($dt . '/sortant.json', ['format' => 'plan-audit-sortant', 'version' => 1, 'idBatch' => $idBatch, 'finLe' => $t, 'resultats' => $complets]);
    $r = lireJson($dt . '/resume.json') ?? [];
    ecrireJson($dt . '/resume.json', array_merge($r, ['etat' => 'termine', 'finLe' => $t, 'resultats' => $resume, 'cout' => $cout, 'tokens' => $tokens]));
}

// --- La trace de toute requete (lot L0) ----------------------------------------------------------

const DOSSIER_SANS_DEPOT = 'analyses/sans-depot';
// Les traces sans depot se gardent comme le journal : 24 mois, puis leur mois s'efface en entier (images comprises).
const MOIS_GARDES_TRACES = 24;

/** Les images d'une requete verifiee : l'empreinte de leurs octets, leur taille et leur type, dans l'ordre. */
function empreintesRequete(array $r): array {
    $e = [];
    foreach ($r['contenu'] as $b) {
        if (($b['type'] ?? null) !== 'image') continue;
        $octets = (string)base64_decode($b['source']['data'], true);
        $e[] = ['sha256' => hash('sha256', $octets), 'octets' => strlen($octets), 'type' => $b['source']['media_type']];
    }
    return $e;
}

/** L'empreinte du texte brut d'une reponse (le journal la garde a la place du texte), null sans texte. */
function empreinteReponse(?string $texte): ?string { return $texte === null ? null : hash('sha256', $texte); }

/** L'identifiant d'une trace : le jour et l'heure de l'envoi (UTC), le modele, quatre chiffres hexadecimaux. */
function idNouvelleTrace(string $modele, string $t): string {
    $s = strtotime($t);
    return gmdate('Ymd-His', $s === false ? time() : $s) . '-' . nomSur($modele, 'modele', true) . '-' . bin2hex(random_bytes(2));
}

/** Le dossier du mois des traces sans depot d'une organisation : ses traces, et ses images une fois chacune (`images/`). */
function dossierSansDepot(string $dC, string $organisation, string $idTrace): string {
    return $dC . '/' . DOSSIER_SANS_DEPOT . '/' . nomSur($organisation, 'inconnue') . '/' . substr($idTrace, 0, 4) . '-' . substr($idTrace, 4, 2);
}

/**
 * Ou une trace s'ecrit : `[base des images, dossier de la trace, reference]`. Le dossier de l'audit nomme quand il est permis, sinon
 * celui de l'organisation, sans depot. La reference se garde dans la fiche d'un batch (`dossierDeReference`).
 */
function lieuTrace(string $dC, ?string $dirAudit, ?string $audit, string $organisation, string $idTrace): array {
    if ($dirAudit !== null) return [$dirAudit, $dirAudit . '/analyses/' . $idTrace, ['audit' => $audit, 'organisation' => $organisation, 'id' => $idTrace]];
    $base = dossierSansDepot($dC, $organisation, $idTrace);
    return [$base, $base . '/' . $idTrace, ['audit' => null, 'organisation' => $organisation, 'id' => $idTrace]];
}

/** Le dossier d'une trace d'apres sa reference ; null quand elle n'existe plus (audit retire, mois efface). */
function dossierDeReference(string $dA, string $dC, ?array $ref): ?string {
    if (!is_array($ref) || !is_string($ref['id'] ?? null) || !preg_match(ID_TRACE, $ref['id'])) return null;
    if (is_string($ref['audit'] ?? null)) return dossierTrace($dA, $ref['audit'], $ref['id']);
    $dt = dossierSansDepot($dC, (string)($ref['organisation'] ?? ''), $ref['id']) . '/' . $ref['id'];
    return is_file($dt . '/resume.json') ? $dt : null;
}

/** Une trace sans depot, cherchee par son identifiant parmi les organisations ; null sinon. */
function traceSansDepot(string $dC, string $id): ?string {
    if (!preg_match(ID_TRACE, $id)) return null;
    foreach (glob($dC . '/' . DOSSIER_SANS_DEPOT . '/*/' . substr($id, 0, 4) . '-' . substr($id, 4, 2) . '/' . $id . '/resume.json') ?: [] as $f) return dirname($f);
    return null;
}

/** Les versions du prompt et du schema de chaque usage des requetes. */
function versionsDesPrompts(array $prompts): array {
    $v = [];
    foreach ($prompts as $u => [$pU, $sU]) $v[$u] = ['prompt' => $pU['version'], 'schema' => $sU['version']];
    return $v;
}

/**
 * Le resume d'une trace a son envoi. `nature` : `analyse` ou `rejeu` (un batch), `immediat` (un appel immediat : le run d'une facade,
 * une escalade), `rejeu-facade` (un run rejoue depuis son image gardee). L'identite de la parcelle est celle du journal.
 */
function resumeTrace(string $id, array $demande, array $prompts, array $identite, string $nature, string $t, ?string $idBatch): array {
    [$p, $s] = $prompts[$demande['requetes'][0]['usage']] ?? array_values($prompts)[0];
    return ['format' => 'plan-audit-analyse', 'version' => 1, 'id' => $id, 'audit' => $demande['depot'] ?? null, 'nature' => $nature, 'etat' => 'en_cours',
            'creeLe' => $t, 'finLe' => null, 'idBatch' => $idBatch, 'organisation' => $identite['organisation'] ?? null, 'projet' => $identite['projet'] ?? null,
            'idu' => $identite['idu'] ?? null, 'adresse' => $identite['adresse'] ?? null, 'usage' => $demande['usage'], 'modele' => $demande['modele'], 'effort' => EFFORT,
            'prompt' => $p['version'], 'schema' => $s['version'], 'essai' => $demande['essai'] ?? false, 'versions' => (object)versionsDesPrompts($prompts),
            'requetes' => count($demande['requetes']), 'images' => array_sum(array_column($demande['requetes'], 'images')),
            'facades' => array_sum(array_map(fn($r) => ($r['passe'] ?? 1) === 1 ? $r['facades'] : 0, $demande['requetes'])),
            'resultats' => null, 'cout' => null, 'tokens' => null];
}

/** Le debut d'une trace : ce qui part (`entrant.json`, les images rangees une fois sous `$base/images`) et le resume en cours. */
function commencerTrace(string $base, string $dt, array $demande, array $prompts, array $resume): void {
    if (!is_dir($dt)) @mkdir($dt, 0750, true);
    ecrireJson($dt . '/entrant.json', entrantTrace($demande, $prompts, $base));
    ecrireJson($dt . '/resume.json', $resume);
}

/** Les mois (`AAAA-MM`) passes la garde de 24 mois, a la date `$aujourdhui` : le mois courant et les 24 d'avant restent. */
function moisPerimes(array $mois, string $aujourdhui): array {
    $limite = (int)substr($aujourdhui, 0, 4) * 12 + (int)substr($aujourdhui, 5, 2) - 1 - MOIS_GARDES_TRACES;
    return array_values(array_filter($mois, fn($m) => is_string($m) && preg_match('/^\d{4}-\d{2}$/', $m) && (int)substr($m, 0, 4) * 12 + (int)substr($m, 5, 2) - 1 < $limite));
}

/** Efface les mois perimes des traces sans depot, toutes organisations : la garde du journal, appliquee aux traces. */
function purgerSansDepot(string $dC, string $aujourdhui): void {
    foreach (glob($dC . '/' . DOSSIER_SANS_DEPOT . '/*', GLOB_ONLYDIR) ?: [] as $org) {
        $mois = array_map('basename', glob($org . '/*', GLOB_ONLYDIR) ?: []);
        foreach (moisPerimes($mois, $aujourdhui) as $m) effacerDossier($org . '/' . $m);
    }
}

/**
 * Le contenu d'une requete gardee, pret a repartir (le rejeu d'un run depuis son image, lot L0) : ses textes tels quels, ses images
 * relues octet pour octet dans `$base/images`. Une image qui manque refuse le rejeu : on ne renvoie jamais une image refaite.
 */
function contenuRejoue(array $requete, string $base): array {
    $contenu = [];
    foreach (listeDe($requete['contenu'] ?? null) as $b) {
        if (is_array($b) && ($b['type'] ?? null) === 'text' && is_string($b['text'] ?? null)) { $contenu[] = ['type' => 'text', 'text' => $b['text']]; continue; }
        $nom = is_array($b) ? (string)($b['image'] ?? '') : '';
        if (!preg_match(IMAGE_TRACE, $nom) || !is_file($base . '/images/' . $nom)) throw new Refus('L’image gardée de cette requête est introuvable.');
        $contenu[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => (string)$b['media_type'], 'data' => base64_encode((string)file_get_contents($base . '/images/' . $nom))]];
    }
    if (!$contenu) throw new Refus('Cette requête n’a rien gardé à rejouer.');
    return $contenu;
}

/** Les requetes des batches encore ouverts d'une organisation ; ceux finis sont journalises en passant. */
function engagements(string $dossierClaude, string $dossierBatches, string $organisation, bool $avecCle): int {
    $ouverts = 0;
    foreach (scandir($dossierBatches) ?: [] as $n) {
        if (!str_ends_with($n, '.json')) continue;
        $fiche = lireJson($dossierBatches . '/' . $n);
        if ($fiche === null || !empty($fiche['journalise']) || ($fiche['organisation'] ?? null) !== $organisation) continue;
        if ($avecCle) {
            [$statut, $texte] = anthropic('GET', '/v1/messages/batches/' . rawurlencode((string)$fiche['id']));
            $b = $statut === 200 ? json_decode($texte, true) : null;
            if (is_array($b) && ($b['processing_status'] ?? null) === 'ended') {
                $lu = resultats($dossierClaude, $dossierBatches, ['finLe' => $b['ended_at'] ?? null] + $fiche);
                if (!isset($lu['erreur'])) continue;
            }
        }
        $ouverts += count($fiche['requetes'] ?? []);
    }
    return $ouverts;
}

/**
 * Les appels immediats a l'API Messages, en parallele quand cURL est la (trois passes en une
 * dizaine de secondes, pas trente) : pour chaque requete, une ligne au format des resultats d'un
 * batch, que `lireResultat` lit comme les autres.
 */
function appelsImmediats(array $corpsParId): array {
    global $anthropicUrl, $cle;
    $entetes = ['x-api-key: ' . $cle, 'anthropic-version: ' . VERSION_API, 'content-type: application/json'];
    $bruts = [];
    if (function_exists('curl_multi_init')) {
        $multi = curl_multi_init();
        $poignees = [];
        foreach ($corpsParId as $id => $corps) {
            $h = curl_init($anthropicUrl . '/v1/messages');
            curl_setopt_array($h, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => $entetes, CURLOPT_RETURNTRANSFER => true, CURLOPT_POSTFIELDS => $corps,
                                   CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 120]);
            curl_multi_add_handle($multi, $h);
            $poignees[$id] = $h;
        }
        do {
            $etat = curl_multi_exec($multi, $actifs);
            if ($actifs) curl_multi_select($multi, 1.0);
        } while ($actifs && $etat === CURLM_OK);
        foreach ($poignees as $id => $h) {
            $texte = curl_multi_getcontent($h);
            $bruts[$id] = [(int)curl_getinfo($h, CURLINFO_HTTP_CODE), is_string($texte) ? $texte : ''];
            curl_multi_remove_handle($multi, $h);
            curl_close($h);
        }
        curl_multi_close($multi);
    } else {
        foreach ($corpsParId as $id => $corps) $bruts[$id] = anthropic('POST', '/v1/messages', $corps);
    }
    $lignes = [];
    foreach ($bruts as $id => [$statut, $texte]) {
        $m = json_decode($texte);
        if ($statut === 200 && is_object($m)) {
            $lignes[$id] = (object)['custom_id' => (string)$id, 'result' => (object)['type' => 'succeeded', 'message' => $m]];
            continue;
        }
        $e = is_object($m) && isset($m->error) && is_object($m->error) ? $m->error : (object)['type' => $statut === 0 ? 'reseau' : 'http-' . $statut, 'message' => mb_substr($texte, 0, 200)];
        $lignes[$id] = (object)['custom_id' => (string)$id, 'result' => (object)['type' => 'errored', 'error' => (object)['type' => 'error', 'error' => $e]]];
    }
    return $lignes;
}

/**
 * L'appel immediat (le bouton « Demander de l'aide » du releve, spec facades 12 bis) : les memes
 * plafonds qu'un batch, l'API Messages au tarif normal (sans la remise Batch), une ligne de journal
 * par requete, et la reponse au format des resultats d'un batch. Depuis le lot L0, une trace aussi :
 * dans le dossier de l'audit `$dirAudit` quand la demande en nomme un qui est permis, sinon sans depot.
 */
function appelImmediat(string $dossierClaude, string $dossierBatches, array $demande, string $organisation, bool $admin, bool $avecCle, array $p, ?string $dirAudit = null, string $nature = 'immediat'): array {
    $t = maintenant();
    $identite = ['organisation' => $organisation, 'projet' => $demande['projet'] ?? ($admin ? 'admin' : null), 'idu' => $demande['idu'], 'adresse' => $demande['adresse'], 'audit' => $demande['audit']];
    $prompts = promptsDesRequetes($demande['requetes']);
    $premier = $demande['requetes'][0];
    [$p0, $s0] = $prompts[$premier['usage']];
    $ouverts = engagements($dossierClaude, $dossierBatches, $organisation, $avecCle);
    $fait = depenses(lireJournal($dossierClaude, $t), $organisation, substr($t, 0, 10));
    $engage = ($ouverts + count($demande['requetes'])) * $p['estimationRequete'];
    $plafond = plafondDe($p, $organisation);
    if ($fait['jour'] + $engage > $plafond['jour'] || $fait['mois'] + $engage > $plafond['mois']) {
        journaliser($dossierClaude, [['t' => $t] + $identite + ['usage' => $demande['usage'], 'modele' => $premier['modele'], 'batch' => false, 'idBatch' => null, 'requete' => null,
            'passe' => null, 'tokens' => tokensDeUsage(null), 'images' => array_sum(array_column($demande['requetes'], 'images')), 'facades' => 0, 'cout' => 0, 'tarif' => null,
            'statut' => 'plafond', 'arret' => null, 'prompt' => $p0['version'], 'schema' => $s0['version']]]);
        erreur(429, 'BUDGET_EXCEEDED', 'Plafond de l’analyse atteint pour aujourd’hui ou ce mois-ci.', ['depense' => $fait, 'engage' => $engage, 'plafond' => $plafond]);
    }
    // La trace (lot L0) : ce qui part, avant l'envoi ; ce qui revient la completera.
    $idTrace = idNouvelleTrace($premier['modele'], $t);
    [$base, $dt] = lieuTrace($dossierClaude, $dirAudit, $demande['depot'] ?? null, $organisation, $idTrace);
    if ($dirAudit === null) purgerSansDepot($dossierClaude, substr($t, 0, 10));
    commencerTrace($base, $dt, $demande, $prompts, resumeTrace($idTrace, $demande, $prompts, $identite, $nature, $t, null));
    $empreintes = [];
    foreach ($demande['requetes'] as $r) $empreintes[$r['id']] = empreintesRequete($r);
    $corps = fn(array $r, bool $structuree) => (string)json_encode(parametresRequete($r['modele'], $prompts[$r['usage']][0]['texte'], $prompts[$r['usage']][1]['schema'], $r['contenu'],
                                                                                     $structuree, $prompts[$r['usage']][1]['exemple'] ?? null), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $structurees = [];
    $envoi = [];
    foreach ($demande['requetes'] as $r) {
        $structurees[$r['id']] = in_array($r['usage'], SORTIE_STRUCTUREE, true);
        $envoi[$r['id']] = $corps($r, $structurees[$r['id']]);
    }
    $lignesApi = appelsImmediats($envoi);
    // La sortie structuree refusee : une seconde fois sans elle (une erreur 400 ne coute rien).
    $repli = [];
    $refus = [];
    foreach ($demande['requetes'] as $r) {
        $m = $structurees[$r['id']] ? formatRefuse($lignesApi[$r['id']] ?? null) : null;
        if ($m !== null) { $repli[$r['id']] = $corps($r, false); $structurees[$r['id']] = false; $refus[$r['id']] = $m; }
    }
    if ($repli) $lignesApi = appelsImmediats($repli) + $lignesApi;
    $table = tarifs($dossierClaude);
    $journal = [];
    $resultats = [];
    $sortie = [];
    $bruts = [];
    foreach ($demande['requetes'] as $r) {
        [$pR, $sR] = $prompts[$r['usage']];
        $x = lireResultat($lignesApi[$r['id']] ?? null, $sR['schema']);
        $bruts[$r['id']] = texteBrut($lignesApi[$r['id']] ?? null);
        $ligneTarif = tarifEnVigueur($table, $r['modele'], substr($t, 0, 10));
        $cout = coutAppel($x['tokens'], $ligneTarif, false);
        $trouve = trouvailles($x, $r['usage']);
        $journal[] = ['t' => $t] + $identite + ['usage' => $r['compte'] ?? $r['usage'], 'modele' => $r['modele'], 'batch' => false, 'idBatch' => null, 'requete' => $r['id'], 'passe' => $r['passe'],
            'tokens' => $x['tokens'], 'images' => $r['images'], 'facades' => $r['facades'], 'cout' => $cout, 'tarif' => $ligneTarif['depuis'] ?? null, 'statut' => $x['statut'],
            'arret' => $x['arret'], 'prompt' => $pR['version'], 'schema' => $sR['version'], 'trouve' => $trouve,
            'structuree' => $structurees[$r['id']], 'refusFormat' => $refus[$r['id']] ?? null,
            'empreintes' => array_column($empreintes[$r['id']], 'sha256'), 'reponse' => empreinteReponse($bruts[$r['id']]), 'trace' => $idTrace];
        $resultats[] = ['id' => $r['id'], 'statut' => $x['statut'], 'arret' => $x['arret'], 'tokens' => $x['tokens'], 'sortie' => $x['sortie'], 'erreur' => $x['erreur'],
                        'passe' => $r['passe'], 'usage' => $r['compte'] ?? $r['usage'], 'cout' => $cout, 'structuree' => $structurees[$r['id']],
                        'refusFormat' => $refus[$r['id']] ?? null, 'empreintes' => $empreintes[$r['id']]];
        $sortie[] = $x + ['passe' => $r['passe'], 'usage' => $r['compte'] ?? $r['usage'], 'modele' => $r['modele'], 'cout' => $cout, 'trouve' => $trouve, 'tarif' => $ligneTarif['depuis'] ?? null,
                          'prompt' => $pR['version'], 'schema' => $sR['version'], 'refusFormat' => $refus[$r['id']] ?? null, 'empreintes' => $empreintes[$r['id']]];
    }
    journaliser($dossierClaude, $journal);
    finirTrace($dt, array_column($demande['requetes'], 'id'), $sortie, $bruts, $t, null);
    return ['modele' => $premier['modele'], 'prompt' => $p0['version'], 'schema' => $s0['version'], 'trace' => $idTrace, 'resultats' => $resultats];
}

// --- Les donnees d'analyse (lot L0, MD/spec-lecture-ia-elargie.md 4.8) --------------------------
// L'export « données d'analyse » de l'administrateur (`GET admin/claude/donnees-analyse`) : a travers tous les audits et les traces
// sans depot d'une periode, une ligne par requete (une passe, le run d'une facade, une escalade, un rejeu), et une ligne par
// proposition des audits recus dans la periode, avec ce qui en a ete fait. Les images n'y sont que par leur empreinte : elles se
// demandent une a une (`GET admin/claude/images/<sha256>.<ext>`). Rien n'est recalcule : les traces et les conclusions sont relues.

const FORMAT_DONNEES_ANALYSE = 'plan-donnees-analyse';

/** Le batiment et la facade d'une requete d'apres son identifiant : `b0-f2-p1` -> `b0`, 2 ; `b1-p3` -> `b1`, null. */
function batimentEtFacade(string $id): array {
    $sans = (string)preg_replace('/-p\d+$/', '', $id);
    return preg_match('/^(.*)-f(\d+)$/', $sans, $m) ? ['batiment' => $m[1], 'facade' => (int)$m[2]] : ['batiment' => $sans, 'facade' => null];
}

/** L'empreinte d'une image gardee d'apres son nom (`<sha256>.jpg`). */
function empreinteDuNom(string $nom): string { return (string)preg_replace('/\.[a-z]+$/', '', $nom); }

/**
 * Les lignes d'une trace : une par reponse revenue (une trace en cours n'en a pas encore), l'identite de la parcelle prise a la fiche de
 * l'audit quand la trace en a une, les empreintes des images lues dans l'entrant, celle de la reponse recalculee sur son texte brut.
 */
function lignesDeTrace(array $resume, ?array $entrant, ?array $sortant, ?array $fiche): array {
    $images = [];
    $octets = [];
    foreach (listeDe($entrant['requetes'] ?? null) as $q) {
        if (!is_array($q)) continue;
        $blocs = array_filter(listeDe($q['contenu'] ?? null), fn($b) => is_array($b) && ($b['type'] ?? null) === 'image' && is_string($b['image'] ?? null));
        $images[(string)($q['id'] ?? '')] = array_values(array_map(fn($b) => empreinteDuNom((string)$b['image']), $blocs));
        // Le volume garde (risque 12 de la spec) : les octets des images de la requete, tels qu'ils sont partis.
        $octets[(string)($q['id'] ?? '')] = array_sum(array_map(fn($b) => (int)($b['octets'] ?? 0), $blocs));
    }
    $versions = is_array($resume['versions'] ?? null) ? $resume['versions'] : [];
    $lignes = [];
    foreach (listeDe($sortant['resultats'] ?? null) as $x) {
        if (!is_array($x)) continue;
        $id = (string)($x['id'] ?? '');
        $usageRequete = null;
        foreach (listeDe($entrant['requetes'] ?? null) as $q) if (is_array($q) && ($q['id'] ?? null) === $id) $usageRequete = $q['usage'] ?? null;
        $v = $versions[$usageRequete ?? ($x['usage'] ?? '')] ?? null;
        $texte = is_string($x['texte'] ?? null) ? $x['texte'] : null;
        $lignes[] = ['nature' => 'requete', 'trace' => $resume['id'] ?? null, 'lot' => $resume['nature'] ?? null, 'audit' => $resume['audit'] ?? null,
                     'organisation' => $resume['organisation'] ?? null, 'idu' => $fiche['idu'] ?? ($resume['idu'] ?? null), 'adresse' => $fiche['adresse'] ?? ($resume['adresse'] ?? null),
                     't' => $resume['creeLe'] ?? null, 'finLe' => $sortant['finLe'] ?? null, 'idBatch' => $resume['idBatch'] ?? null, 'requete' => $id] + batimentEtFacade($id)
                   + ['passe' => $x['passe'] ?? null, 'usage' => $x['usage'] ?? null, 'usageRequete' => $usageRequete ?? ($x['usage'] ?? null), 'modele' => $x['modele'] ?? null,
                      'prompt' => $x['prompt'] ?? ($v['prompt'] ?? null), 'schema' => $x['schema'] ?? ($v['schema'] ?? null), 'essai' => ($resume['essai'] ?? false) === true,
                      'statut' => $x['statut'] ?? null, 'arret' => $x['arret'] ?? null, 'erreur' => $x['erreur'] ?? null, 'tokens' => $x['tokens'] ?? null, 'cout' => $x['cout'] ?? null,
                      'refusFormat' => $x['refusFormat'] ?? null, 'empreintes' => $images[$id] ?? [], 'octets' => $octets[$id] ?? 0, 'reponse' => empreinteReponse($texte),
                      'trouve' => $x['trouve'] ?? null, 'sortie' => $x['sortie'] ?? null, 'texte' => $texte];
    }
    return $lignes;
}

/** Les lignes de la periode (le jour de l'envoi) au modele et a l'usage demandes. */
function filtrerDonneesAnalyse(array $lignes, array $f): array {
    return array_values(array_filter($lignes, function ($l) use ($f) {
        $j = substr((string)($l['t'] ?? ''), 0, 10);
        return $j >= $f['du'] && $j <= $f['au'] && ($f['modele'] === null || ($l['modele'] ?? null) === $f['modele']) && ($f['usage'] === null || ($l['usage'] ?? null) === $f['usage']);
    }));
}

/** Les lignes des propositions d'un audit, d'apres sa conclusion (`decisions.json`, version 2) : ce qui a ete propose et ce qui en a ete fait. */
function lignesPropositions(array $decisions, array $fiche): array {
    $lignes = [];
    foreach (listeDe($decisions['propositions'] ?? null) as $p) {
        if (!is_array($p)) continue;
        $cible = is_array($p['cible'] ?? null) ? $p['cible'] : [];
        $lignes[] = ['nature' => 'proposition', 'audit' => $fiche['id'] ?? null, 'organisation' => $fiche['organisation'] ?? null, 'idu' => $fiche['idu'] ?? null,
                     'adresse' => $fiche['adresse'] ?? null, 't' => $fiche['recuLe'] ?? null, 'proposition' => $p['id'] ?? null, 'objet' => $p['objet'] ?? null,
                     'batiment' => $cible['cle'] ?? null, 'facade' => isset($cible['cote']) && is_int($cible['cote']) ? $cible['cote'] : null, 'effet' => $p['effet'] ?? null,
                     'source' => $p['source'] ?? null, 'avant' => $p['avant'] ?? null, 'apres' => $p['apres'] ?? null, 'confiance' => $p['confiance'] ?? null,
                     'reserve' => $p['reserve'] ?? null, 'decision' => $p['decision'] ?? null, 'moteur' => $p['moteur'] ?? null, 'accordClaude' => $p['accordClaude'] ?? null];
    }
    return $lignes;
}

/** La conclusion d'un audit pour l'export : `decisions.json`, refaite depuis le fichier quand elle est d'avant la version 2. */
function decisionsPourExport(string $dir): ?array {
    $d = lireJson($dir . '/decisions.json');
    if (is_array($d) && ($d['version'] ?? 0) >= VERSION_DECISIONS_AUDIT) return $d;
    $audit = lireJson($dir . '/audit.json');
    if ($audit === null) return $d;
    try { verifierAudit($audit); } catch (Refus $e) { return $d; }
    $refaite = decisionsAudit($audit);
    ecrireJson($dir . '/decisions.json', $refaite);
    return $refaite;
}

/** L'export de la periode : les traces de tous les audits et celles sans depot, puis les propositions des audits recus. */
function donneesAnalyse(string $dA, string $dC, array $f, string $t): array {
    $requetes = [];
    $propositions = [];
    foreach (indexAudits($dA) as $id => $fiche) {
        $dir = is_array($fiche) && is_string($fiche['dossier'] ?? null) ? $dA . '/' . $fiche['dossier'] : null;
        if ($dir === null || !is_dir($dir)) continue;
        foreach (glob($dir . '/analyses/*/resume.json') ?: [] as $fr) {
            $r = lireJson($fr);
            if ($r !== null) array_push($requetes, ...lignesDeTrace($r, lireJson(dirname($fr) . '/entrant.json'), lireJson(dirname($fr) . '/sortant.json'), $fiche));
        }
        $jour = substr((string)($fiche['recuLe'] ?? ''), 0, 10);
        if (($fiche['nature'] ?? 'parcelle') === 'parcelle' && $jour >= $f['du'] && $jour <= $f['au']) {
            $d = decisionsPourExport($dir);
            if ($d !== null) array_push($propositions, ...lignesPropositions($d, $fiche + ['id' => (string)$id]));
        }
    }
    foreach (moisEntre($f['du'], $f['au']) as $m) {
        foreach (glob($dC . '/' . DOSSIER_SANS_DEPOT . '/*/' . $m . '/*/resume.json') ?: [] as $fr) {
            $r = lireJson($fr);
            if ($r !== null) array_push($requetes, ...lignesDeTrace($r, lireJson(dirname($fr) . '/entrant.json'), lireJson(dirname($fr) . '/sortant.json'), null));
        }
    }
    $requetes = filtrerDonneesAnalyse($requetes, $f);
    usort($requetes, fn($a, $b) => [(string)$a['t'], (string)$a['trace'], (string)$a['requete']] <=> [(string)$b['t'], (string)$b['trace'], (string)$b['requete']]);
    usort($propositions, fn($a, $b) => [(string)$a['t'], (string)$a['audit']] <=> [(string)$b['t'], (string)$b['audit']]);
    return ['format' => FORMAT_DONNEES_ANALYSE, 'version' => 1, 'genereLe' => $t, 'du' => $f['du'], 'au' => $f['au'],
            'filtres' => ['modele' => $f['modele'], 'usage' => $f['usage']], 'requetes' => $requetes, 'propositions' => $propositions];
}

/** Une image gardee, par son nom : dans le dossier de l'audit nomme, sinon parmi les traces sans depot ; null sinon. */
function imageGardee(string $dA, string $dC, ?string $audit, string $nom): ?string {
    if (!preg_match(IMAGE_TRACE, $nom)) return null;
    if ($audit !== null) {
        $dir = preg_match(ID_AUDIT, $audit) ? dossierAudit($dA, $audit) : null;
        return $dir !== null && is_file($dir . '/images/' . $nom) ? $dir . '/images/' . $nom : null;
    }
    foreach (glob($dC . '/' . DOSSIER_SANS_DEPOT . '/*/*/images/' . $nom) ?: [] as $f) return $f;
    return null;
}

function lireCorps(int $max) {
    $texte = (string)file_get_contents('php://input', false, null, 0, $max + 1);
    if (strlen($texte) > $max) erreur(413, 'TOO_LARGE', 'Demande trop grosse (48 Mo au plus).');
    $d = json_decode($texte, true);
    if ($d === null) throw new Refus('JSON illisible.');
    return $d;
}

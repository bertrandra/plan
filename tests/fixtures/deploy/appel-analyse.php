<?php
// Le banc des fonctions d'analyse.php (deploy/analyse-fonctions.php), appelees une a une sans requete
// HTTP : l'entree standard porte `[{"f": nom, "a": [arguments]}…]`, la sortie la liste des resultats,
// `{"v": valeur}` ou `{"refus": message, "statut": code}`. Les objets JSON arrivent en tableaux
// associatifs, comme analyse.php lit une demande (`json_decode(…, true)`) ; avec `"objets": true`, en
// objets, comme il lit un schema (promptEtSchema), pour que `{}` reste `{}`.

// erreur() appartient a qui inclut les fonctions : ici, un refus qui remonte au lieu de repondre.
final class Repondu extends Exception {
    public int $statut;
    public function __construct(int $statut, string $message) { parent::__construct($message); $this->statut = $statut; }
}
function erreur(int $statut, string $code, string $message, array $plus = []): void { throw new Repondu($statut, $message); }

require __DIR__ . '/../../../deploy/donnees.php';
require __DIR__ . '/../../../deploy/analyse-fonctions.php';

$texte = (string)stream_get_contents(STDIN);
$appels = json_decode($texte, true);
$enObjets = json_decode($texte);
$sortie = [];
foreach (is_array($appels) ? $appels : [] as $i => $appel) {
    // Les constantes se lisent comme des appels : `{"c": nom}`.
    if (isset($appel['c'])) { $sortie[] = ['v' => constant($appel['c'])]; continue; }
    try {
        $arguments = !empty($appel['objets']) ? $enObjets[$i]->a : ($appel['a'] ?? []);
        $sortie[] = ['v' => call_user_func_array($appel['f'], $arguments)];
    } catch (Repondu $e) {
        $sortie[] = ['refus' => $e->getMessage(), 'statut' => $e->statut];
    } catch (Refus $e) {
        $sortie[] = ['refus' => $e->getMessage(), 'statut' => 400];
    }
}
echo json_encode($sortie, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);

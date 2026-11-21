# Revue d'ergonomie et de style du board (2026-11-21)

Revue page par page des captures (ordinateur et mobile, données simulées), avec le skill `.claude/skills/ui-review`. Fait dans la même passe : Veille (liste) et fiche d'un élément. Le reste est à reprendre vue par vue.

## Ce qui marche

- **Tokens.** L'or ne sert qu'en fond, et le texte d'accent a son propre token.
- **Cibles et formes.** Les cibles de clic sont suffisantes, et les boutons pilule, les rayons et les ombres sont les mêmes partout.
- **Types de contenu.** Chaque type a sa couleur et est toujours nommé en texte.
- **Connexions.** Le motif « Gérer » replie les services déjà réglés.
- **Profil.** Il applique le style `danger` à la suppression de compte.

## Constats transverses

| Sévérité | Constat                                                                                                                     | Correction                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Haute    | Trop de boutons dorés : un par carte dans les listes, par section dans les réglages. Plus rien ne ressort.                  | Un `primary` par vue ou par formulaire. Dans les listes, `data-size="small"`.                                    |
| Haute    | Tuiles de score et liserés de carte différents entre Veille, Conversations et Création.                                     | Un même motif de carte (liseré du type de contenu) et un seul style de score.                                    |
| Haute    | Aides éloignées de leur champ (Diffusion > LinkedIn, Tri > types).                                                          | Une `.hint` sous chaque champ, reliée par `aria-describedby`.                                                    |
| Moyenne  | Titres de section construits de trois façons (`legend` à cheval sur la bordure, `h2` dans la carte, `h2` hors de la carte). | Titre visible dans la carte, `legend` masquée visuellement.                                                      |
| Moyenne  | « Supprimer », « Retirer ce type », « Supprimer la clé » ont l'air de boutons neutres.                                      | `data-variant="danger"`, en fin de rangée.                                                                       |
| Moyenne  | Erreurs et états de clé affichés de façons différentes (texte rouge gras ou maigre, lien vert, texte seul).                 | Badges `data-tone` avec point pour les états. Pour les erreurs, une `.notice` de ton danger.                     |
| Moyenne  | Liens pas toujours soulignés (« Où trouver cette clé ? »). Titres de carte soulignés sur certaines pages, pas sur d'autres. | Souligner tout lien en ligne. Une règle unique pour les titres de carte.                                         |
| Basse    | Boutons « Enregistrer » grisés tant que rien n'a changé : peu lisibles, sans explication.                                   | À trancher : enregistrement automatique avec « Enregistré », ou bouton affiché seulement après une modification. |
| Basse    | Largeurs de page variables (Profil, Connexions, le reste).                                                                  | Une ou deux largeurs de contenu, en tokens.                                                                      |

## Par page (à reprendre)

- **Aujourd'hui** :
  - les tuiles sans ligne secondaire ont un vide entre le chiffre et le libellé ;
  - un thème sans rien en attente prend autant de place qu'un autre ; le replier en « Rien en attente ».
- **Aperçu** :
  - le texte « En pause, Pann ne collecte plus… » s'affiche alors que le thème tourne ; le garder pour la confirmation de pause ;
  - sur mobile, « Mettre en pause » passe en dernier.
- **Conversations** :
  - le badge « Répondre » répète le bouton « À répondre » ;
  - l'extrait est trop long et masque l'angle de réponse ;
  - sur mobile, garder les boutons sur une ligne.
- **Création** : « Nouveau post » à mettre en premier, ou dans un `.page-head`.
- **Calendrier** :
  - deux niveaux d'onglets au même style ;
  - les posts de Création sont à part de la liste des dates ;
  - Liste/Semaine gagnerait à devenir un sélecteur segmenté.
- **Réglages, Général** :
  - les boutons « Retirer » sont plus grands que les langues ;
  - les descriptions des outils sont décollées de leurs cases.
- **Réglages, Sources** :
  - pas d'espace avant « Sources de conversations » ;
  - trois boutons de même poids par source.
- **Réglages, Tri** : la page fait environ 2 900 px ; présenter chaque type sur une ligne, avec une modification dépliable.
- **Réglages, Publication** :
  - le fuseau horaire est tronqué ;
  - les erreurs de compte n'ont pas d'icône.
- **Connexions** : la page fait environ 3 900 px ; replier aussi les services non réglés, derrière « Configurer ».

## Fait dans cette passe

- **Veille** :
  - le titre et « Ajouter un lien » sont sur une même ligne (`.page-head`) ;
  - les cartes sont plus compactes, avec le liseré du type ;
  - le titre mène à la fiche et le site à la source ;
  - l'analyse est en retrait ;
  - la date, le site et les boutons (petits) sont sur une même ligne ;
  - l'état de la rédaction est un badge ;
  - « Contenu promotionnel » est en ton neutre.
- **Fiche** :
  - en-tête en trois temps : état, analyse, puis outils (source, Création, type de contenu) ;
  - la Diffusion remonte juste après l'état de la rédaction, avec un liseré doré d'étape suivante ;
  - les posts passent avant les résumés ;
  - le liseré de l'état de la rédaction était écrasé par `.block` : il est corrigé.

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
- Carte « Rédaction prête » :
  - deux lignes au lieu d'un grand bloc ;
  - icône alignée sur le titre, bouton « Relancer » petit à droite ;
  - sur la deuxième ligne, ce qui est conservé et « Fournir le texte de la source ».
- Brouillons de posts :
  - l'état du post (badge) passe au-dessus du texte au lieu de flotter sous le premier commentaire ;
  - chaque réseau est séparé par un filet et plus d'espace.
- **Aujourd'hui** :
  - le chiffre et le libellé d'une tuile restent groupés, même quand une tuile voisine est plus haute ;
  - une flèche dit que la tuile mène quelque part ;
  - un thème sans rien en attente tient sur une ligne, « Rien en attente pour l'instant. ».
- **Aperçu** :
  - « Mettre en pause » (petit) passe sous l'état, sur ordinateur comme sur mobile, avec son effet en retrait à côté ;
  - en pause, l'effet de la reprise reprend la taille du texte courant.
- **Conversations** :
  - même carte que la Veille, avec le liseré du type, le même style de score, les métadonnées et les boutons (petits) sur une ligne ;
  - « Comment aider » passe avant l'extrait, réduit à deux lignes en citation discrète ;
  - le badge « Répondre » ne s'affiche plus (le bouton le dit) ; seuls « Surveiller » et « Passer » gardent un badge ;
  - sur mobile, les boutons tiennent sur une ligne.
- **Création** :
  - le titre et les actions sont dans un `.page-head`, « Nouveau post » en premier, « Planifier une série » en petit ;
  - chaque groupe (Idées, Brouillons, Programmés, Publiés) a une ligne d'explication, même espacement.

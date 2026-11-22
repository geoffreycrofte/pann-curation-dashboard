# Découverte de l'app, onboarding et architecture de l'information

Étude du 2026-11-16, regard UX (ergonomie, utilisabilité, architecture de l'information). Elle part du code du board tel qu'il est (`apps/board/src`), des libellés réels (`i18n/fr.ts`) et du schéma de configuration d'un thème (`packages/shared/src/topic-config.ts`). Les faits sur Buffer, Hootsuite et Publer sont sourcés et datés en fin de document ; tout le reste est une recommandation ou une hypothèse, signalée comme telle.

## En bref

- **Le premier lancement est un cul-de-sac** : une personne invitée arrive sur « Thèmes » avec « Aucun thème pour l'instant. », sans bouton. La création demande deux noms, un budget en dollars et des « critères de pertinence » avant de montrer quoi que ce soit, puis envoie sur une page Sources qui suppose de savoir ce qu'est une recherche Exa. Le premier élément trié peut arriver le lendemain.
- **Le produit a changé, l'interface raconte encore l'ancien** : le slogan dit « Outil de curation de veille », l'intro de création parle d'un « sujet de veille », alors qu'un thème est désormais un produit à faire connaître avec plusieurs outils.
- **Recommandation onboarding** : un parcours en 4 écrans (objectif, réseaux, conversation, vérification), avec l'objectif **avant** les réseaux, une conversation bornée qui remplit la configuration puis un écran de relecture où rien n'est enregistré sans accord explicite. Aucune clé de service demandée pendant le parcours.
- **Recommandation architecture** : séparer « faire » et « régler ». Par thème : Aperçu, puis les outils (Veille, Conversations, Création), un Calendrier commun, et des Réglages regroupés par sujet plutôt que par outil. Une version allégée, faisable en une à deux semaines, est proposée.
- **Création de posts** : ne pas affronter Buffer, Hootsuite et Publer sur le nombre de réseaux ni sur l'analytique, mais sur **le fond** : des posts ancrés dans des sources vérifiées, nourris par la veille et les conversations du thème, dans la voix réglée par l'utilisateur, avec un contrôle d'accessibilité des posts.

---

## 1. Diagnostic

### 1.1 Ce que voit une nouvelle personne, écran par écran

| Étape          | Écran et libellés réels                                                                                                                                                               | Problème                                                                                                                                                                                                                                                                                                                            | Gravité  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Connexion      | `LoginView`, page publique « sur invitation »                                                                                                                                         | Rien à redire : lien magique, pas de mot de passe (bon pour WCAG 3.3.8).                                                                                                                                                                                                                                                            |          |
| Arrivée        | `HomeView` : h1 « Thèmes », puis « Aucun thème pour l'instant. »                                                                                                                      | État vide sans action : le seul chemin est « + Nouveau thème » dans la barre latérale, qu'il faut trouver. Rien n'explique ce qu'est un thème ni ce que Glimr va faire.                                                                                                                                                             | Critique |
| Création       | `NewTopicView` : « Nom en français » et « Nom en anglais » (tous deux obligatoires), « Langues de publication », « Critères de pertinence », « Plafond mensuel (en dollars US) » à 10 | Deux noms obligatoires même si l'on ne publie qu'en français. Un budget demandé avant toute valeur perçue. « Critères de pertinence » est du vocabulaire d'outil, pas de la personne. Les outils (curation, engagement) ne sont pas proposés : la curation est active d'office, l'engagement caché dans Réglages du thème, Général. | Majeure  |
| Après création | Redirection vers Sources (`?new=1`) : « Étape suivante : ajoutez ses sources (flux RSS, recherches Exa, dépôts GitHub) »                                                              | La personne doit connaître l'adresse d'un flux, ou ce qu'est Exa (qui demande une clé). La fréquence par défaut est de 24 h : sans « Collecter maintenant », le tri reste vide jusqu'au lendemain.                                                                                                                                  | Critique |
| Tri            | `BoardView` : bandeau « Le tri par IA est en attente : aucune clé Anthropic n'est configurée »                                                                                        | La clé Anthropic est « Indispensable » mais n'est demandée nulle part dans le parcours : on la découvre par un bandeau, après coup.                                                                                                                                                                                                 | Majeure  |
| Publication    | Connexions (espace) puis Réglages de la curation, Diffusion (thème)                                                                                                                   | Publier demande deux endroits : connecter un compte dans Connexions, puis cocher compte et langue dans les réglages du thème. Le lien entre les deux n'est fait que par un texte d'aide.                                                                                                                                            | Majeure  |

Le **temps jusqu'au premier résultat utile** (un élément pertinent à trier) dépend aujourd'hui de quatre savoirs que la personne n'a pas : ce qu'est un thème, où trouver des flux, quelles clés brancher, et qu'il faut lancer une collecte. C'est le principal frein à la découverte.

### 1.2 Arborescence actuelle

```
Barre latérale
├── Thèmes
│   ├── <Thème courant>
│   │   ├── Curation            → /t/:id (Tri)
│   │   │   └── TopicNav : Tri | Diffusion | Newsletter | Sources | Réglages
│   │   │       ├── Tri : À trier | Validés | Programmés | Rejetés | Publiés | Archivés
│   │   │       ├── Sources : Sources | Exclusions
│   │   │       └── Réglages : Types de contenu | Collecte | Tri par IA | Rédaction par IA
│   │   │                      | Diffusion | Newsletter | Flux publics
│   │   ├── Engagement          → /t/:id/engagement (onglets dans la page)
│   │   │   └── Conversations | Sources | Réglages du tri
│   │   └── Réglages du thème   → Général | Produit | Budget
│   └── + Nouveau thème
└── Réglages
    ├── Profil
    └── Connexions
```

### 1.3 Ce qui gêne dans cette structure

1. **Trois « Réglages » à trois niveaux** : le groupe « Réglages » de la barre latérale (Profil, Connexions), « Réglages du thème » et l'onglet « Réglages » de la curation, plus « Réglages du tri » dans l'engagement. La personne doit savoir si un réglage appartient à l'espace, au thème ou à l'outil. Exemple : le fuseau horaire et les créneaux sont dans Réglages de la curation, Diffusion, alors qu'ils servent aussi la newsletter et serviront demain à la création de posts.
2. **Quatre « Diffusion »** : la page Diffusion (file d'attente), l'onglet Programmés du Tri (la même file, vue autrement), l'onglet Diffusion des réglages et le groupe « Diffusion sur les réseaux » de Connexions. Diffusion et Programmés montrent la même chose à deux endroits.
3. **Deux modèles de navigation pour deux outils frères** : la curation a des routes et une barre de segments (`TopicNav`), l'engagement a des onglets dans une seule page. Sources existe deux fois, avec deux interfaces.
4. **Un thème sans curation s'ouvre sur un message d'erreur** : dans la barre latérale, un thème qui n'est pas le thème courant pointe toujours vers `board`. Un thème « engagement seul » s'ouvre donc sur « La curation est désactivée pour ce thème. »
5. **La fiche Produit est sous-exposée** : rangée entre Général et Budget, elle est pourtant la pièce maîtresse d'un outil de marketing par thème, et sera centrale pour la création de posts.
6. **Nommage** : « workspace » en anglais dans Connexions (« propre à votre workspace ») et « espace de travail » dans Profil ; « Curation » est un anglicisme peu parlant en français ; « Engagement » ne dit pas ce que l'on y fait (lire des conversations) ; « Tri » désigne à la fois l'écran principal et l'étape d'IA (« Tri par IA »).
7. **Profondeur** : régler les règles de style des posts demande Thème, Curation, Réglages, Rédaction par IA : quatre niveaux, dont deux rangées d'onglets superposées.

### 1.4 Ce qui marche et doit rester

- Une base d'accessibilité solide (lien d'évitement, focus sur le h1 à chaque navigation, onglets en activation manuelle gardés dans l'adresse, toasts en `role="status"`, confirmations avant toute publication), à réutiliser telle quelle dans le parcours.
- Des libellés neutres et clairs (« À trier », « Valider »), des aides honnêtes sur les coûts et l'irréversible, et le garde-fou de l'engagement toujours visible.

---

## 2. Onboarding

### 2.1 Principes

- **Ordre : objectif, puis réseaux, puis contexte.** Je recommande d'inverser les deux premières questions du brief. Le choix des outils change le sens de la question des réseaux : pour la veille et la création, ce sont des réseaux où **publier** ; pour les conversations, des réseaux où **écouter** (Hacker News, Bluesky), et Glimr n'y publie jamais. Poser l'objectif d'abord évite une question ambiguë.
- **Aucune clé, aucun budget pendant le parcours.** Ce qui demande une clé devient une ligne de la liste de démarrage, après coup. Le budget prend sa valeur par défaut (10 $) et s'affiche dans l'écran de relecture.
  - _Ajout du 2026-11-17, modèle d'offres de Geoffrey (`docs/CONTEXT.md`, section 12)_ : ce principe dépend de l'offre. Avec l'offre « clés personnelles », le budget reste en dollars et les clés arrivent dans la liste de démarrage, comme décrit ici. Avec les offres où Glimr fournit l'IA, il n'y a ni clé ni dollar : le parcours montre un budget en tokens tiré du quota de l'offre, et la conversation de cadrage est incluse (la question « qui paie l'IA de l'onboarding » ne se pose plus). Le choix de l'offre devient donc une étape à placer dans le parcours, à définir avec la tarification.
- **Rien n'est enregistré avant la relecture.** Le parcours garde un brouillon ; l'écran final montre tout ce qui va être écrit dans `topics.config`, modifiable.
- **Toute réponse se règle ensuite** : chaque écran le dit, et chaque valeur déduite renvoie au réglage qui la porte.
- **Quand ?** À la première connexion d'un espace sans thème (redirection automatique), et à chaque « Nouveau thème ». Les thèmes existants ne le voient pas, mais peuvent lancer l'assistant depuis leurs réglages (voir 2.6).

Route proposée : `/topics/new` garde son adresse, l'étape vit dans l'adresse (`?step=goal|networks|chat|review`) comme les onglets actuels, pour que Retour du navigateur et rechargement fonctionnent.

### 2.2 Écran 1 : objectif

- **Titre (h1)** : « Que voulez-vous faire avec Glimr ? »
- **Indicateur** : « Étape 1 sur 4 », sous forme de liste ordonnée avec `aria-current="step"`.
- **Champ préalable, sur le même écran** : « Que voulez-vous faire connaître ? » (un seul champ : nom du produit ou du sujet) et « Adresse du site (facultatif) ». Le nom dans l'autre langue sera proposé par la conversation et relu à la fin : on ne demande plus deux noms.
- **Choix multiples (cases à cocher), au moins un** :

| Libellé proposé                            | Aide sous le libellé                                                                                                       | Effet dans `topics.config`                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Partager la veille de mon domaine          | « Glimr collecte l'actualité de votre sujet, la trie, et rédige les posts et la newsletter. Vous choisissez ce qui part. » | `modules.curation = true`                          |
| Répondre à des conversations sur mon sujet | « Glimr repère des discussions où vous pouvez aider. Vous répondez vous-même : Glimr ne publie jamais à votre place. »     | `modules.engagement = true`                        |
| Créer mes propres posts                    | « Vous donnez un sujet, Glimr fait les recherches et rédige des posts sourcés, dans votre style. »                         | `modules.compose = true` (nouvel outil, section 4) |

- **Valeur par défaut** : rien de coché. Une case précochée pousserait vers un outil payant à l'usage sans choix explicite. Message si rien n'est coché à la validation : « Choisissez au moins une activité. Vous pourrez en ajouter d'autres plus tard. » (`role="alert"` sous le groupe, groupe marqué `aria-invalid`, focus renvoyé sur la première case).
- **Actions** : « Continuer » ; pas de « Passer » ici (sans objectif, aucun outil n'est actif).
- Tant que l'outil Création n'existe pas, sa case s'affiche avec « Bientôt disponible, voulez-vous être prévenu ? » : c'est une mesure d'intérêt réelle (voir phase 0).

### 2.3 Écran 2 : réseaux

- **Titre** : « Où publiez-vous ? » si Veille ou Création est cochée ; « Où chercher les conversations ? » si seules les conversations sont cochées. Si les deux familles sont cochées, deux groupes successifs sur le même écran, chacun dans son `fieldset` avec sa légende.
- **Publier** (cases, rien de coché par défaut) : LinkedIn, Facebook (une Page), Bluesky, Mastodon, Discord ; puis, séparés par un sous-titre « Au-delà des réseaux » : « Une newsletter par e-mail » et « Un flux RSS public pour mon site ». Enfin « Autre réseau » et « Je ne publie pas encore ».
- **Écouter** : Hacker News, Bluesky (les sources d'engagement qui existent), plus « Autre plateforme ».
- **Ce que la réponse configure** : on ne peut pas remplir `channels` (il faut un identifiant de compte, donc une connexion). Je propose un nouveau champ `config.target_channels` (liste de `DRAFT_CHANNELS`) : il sert à rédiger dès le départ les posts des réseaux visés (au lieu de `DEFAULT_DRAFT_CHANNELS`), à générer les lignes « Connecter LinkedIn » de la liste de démarrage, et disparaît de l'usage dès qu'un compte réel est choisi. Newsletter cochée : le Calendrier affiche l'envoi hebdomadaire, `newsletter.auto_send` reste à `false` jusqu'au réglage du service. Flux coché : flux activés à la création (aucune clé requise, adresse non devinable). Côté écoute : la conversation proposera les recherches Hacker News et Bluesky.
- **« Autre réseau »** : un champ texte apparaît (« Lequel ? », 60 caractères), avec ce texte : « Glimr ne publie pas encore sur ce réseau. Nous notons votre demande ; en attendant, vos posts seront rédigés et copiables. » La demande va dans une table `network_requests` (espace, thème, texte libre, date, personne), avec RLS basée sur `private.is_member`, et alimente une vue d'administration. Rien n'est promis, aucune date. Les demandes sur X reçoivent en plus l'explication de la décision du 2026-11-12, sous forme d'une aide neutre (« Glimr ne publie plus sur X. »).
- **Actions** : « Retour » (réponses conservées), « Continuer », « Passer cette étape » (rien de visé : la rédaction garde les réseaux par défaut).

### 2.4 Écran 3 : la conversation

**Titre** : « Parlez-nous de votre sujet et de votre public ». Sous-titre : « Glimr vous pose quelques questions pour régler le thème à votre place. Comptez 3 à 5 minutes. Vous relirez tout avant d'enregistrer. »

**Ce que l'assistant cherche à remplir** (une liste fixe de cases à remplir, connue du prompt, qui ne contient que le fonctionnement de l'outil : aucune règle de style ni de thème) :

| Case                                 | Champ de `topics.config`                                                                     | Outils concernés        | Exemple de question de l'assistant                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Produit et public                    | `product.description`, `product.audience`, `product.url`                                     | Tous                    | « En une ou deux phrases, à qui s'adresse ce que vous faites connaître ? »                                   |
| Messages, preuves, interdits         | `product.messages`, `product.proof_points`, `product.claims_to_avoid`, `product.disclosure`  | Conversations, Création | « Y a-t-il des promesses que vous ne voulez jamais voir écrites ? »                                          |
| Langues                              | `output_langs`, noms `name_fr` / `name_en`                                                   | Tous                    | « Votre public lit-il en français, en anglais, ou les deux ? »                                               |
| Ce qui compte, ce qui est hors sujet | `ai.relevance_criteria`, `kinds`, `collection.excluded_domains`                              | Veille                  | « Qu'est-ce qui serait une excellente trouvaille pour vous, et qu'est-ce qui vous ferait perdre du temps ? » |
| Sources                              | lignes de `sources` (RSS vérifiés, recherches Exa, GitHub ; recherches Hacker News, Bluesky) | Veille, Conversations   | « Quels sites ou blogs lisez-vous déjà ? »                                                                   |
| Conversations à rejoindre            | `engagement.criteria`                                                                        | Conversations           | « Dans quelles situations une réponse de votre part aide-t-elle vraiment ? »                                 |
| Voix                                 | `ai.style_rules`, `ai.post_rules`, `ai.editorial_rules`                                      | Veille, Création        | « Collez un post dont vous êtes content, ou décrivez votre ton. »                                            |
| Rythme                               | `schedule.posts_per_day`, `schedule.slots`, `schedule.timezone`, `schedule.digest`           | Veille, Création        | « Combien de posts par semaine vous semble tenable ? »                                                       |

**Comportement** :

- **Une question à la fois**, avec 2 à 4 réponses rapides en boutons quand c'est pertinent (« Les deux langues », « Français seulement »), et toujours « Passer cette question ».
- **Pas de question redondante** (WCAG 3.3.7) : ce qui est connu (réseaux, objectif, URL) est donné à l'assistant et n'est jamais redemandé.
- **Si une URL a été donnée**, Glimr lit la page (le même lecteur que pour les articles) et propose d'emblée une description et un public : « Voici ce que j'ai compris de votre site. C'est juste ? ». La personne corrige au lieu d'écrire.
- **Sources jamais devinées** : l'assistant ne propose une adresse de flux qu'après l'avoir trouvée et vérifiée par le mécanisme existant (découverte des flux déclarés par une page, comme dans « Ajouter une source »). Un site sans flux devient une recherche Exa limitée à ce site, marquée « nécessite une clé Exa ». Même règle pour les recherches Hacker News et Bluesky : une recherche d'essai est lancée et le nombre de résultats montré.
- **Fin** : quand toutes les cases utiles aux outils choisis sont remplies ou passées, ou au bout de 10 questions, l'assistant le dit (« J'ai ce qu'il faut. Voyons le résultat. ») ; le bouton « J'ai fini, voir le résultat » est visible en permanence, dès la première réponse.
- **Préférer un formulaire** : un lien « Je préfère remplir un formulaire » mène au même écran de relecture, champs vides et aides visibles. Indispensable pour les personnes expertes, pour les cas sans IA et comme repli d'accessibilité.

**Technique** : même schéma que la réécriture (`rewrites`). La requête enregistre le message dans `onboarding_sessions` (RLS : membre de l'espace, ses propres sessions), un job appelle le modèle avec la clé secrète et écrit une réponse structurée (texte, et propositions validées contre `topicConfigSchema`), le board interroge la ligne. Identifiant du modèle à vérifier sur la documentation officielle au moment du développement.

**Coût et pannes** :

- **Qui paie ?** C'est la question bloquante (voir questions ouvertes). Aujourd'hui toute IA passe par la clé Anthropic de l'espace, qu'un nouvel utilisateur n'a pas encore. Ma recommandation : un **crédit d'onboarding fourni par Glimr** (plafond par espace, par exemple 0,50 $, hypothèse à chiffrer sur une dizaine de sessions réelles), ce qui est une exception à la règle « clés par espace » et doit faire l'objet d'une entrée dans `DECISIONS.md`. Avec l'offre Medium du `TODO.md` (IA fournie par Glimr), cette exception devient la règle.
- **Sans crédit ni clé** : la conversation n'est pas proposée, le formulaire s'affiche directement, avec un encart « Ajoutez une clé Anthropic pour être guidé par l'assistant » (lien vers Connexions, retour au parcours conservé).
- **Erreur ou délai** : au-delà de 30 secondes sans réponse, message dans une zone `role="alert"` sous le champ : « Glimr n'a pas pu répondre. Vos réponses sont gardées. » avec « Réessayer » et « Continuer avec le formulaire ». Les erreurs stockées sont des codes (`providers.ts`), traduites par le board.
- **Plafond atteint** : l'assistant s'arrête proprement et ouvre la relecture avec ce qu'il a.
- **Reprise** : la session est gardée 7 jours ; revenir sur `/topics/new` propose « Reprendre la configuration de “Nom” ».

**Clavier et lecteur d'écran** :

- Le fil de messages est une liste (`ol`) dans une région titrée (h2 visuellement masqué « Conversation »), chaque message préfixé d'un texte masqué « Glimr : » ou « Vous : ». Seul le **dernier** message de Glimr est annoncé, par une zone `aria-live="polite"` distincte qui reçoit son texte complet une fois arrivé (pas mot à mot : un flux continu est illisible au lecteur d'écran).
- L'attente est annoncée une fois (« Glimr écrit… », `role="status"`), sans répétition.
- Le champ est un `textarea` avec un libellé visible « Votre réponse ». Entrée envoie, Maj+Entrée va à la ligne, et l'aide le dit ; le bouton « Envoyer » reste visible. Le focus reste dans le champ après l'envoi et n'est jamais déplacé vers le fil.
- Les réponses rapides sont des `button` dans un groupe nommé (« Réponses suggérées »), au moins 24 × 24 px (2.5.8), et elles remplissent le champ au lieu d'envoyer directement, pour éviter un envoi par erreur au clavier.
- Le champ fixé en bas ne doit jamais masquer l'élément qui a le focus (2.4.11) : marge de défilement (`scroll-padding-bottom`) égale à sa hauteur.
- Aucune limite de temps côté personne (2.2.1), pas d'animation de frappe sous `prefers-reduced-motion`.
- L'aide (« Comment ça marche ? ») est au même endroit à chaque étape (3.2.6).

### 2.5 Écran 4 : relecture avant création

**Titre** : « Voici ce que Glimr a compris ». Sous-titre : « Rien n'est encore enregistré. Modifiez ce qui ne vous convient pas, puis créez le thème. »

- Une **section par sujet** (Votre produit, Langues et noms, Ce qui compte, Sources, Conversations, Votre voix, Rythme, Budget), chacune en `section` titrée h2, avec les champs du réglage final (mêmes composants que dans Réglages : ce que l'on apprend ici sert ensuite).
- Chaque valeur déduite porte un badge neutre « Proposé par Glimr » et un bouton « D'où vient cette proposition ? » qui montre la réponse d'origine (citation de la personne, ou « lu sur votre site »). Badge retiré dès que la personne modifie le champ.
- Les sources proposées sont des cases cochées par défaut, avec leur état de vérification (« Flux vérifié : 12 articles ces 30 derniers jours », « Nécessite une clé Exa »).
- Budget : « Plafond mensuel : 10 $ » affiché, modifiable, avec l'aide actuelle.
- Bouton principal « Créer le thème ». Secondaires : « Revenir à la conversation », « Recommencer ».
- Erreurs de validation : résumé en haut (`role="alert"`, liens vers chaque champ en erreur), et message sous chaque champ, relié par `aria-describedby`.

### 2.6 Après la création : un premier résultat vite

La personne arrive sur l'**Aperçu** du thème (nouvelle page, section 3), pas sur Sources.

1. **Collecte immédiate** des sources acceptées (le mécanisme « Collecter maintenant » existe), et première recherche de conversations. Message `role="status"` : « Glimr cherche vos premiers éléments. Cela prend en général une à deux minutes. » Les compteurs se mettent à jour sans recharger.
2. **Sans clé Anthropic**, les éléments arrivent quand même, sans score : l'Aperçu le dit en une phrase et met « Connecter l'IA » en tête de liste.
3. **Liste de démarrage** dérivée de l'état réel (pas de cases cochées à la main qui mentiraient) :

| Ligne                                          | Faite quand                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Connecter l'IA (Anthropic)                     | clé vérifiée dans l'espace, ou IA fournie par Glimr                          |
| Connecter LinkedIn (une ligne par réseau visé) | un compte de ce réseau est choisi dans `channels`                            |
| Trier vos 10 premiers éléments                 | 10 éléments validés ou rejetés                                               |
| Programmer votre premier post                  | un post `scheduled`                                                          |
| Régler la newsletter                           | expéditeur et liste réglés (si visée)                                        |
| Examiner vos premières conversations           | une conversation passée « À répondre » ou « Écartée » (si l'outil est actif) |

La liste se replie (« Masquer la liste de démarrage », état gardé par thème) et réapparaît tant qu'une ligne bloquante (IA, réseau visé) n'est pas faite, en version courte.

4. **États vides réécrits** : chaque liste vide dit quoi faire et propose l'action. Exemples : Tri vide après collecte, « Rien de nouveau pour l'instant. Glimr collecte vos sources chaque jour ; ajoutez-en une ou lancez une collecte. » avec les deux boutons. Accueil sans thème : bouton principal « Créer votre premier thème ».

5. **Thèmes existants** : un bouton « Ajuster avec l'assistant » dans Réglages du thème, Général, lance la conversation en mode modification ; la relecture montre alors un **avant / après** par champ, et seuls les champs acceptés sont écrits.

---

## 3. Architecture de l'information

### 3.1 Arborescence proposée

```
Barre latérale
├── Aujourd'hui                       → / (tous thèmes : à trier, à répondre, à venir, échecs)
├── Thèmes
│   ├── <Thème>
│   │   ├── Aperçu                    → /t/:id (liste de démarrage, chiffres, prochaines publications)
│   │   ├── Veille                    → /t/:id/curation     (si activée) : À trier | Validés | Rejetés | Publiés | Archivés
│   │   ├── Conversations             → /t/:id/engagement   (si activée) : À examiner | À répondre | Écartées | Archivées
│   │   ├── Création                  → /t/:id/compose      (si activée) : Idées | Brouillons
│   │   ├── Calendrier                → /t/:id/calendar     : Semaine | Liste | Newsletter (aperçu, envois)
│   │   └── Réglages du thème         → /t/:id/settings/:section
│   │         ├── Général (noms, langues, outils actifs)
│   │         ├── Produit et public
│   │         ├── Sources (veille et conversations, filtre par outil) + Sites exclus
│   │         ├── Tri et types de contenu (critères, seuils, types, fréquences)
│   │         ├── Voix et rédaction (règles, moment de rédaction)
│   │         ├── Publication (comptes par réseau et langue, créneaux, fuseau, LinkedIn)
│   │         ├── Newsletter
│   │         ├── Flux publics
│   │         └── Budget
│   └── + Nouveau thème
└── Espace de travail
    ├── Connexions
    └── Profil
```

### 3.2 Pourquoi

- **Faire et régler sont séparés.** Les pages de travail (Veille, Conversations, Création, Calendrier) n'ont qu'un niveau d'onglets : les statuts. Tous les réglages d'un thème sont au même endroit, une seule rangée de sous-sections. Fin des trois « Réglages » superposés.
- **Les réglages sont rangés par sujet, pas par outil.** Langues, fuseau, créneaux, voix, sources et produit servent plusieurs outils ; les ranger sous un outil oblige à deviner. Une sous-section propre à un outil inactif est masquée, comme aujourd'hui.
- **Un seul Calendrier** remplace la page Diffusion, l'onglet Programmés du tri et la page Newsletter : c'est une seule file (créneaux du thème) que trois outils remplissent. La newsletter y apparaît comme un envoi hebdomadaire, avec son aperçu.
- **Aperçu** donne un point d'arrivée stable, quel que soit l'outil actif, et règle le bug de navigation d'un thème sans curation.
- **Aujourd'hui** répond à la question quotidienne réelle (« qu'est-ce que je dois faire ? ») quand on a plusieurs thèmes. C'est la partie la moins urgente : à valider en phase 0 avant de la construire.
- **Nommage** : « Veille » plutôt que « Curation » (plus clair en français, et c'est le mot du `CONTEXT.md`) ; « Conversations » plutôt que « Engagement » (dit ce que l'on y trouve) ; « Création » pour le nouvel outil ; « Publication » pour le réglage des comptes et créneaux, « Calendrier » pour la file. En anglais : Curation, Conversations, Create, Calendar, Publishing. « Workspace » devient « espace de travail » partout en français. Le slogan devient « Faites connaître votre sujet » (à valider), au lieu de « Outil de curation de veille ». Code et routes restent neutres : `curation`, `engagement`, `compose`, `calendar`.

### 3.3 Ce qui change pour les personnes qui utilisent déjà Glimr

_Sans objet pour l'instant (réponse du 2026-11-17) : Geoffrey est le seul utilisateur, pas de redirections ni d'annonce._

- **Anciennes adresses redirigées**, comme déjà fait pour `settings?tab=` : `/t/:id` (Tri) vers `/t/:id/curation`, `/diffusion` et `?status=scheduled` vers `/calendar`, `/newsletter` vers `/calendar?view=newsletter`, `/sources` vers `/settings/sources`, `/curation/settings?tab=` vers la sous-section correspondante.
- **Aucune migration de données** : la structure de `topics.config` ne bouge pas (seuls `modules.compose` et `target_channels` s'ajoutent, avec valeurs par défaut).
- **Changement d'habitude principal** : le Tri n'est plus la page d'arrivée d'un thème. Pour limiter la gêne, l'Aperçu met « N éléments à trier » en premier, avec un lien direct, et le choix de la page d'arrivée peut devenir une préférence.
- **Annonce** : une note unique dans l'Aperçu (« Ce qui a changé »), avec la correspondance ancien libellé, nouvel endroit. Le serveur MCP n'est pas concerné (il parle en termes techniques).

### 3.4 Alternative allégée (si la refonte complète n'en vaut pas encore la peine)

_Écartée le 2026-11-17 : la refonte se fait d'un coup._

À faire en une à deux semaines, sans toucher aux routes principales :

1. État vide de l'Accueil avec bouton « Créer votre premier thème », redirection automatique à la première connexion.
2. Nouveau slogan et nouvelle intro de création (produit à faire connaître, outils au choix).
3. Création de thème : un seul nom obligatoire, les deux outils en cases à cocher, budget déplacé vers une étape de relecture.
4. Lien de thème dans la barre latérale vers le premier outil actif (correction du cas « engagement seul »).
5. Fusion de la page Diffusion et de l'onglet Programmés : garder Programmés dans le tri et faire de Diffusion une redirection, ou l'inverse.
6. Engagement aligné sur la curation : routes et barre de segments au lieu d'onglets dans la page.
7. Liste de démarrage en haut du Tri tant qu'elle n'est pas finie.
8. « workspace » remplacé par « espace de travail » dans Connexions.

Cette version règle environ les deux tiers des blocages relevés en 1.1, mais garde les réglages éparpillés et ne prépare pas l'arrivée d'un troisième outil. Ma recommandation : faire **l'allégée tout de suite**, puis la refonte au moment d'ajouter Création, qui l'impose de toute façon (un troisième outil sous l'organisation actuelle ajouterait un quatrième « Réglages » et une troisième file).

---

## 4. L'outil « Créer mes propres posts »

### 4.1 Ce que font les concurrents (vérifié dans la mesure du possible)

Les pages officielles de tarifs de Buffer, Hootsuite et Publer n'étaient pas joignables depuis l'environnement de cette étude (accès réseau refusé). Les éléments ci-dessous viennent de recherches web du 2026-11-16 ; quand ils ne viennent que de sites tiers, souvent eux-mêmes concurrents, je l'indique. **À revérifier sur les pages officielles avant toute communication.**

|                   | Buffer                                                                                                                                                                                                                                                            | Hootsuite                                                                                                                                                                                     | Publer                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modèle de prix    | Facturation par réseau connecté, offre gratuite (3 réseaux selon des sites tiers), puis Essentials et Team. Prix par réseau divergents selon les sources (5 à 6 $ pour Essentials, 10 à 12 $ pour Team), possiblement après une révision fin 2025. _Sites tiers._ | Offres à partir d'environ 99 $ par mois et par utilisateur selon plusieurs sources, jusqu'à environ 399 $, Enterprise sur devis ; noms d'offres divergents. Essai de 30 jours. _Sites tiers._ | Offre Business à partir de 10 $ par mois pour un compte, puis 7 $ par compte supplémentaire. _Centre d'aide Publer, vu via un moteur de recherche._ Offre gratuite pour 3 comptes selon des sites tiers. |
| IA de rédaction   | « AI Assistant » inclus dans toutes les offres selon la plupart des sources. _Sites tiers._                                                                                                                                                                       | OwlyWriter AI inclus dans les offres payantes selon plusieurs sources. _Sites tiers._                                                                                                         | « AI Assist » illimité dans l'offre Business. _Centre d'aide Publer._                                                                                                                                    |
| Recherche, écoute | Non relevé.                                                                                                                                                                                                                                                       | Rachat de Talkwalker (écoute sociale, plus de 100 réseaux) annoncé en avril 2024. _Communiqué Hootsuite et presse._                                                                           | Automatisation depuis des flux RSS (publication ou programmation automatique des nouveaux articles) et recyclage de posts. _Centre d'aide Publer._                                                       |

**Hypothèses, non vérifiées** : ces trois outils rédigent à partir d'une consigne, sans aller chercher eux-mêmes des sources ni citer d'où vient une affirmation ; aucun ne fait de contrôle d'accessibilité des posts au-delà d'un champ de texte alternatif pour les images ; leur force est l'étendue (réseaux, équipes, validation, statistiques), pas le fond. À confirmer par un essai de chaque outil (phase 0).

### 4.2 Positionnement

**Ne pas jouer** sur le nombre de réseaux, la boîte de réception sociale, l'analytique avancée, les équipes nombreuses, les images et vidéos (Instagram, TikTok). Ce sont les terrains où ces outils ont dix ans d'avance.

**Jouer sur le fond** : « Glimr écrit des posts qui disent quelque chose de vrai, sourcé et utile à votre public, dans votre voix. » Une phrase pour la page de présentation : « Les autres outils programment vos posts. Glimr vous aide à savoir quoi dire. »

### 4.3 Différenciateurs proposés

1. **Recherche avant rédaction.** Une demande (« un post sur l'obligation d'accessibilité des sites de e-commerce ») déclenche une recherche (Exa, sources du thème, éléments validés de la veille), montre les sources retenues, et la rédaction reste ancrée dans ces sources avec les règles existantes (`insufficient_content`, aucun chiffre absent de la source, extrait verbatim). Chaque affirmation du brouillon est reliée à sa source, consultable avant publication. C'est le prolongement direct de ce que Glimr sait déjà faire.
2. **Des idées qui viennent du thème, pas d'une page blanche.** L'onglet Idées est alimenté par les trois outils : un élément de veille (« Donner votre avis sur cet article »), une question qui revient dans les conversations (« 3 personnes ont demandé comment auditer un PDF ce mois-ci »), une preuve de la fiche produit non encore exploitée. Bouton « Transformer en post » depuis une fiche d'élément ou une conversation.
3. **Votre voix, réglée et visible.** Importer quelques posts passés (copier-coller) pour proposer des `style_rules` et `post_rules` que la personne relit et enregistre. La voix reste un réglage lisible et modifiable, jamais une boîte noire ni une règle en dur.
4. **Un post par réseau et par langue, rédigé nativement** (déjà le principe de Glimr), avec les limites de chaque réseau et le premier commentaire LinkedIn.
5. **Séries.** « Une série de 4 posts sur 2 semaines » : un plan relu, puis des brouillons répartis dans le Calendrier sur les créneaux libres.
6. **Contrôle d'accessibilité des posts**, cohérent avec l'origine de Glimr (CheckFox) : hashtags en casse chameau, emoji en excès ou en début de ligne, caractères stylisés Unicode (illisibles par les lecteurs d'écran), images sans texte alternatif quand elles viendront. C'est une fonction de l'outil (un contrôle avec des avertissements, que l'on peut désactiver dans les réglages), pas une règle de style imposée au prompt.

### 4.4 Place dans l'architecture

- Module `compose` dans `topics.config.modules`, page Création (Idées, Brouillons), posts programmés dans le **même Calendrier** et sur les **mêmes créneaux** que la veille. Les réglages communs (Produit et public, Voix et rédaction, Publication) servent déjà ; un seul réglage propre à prévoir (part des créneaux réservée à la création, par exemple « 1 post sur 3 »).
- **Modèle de données (hypothèse à valider avec le développement)** : aujourd'hui un post appartient à un élément (`posts.item_id`) et la rédaction ajoute le lien de la source. Un post de création n'a pas forcément d'URL. Piste : une table `briefs` (thème, demande, état de la recherche, sources retenues), `posts.brief_id` à côté de `item_id` (l'un ou l'autre), RLS via `private.can_access_topic`, statuts des posts inchangés. À trancher dans `DECISIONS.md`.

---

## 5. Plan de mission

| Phase                         | Objectif                                                                     | Livrables                                                                                                                                                                                                                                                                                                                         | Dépend de                                 | Taille |
| ----------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| 0. Valider                    | Confirmer les blocages et les hypothèses avant de construire                 | 5 tests de premier lancement en pensée à voix haute (dont au moins 1 personne utilisant un lecteur d'écran) ; test d'arborescence (tree test) à 15 personnes, arborescence actuelle contre proposée ; essai de Buffer, Hootsuite et Publer (une heure chacun) ; case « Créer mes propres posts : bientôt » pour mesurer l'intérêt | rien                                      | S      |
| 1. Correctifs rapides         | Débloquer le premier lancement sans refonte                                  | L'alternative allégée (3.4), états vides réécrits                                                                                                                                                                                                                                                                                 | 0 (en partie, peut démarrer en parallèle) | S à M  |
| 2. Parcours sans IA           | Objectif, réseaux, formulaire guidé, relecture, Aperçu et liste de démarrage | `NewTopicView` en étapes, `target_channels`, `network_requests` (migration, RLS), page Aperçu, collecte immédiate                                                                                                                                                                                                                 | 1                                         | M      |
| 3. Conversation               | Remplir la configuration en dialoguant                                       | `onboarding_sessions`, job, prompt versionné (`onboarding-v1`), vérification des sources, avant / après pour les thèmes existants, plafond de coût, entrée DECISIONS                                                                                                                                                              | 2 et **décision sur qui paie l'IA**       | L      |
| 4. Refonte de l'architecture  | Faire et régler séparés, un seul Calendrier                                  | Routes, redirections, Réglages par sujet, Sources unifiées, Calendrier (Diffusion, Programmés et Newsletter fusionnés), traductions FR et EN                                                                                                                                                                                      | 0 (tree test), 1                          | M à L  |
| 5. Création, première version | Posts propres, recherchés et sourcés                                         | Module `compose`, `briefs`, recherche, rédaction ancrée, Idées depuis la veille, programmation dans le Calendrier                                                                                                                                                                                                                 | 4 (Calendrier)                            | L      |
| 6. Différenciateurs           | Ce qui distingue Glimr                                                       | Import de la voix, séries, idées depuis les conversations, contrôle d'accessibilité des posts                                                                                                                                                                                                                                     | 5                                         | M      |

**Ce que l'on mesure, et les seuils proposés** (hypothèses à ajuster) :

- Temps entre la première connexion et le premier élément trié : aujourd'hui souvent plus d'un jour ; cible moins de 10 minutes.
- Part des parcours commencés et terminés : cible 70 %.
- Part des thèmes avec au moins un réseau connecté sous 7 jours.
- Part des propositions de la conversation gardées sans modification : si plus de la moitié des critères proposés sont réécrits, la conversation n'apporte pas assez par rapport au formulaire, on simplifie.
- Après chaque tâche de test : note de difficulté perçue (une question, de 1 à 7) ; un taux de réussite par tâche pour le tree test.

**Risques** :

- **Coût et dépendance de l'IA dès l'arrivée** : un crédit fourni par Glimr sans facturation ouverte, c'est un coût d'acquisition. Plafond strict et formulaire de repli.
- **Propositions fausses** (sources inventées, critères hors sujet) : vérification systématique des sources, relecture obligatoire, citation de l'origine de chaque proposition.
- **Conversation plus lente qu'un formulaire pour les personnes expertes** : lien « formulaire » toujours visible.
- **Accessibilité d'une interface de discussion** : c'est le composant le plus risqué du lot ; audit dédié avec des utilisateurs de NVDA et VoiceOver avant ouverture.
- **Glissement de périmètre vers un Buffer bis** : s'en tenir aux 6 différenciateurs et aux 5 réseaux actuels.
- **La friction des clés reste le vrai mur** : sans le mode « comptes gérés par Glimr » de Zernio (étude `social-publishing.md`) et sans IA fournie, le meilleur parcours aboutit encore à une page Connexions à sept services.
- **Désorientation des utilisateurs actuels** pendant la refonte : redirections, note « Ce qui a changé », page d'arrivée réglable.

---

## Questions ouvertes pour Geoffrey

1. **Qui paie l'IA de la conversation d'onboarding ?** Un crédit fourni par Glimr est une exception à la règle « clés par espace » : d'accord pour l'inscrire dans DECISIONS, et avec quel plafond ?
2. **L'inscription reste-t-elle sur invitation ?** Un parcours pensé pour le libre-service n'a pas les mêmes priorités qu'un parcours pour des personnes accompagnées.
3. **Ordre des questions** : d'accord pour poser l'objectif avant les réseaux ?
4. **Noms** : Veille, Conversations, Création, Calendrier, Aperçu, Aujourd'hui te conviennent ? La métaphore de l'orpaillage doit-elle entrer dans le board (« pépites ») ou rester sur la page publique ?
5. **Création** : quels réseaux au lancement (les 5 actuels ?), images comprises ou non, et dans quelle offre (Light, Medium) ?
6. **Calendrier** : créneaux partagés entre veille et création, ou créneaux distincts par outil ?
7. **« Autre réseau »** : veux-tu répondre aux demandes (e-mail, feuille de route publique) ou seulement les compter ?
8. **Langues** : la conversation détectera des publics dans d'autres langues que le français et l'anglais (`LANGS` est limité aux deux). Hors périmètre pour l'instant ?
9. **Page « Aujourd'hui » multi-thèmes** : utile pour toi au quotidien, ou l'Aperçu par thème suffit ?
10. **Refonte** : on part sur l'allégée maintenant et la refonte avec Création, ou tu préfères tout faire d'un coup ?

## Réponses de Geoffrey (2026-11-17)

Ces réponses priment sur les recommandations ci-dessus quand elles divergent.

1. **IA de l'onboarding et des offres où Glimr fournit l'IA** : payée par Glimr, avec les clés de Geoffrey (Anthropic, puis d'autres IA, et Zernio en mode plateforme pour l'offre la plus élevée), réglées dans un **espace d'admin** réservé à son compte. Le crédit d'onboarding se contrôle dans un **centre de coûts** de cet espace.
2. **Inscription** : sur invitation pour l'instant. Une personne non invitée envoie une **demande motivée**, transmise par e-mail à Geoffrey.
3. **Ordre des questions** : l'objectif avant les réseaux, d'accord.
4. **Noms** : Veille, Conversations, Création, Calendrier, Aperçu, Aujourd'hui, d'accord. **La métaphore de l'orpaillage reste sur les pages publiques** et sort du board, pour garder l'interface simple.
5. **Création** : les 5 réseaux actuels au lancement, à élargir vite après la refonte. Images comprises dans l'offre intermédiaire (voir `docs/CONTEXT.md`, section 12).
6. **Calendrier** : créneaux distincts par outil pour commencer.
7. **« Autre réseau »** : répondre aux demandes, en les priorisant (pas seulement les compter).
8. **Langues** : dans le périmètre. L'interface reste en français et en anglais, mais un thème doit pouvoir publier dans **n'importe quelle langue** : `LANGS` cesse d'être une liste fermée pour les contenus.
9. **Aujourd'hui multi-thèmes** : oui.
10. **Refonte** : **tout d'un coup**, pas d'alternative allégée. Les redirections d'anciennes adresses (3.3) sont inutiles, Geoffrey étant le seul utilisateur pour l'instant.

## Sources

Recherches du 2026-11-16. Les pages buffer.com, publer.com et hootsuite.com n'ont pas pu être ouvertes directement (accès réseau refusé depuis l'environnement de l'étude) : les chiffres viennent de résultats de recherche et de sites tiers.

- Publer, centre d'aide, « What are Publer's Plans and Pricing? » : https://publer.com/help/en/article/what-are-publers-plans-and-pricing-15h4yqh/ (vu via un moteur de recherche)
- Publer, flux RSS : https://publer.com/help/en/article/rss-feeds-in-publer-tmy7cj/ ; recyclage : https://publer.com/help/en/article/how-to-automatically-recycle-posts-21oc1h/
- Buffer, tarifs selon des sites tiers : https://www.socialpilot.co/insights/buffer-pricing, https://socialbu.com/blog/buffer-pricing, https://changelog.zernio.com/blog/buffer-pricing
- Hootsuite, tarifs selon des sites tiers : https://www.techradar.com/reviews/hootsuite, https://www.socialpilot.co/insights/hootsuite-pricing
- Hootsuite et Talkwalker : https://www.hootsuite.com/newsroom/press-releases/hootsuite-agrees-to-acquire-talkwalker, https://tech.eu/2024/04/08/hootsuite-acquires-ai-powered-social-listening-solution-talkwalker/

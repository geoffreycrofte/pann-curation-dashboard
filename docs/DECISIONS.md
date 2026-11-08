# Décisions techniques

Complète `docs/CONTEXT.md`. Une entrée par décision, la plus récente en bas.

## 2026-10-01 : socle (étape 1)

**Multi-tenant dès le départ.** Table `workspaces` + `workspace_members`. Chaque topic appartient à un workspace. Un workspace personnel est créé automatiquement à l'inscription. Objectif : pouvoir ouvrir l'outil en SaaS sans refondre le schéma.

**`items` est un cache de contenu partagé.** Une ligne par URL canonique pour tout l'outil (pas de double collecte ni de double tri). Un workspace ne voit un item que via ses topics (`item_topics`). Les `summaries` sont en revanche rattachés au workspace (`unique (workspace_id, item_id, lang)`), car les règles éditoriales appartiennent au workspace : un item présent dans deux topics du même workspace n'est résumé qu'une fois.

**Auth : Supabase Auth (lien magique), pas Cloudflare Access.** Le board envoie le JWT Supabase à l'API, qui crée un client Supabase portant ce JWT : la RLS est la frontière entre tenants. Les jobs (collecte, tri, publication) utilisent la clé secrète et contournent la RLS. Inscriptions publiques désactivées (usage personnel, sur invitation).

**Règles de curation doublées en base.** La clé publishable étant publique, un utilisateur pourrait appeler PostgREST directement. Un trigger reproduit la table de transitions de `packages/shared/src/status.ts` (à garder synchronisés) et les utilisateurs ne peuvent modifier que `status` et `validated_at`.

**Un seul Worker pour l'API et le board.** Le board est servi en assets statiques par le Worker de l'API (`run_worker_first: ["/api/*"]`) : une origine, pas de CORS, un déploiement.

**Accès base : supabase-js, pas encore Hyperdrive + Drizzle.** Suffisant pour l'API (requêtes simples, RLS via JWT). À réévaluer à l'étape 2 si les jobs ont besoin de transactions ou de requêtes complexes (déduplication `pg_trgm`).

**Reka UI** pour les composants accessibles (alignement CheckFox).

**Vocabulaire neutre dans l'interface pour l'instant.** La métaphore de l'orpaillage (pépite, batée, filon) n'est pas encore validée ; les libellés sont centralisés dans `apps/board/src/i18n/` et pourront être changés en un seul endroit.

**Tokens de couleur vérifiés.** `apps/board/scripts/check-contrast.mjs` (lancé par `pnpm test`) contrôle chaque couple texte/fond en thèmes clair et sombre. Le jaune vif n'est jamais utilisé comme couleur de texte ni comme seul indicateur d'état.

## 2026-10-02 : saisie manuelle et fréquence de collecte

**Un rejet n'est plus définitif pour l'utilisateur.** Transitions ajoutées : `rejected → new | validated`, depuis le board, à tout moment. La règle anti-reproposition est conservée pour les jobs : la collecte ne remet jamais un item rejeté dans « À trier ». Conséquence : les items rejetés restent en base (titre, URL, contenu) et consultables dans l'onglet « Rejetés ». Si le volume pose problème un jour, on pourra purger `fetched_content` des items rejetés depuis longtemps en gardant URL et titre pour la déduplication. `published` reste final.

**Fréquence de collecte par type de contenu.** `topics.config.collection.intervals_hours` (défauts : actualité 24 h, légal 48 h, outil 168 h, ressource 72 h, autres 24 h), modifiable dans Réglages. Chaque source porte un type de contenu principal (`sources.default_kind`) et peut surcharger la fréquence (`sources.interval_hours`). Le cron de collecte tournera toutes les heures et ne traitera que les sources dues (`isSourceDue`).

**Ajout manuel de flux RSS.** L'API récupère l'URL : si c'est un flux, il est enregistré ; si c'est une page, Pann suit l'auto-découverte (`<link rel="alternate">`) et vérifie le flux trouvé, ou propose un choix s'il y en a plusieurs. Aucun flux n'est enregistré sans avoir été récupéré et reconnu. Un flux ne peut être ajouté qu'une fois par topic.

**Ajout manuel d'articles et d'outils.** Validés par défaut (case à décocher pour les envoyer dans « À trier »). Le titre est récupéré depuis la page s'il n'est pas fourni. L'insertion passe par la fonction `public.add_manual_item` (security definer, contrôle d'accès au topic explicite), ce qui évite d'utiliser la clé secrète pour une requête utilisateur. Les items manuels portent `origin = 'manual'` : comme `items` est partagé entre workspaces, les collecteurs devront rafraîchir leur titre et leur contenu au lieu de faire confiance à la saisie.

**Récupération de pages par l'API.** Délai de 8 s, 512 Ko maximum, adresses locales et privées refusées.

## 2026-10-03 : collecte (étape 2)

**Un cron horaire, des sources « dues ».** Le cron `7 * * * *` (minute 7 pour éviter l'engorgement de l'heure pile) ne traite que les sources dont la fréquence est échue, au plus 10 par passage (temps et sous-requêtes Workers bornés), les plus anciennes d'abord. Une source en erreur n'arrête pas les autres ; l'erreur est affichée dans la page Sources.

**« Collecter au prochain passage ».** Le board pose `sources.run_requested_at` (requête utilisateur, RLS) ; seul le cron collecte, avec la clé secrète. Pas de Queue Cloudflare pour l'instant : inutile tant que le tri IA n'existe pas, les items à trier se repèrent par `relevance_score is null`.

**Fenêtre de collecte.** Premier passage : `collection.max_age_days` (30 jours par défaut), pour qu'un nouveau flux n'inonde pas le board avec ses archives. Ensuite : depuis le dernier passage moins 2 jours de recouvrement (articles publiés en retard), la déduplication absorbant les doublons.

**Ingestion atomique en base.** `public.ingest_items` (réservée au rôle service) applique toutes les règles en une transaction : unicité par URL canonique ; déduplication de second niveau par `pg_trgm` (similarité ≥ 0,9, autre domaine, publication à 7 jours près, hors outils) pour les reprises d'un même article ; jamais de reproposition d'un item déjà rattaché au topic, quel que soit son statut, sauf un outil publié dont le tag de release a changé ; titre et contenu des liens ajoutés à la main rafraîchis une fois.

**Adaptateurs.**

- RSS / Atom / RDF : `fast-xml-parser` (Workers n'a pas de `DOMParser`), 50 entrées max par passage, les entrées sans date sont gardées (la déduplication les filtre ensuite).
- Exa : `POST /search` (`type: auto`, `startPublishedDate`, texte limité à 6 000 caractères pour le tri). Le coût réel renvoyé par Exa (`costDollars.total`) est enregistré dans `usage_log`.
- GitHub : dépôts du topic poussés pendant la fenêtre, triés par étoiles, avec un seuil (`min_stars`, 20 par défaut) pour écarter les dépôts personnels. Le dernier tag de release sert de `change_signature`. Une requête de release par dépôt : limiter `max_results` (15 par défaut). Un `GITHUB_TOKEN` (fine-grained, sans permission) relève la limite d'API.

**Plan Workers.** Le plan gratuit limite à 50 sous-requêtes par invocation : une source GitHub en consomme jusqu'à 16. Le plan Paid prévu (1 000 sous-requêtes) est nécessaire dès plusieurs sources GitHub dans un même passage.

## 2026-10-03 : clés des services réglées dans l'app

**Les clés Anthropic, Exa et GitHub sont par workspace, saisies dans l'app (page Connexions).** Objectif : qu'un nouvel utilisateur (SaaS) puisse tout configurer sans toucher à un fichier. Seules les 3 valeurs Supabase restent dans la configuration locale, écrites par `pnpm configure` (assistant interactif).

**Stockage : Supabase Vault.** Table `workspace_credentials` (fournisseur, 4 derniers caractères, statut) ; le secret est dans `vault.secrets`, chiffré. Écriture par fonctions `security definer` réservées au propriétaire du workspace ; lecture en clair uniquement par `workspace_credentials_for_jobs`, réservée au rôle service. Le navigateur ne peut jamais relire une clé.

**Vérification à l'enregistrement, gratuite.** Anthropic : liste des modèles ; GitHub : `/rate_limit`. Exa n'a pas d'appel gratuit : la clé est vérifiée à la première collecte, et une clé refusée par un service pendant la collecte passe au statut « refusée » sur la page Connexions.

**« Collecter maintenant ».** La requête utilisateur prouve l'accès à la source par la RLS (mise à jour de `run_requested_at`), puis lance la collecte de cette source en tâche de fond (`waitUntil`, clé secrète). Le board interroge la source toutes les 2,5 s jusqu'à son nouveau `last_run_at` et affiche le bilan (`sources.last_run_stats`). La règle « jamais de clé secrète pour une requête utilisateur » devient : jamais directement ; une requête peut déclencher un job après contrôle d'accès.

**Erreurs sous forme de codes.** `missing_credential:exa`, `http:503`, `no_feed`… stockés en base et renvoyés par l'API, traduits par le board, avec un lien vers Connexions quand la solution est une clé.

**Modèles.** Identifiant de tri corrigé en `claude-haiku-4-5` (l'identifiant officiel actuel, sans suffixe de date). Tarifs Claude vérifiés le 2026-10-01 : Haiku 4.5 à 1 $ / 5 $, Sonnet 5.5 à 2 $ / 10 $ par million de tokens (et non 3 $ / 15 $ comme supposé dans le CONTEXT).

## 2026-10-03 : tri par IA (étape 3)

**Quand.** Après chaque collecte : le passage horaire trie tout ce qui attend (25 éléments maximum par passage) ; « Collecter maintenant » trie aussitôt les nouveaux éléments du thème. Sans clé Anthropic, les éléments arrivent sans score et le board l'indique.

**Comment.** Un appel par élément à `claude-haiku-4-5` (identifiant réglable par thème), avec sorties structurées (`messages.parse` + schéma Zod) : langue, type, pertinence 0-100, caractère promotionnel, une phrase d'explication dans la première langue de sortie du thème. Contenu tronqué à 6 000 caractères. La consigne est construite uniquement à partir de la configuration du thème (`relevance_criteria`), versionnée (`triage-v1`, enregistrée avec le coût).

**Archivage sous le seuil.** Un élément noté sous `ai.relevance_threshold` (50 par défaut, réglable dans Réglages) passe en « Archivés » : hors du tri, toujours consultable.

**Erreurs.** Clé refusée : signalée sur la page Connexions, plus aucun appel pour ce workspace pendant le passage. Limite de débit : on réessaie au passage suivant. Refus ou réponse invalide : une tentative comptée, abandon après 3.

**Ni lots ni cache, pour l'instant.** Le traitement par lots (-50 %) rend la réponse jusqu'à 24 h plus tard, incompatible avec « Collecter maintenant » ; au volume du scénario A (environ 60 éléments par jour, ~1 500 tokens d'entrée chacun), l'écart est d'environ 1,50 $ par mois. Il pourra servir pour le passage horaire si le volume grandit. Le cache de prompt ne s'active sur Haiku 4.5 qu'à partir de 4 096 tokens de préfixe : la consigne de tri est bien plus courte.

**Coût.** Calculé à partir des tokens renvoyés par l'API et des tarifs de `packages/shared/src/pricing.ts` (Haiku 4.5 : 1 $ / 5 $ par million de tokens), enregistré dans `usage_log`.

## 2026-10-03 : rédaction par IA et plafond de coût (étape 4)

**Quand.** Mode `on_validate` par défaut : valider un élément met sa rédaction en file (trigger SQL `queue_draft_on_validate`) et l'API envoie aussitôt une tâche. Mode `on_display` (réglable) : tout élément gardé par le tri est rédigé avant décision. Le passage horaire rattrape les rédactions en attente.

**File de tâches Cloudflare Queues.** `waitUntil` après une réponse est coupé au bout de 30 secondes, trop court pour une rédaction ou une collecte suivie du tri. Les requêtes utilisateur (« Collecter maintenant », validation, « Relancer la rédaction ») déposent une tâche dans la file `pann-jobs` ; le consommateur dispose de 15 minutes, avec 2 nouvelles tentatives puis la file `pann-jobs-dlq`. Wrangler simule la file en local.

**Modèle.** `claude-sonnet-5-5` (réglable par thème), effort `low` (point de départ recommandé pour la génération de contenu, réglable : `ai.draft_effort`), sorties structurées, consigne système mise en cache (identique pour tous les éléments d'un thème ; seuil de cache de 512 tokens sur Sonnet 5.5). Modèle de secours côté serveur activé (`fallbacks: "default"`, bêta `server-side-fallback-2026-07-01`) : en cas de refus pour certaines catégories, la requête est relancée sur un autre modèle ; le coût est calculé avec le modèle qui a réellement répondu.

**Contenu.** La consigne reprend les règles éditoriales du CONTEXT (véracité, versions exactes, directive ou transposition, typographie française, inclusivité, expressions bannies), suivies des règles propres au thème (`ai.editorial_rules`). Si le contenu stocké fait moins de 600 caractères (lien ajouté à la main, flux qui ne donne qu'un extrait), la page est récupérée et son texte principal extrait (`<article>`, sinon `<main>`). Contenu insuffisant : pas de résumé inventé, l'élément l'indique.

**Textes modifiés à la main.** Un résumé ou un post modifié dans la fiche est marqué `edited_by_human` et n'est jamais écrasé par une nouvelle rédaction. Limites de longueur affichées et vérifiées dans le board : LinkedIn 3 000, Bluesky 300 (graphèmes), Mastodon 500 (valeur par défaut de mastodon.social).

**Plafond mensuel par thème.** Avant chaque rédaction, le coût du mois (UTC, `usage_log`) est comparé à `topics.monthly_budget_usd` : au-delà, la rédaction s'arrête jusqu'au mois suivant, le tri continue (CONTEXT, section 8). Le budget et les dépenses par opération sont visibles et réglables dans Réglages.

**Alertes Supabase acceptées.** Les fonctions `security definer` appelables par un utilisateur connecté (`add_manual_item`, `set_workspace_credential`, `delete_workspace_credential`, `request_draft`) sont voulues : chacune vérifie elle-même l'accès (`can_access_topic`, `is_owner`).

## 2026-10-03 : règles éditoriales réglables, pas en dur

**Correction de l'étape 4.** La consigne de rédaction contenait les règles de `voice.md` (typographie française, inclusivité, expressions bannies) et des règles propres à l'accessibilité (versions de RGAA, directive ou transposition), écrites en dur. Ce sont des préférences d'utilisateur et de thème : elles passent dans les réglages du thème, page Réglages, section « Rédaction par IA » :

- `ai.editorial_rules` : règles de fond propres au thème ;
- `ai.style_rules` : style et ton des résumés ;
- `ai.post_rules` : conventions des posts ;
- et `ai.relevance_criteria` (tri), jusqu'ici modifiable seulement en base.

**Ce qui reste intégré** : le fonctionnement de l'outil, valable pour tout thème et tout utilisateur (résumer uniquement à partir de la source, ne rien inventer, signaler un contenu insuffisant, extrait mot pour mot, attribution des contenus commerciaux, reformulation plutôt que paraphrase, français et anglais rédigés chacun nativement, limites de caractères des réseaux, lien ajouté à part). Un test vérifie qu'aucune règle de style ou de thème n'est écrite en dur.

Prompts passés en `draft-v2` et `triage-v2`. Le thème accessibilité est prérempli avec les anciennes règles (`docs/topics/accessibilite.md`).

## 2026-10-03 : réponses aux questions ouvertes (diffusion)

- **CheckFox** : mis de côté pour le moment (étape 5 reportée).
- **LinkedIn** : jamais de post bilingue (cela casse la traduction automatique de LinkedIn) : un post par langue, comme sur les autres réseaux. L'option `channels[].bilingual_single_post` de la config est retirée.
- **Créneaux** : 9 h et 16 h, heure de Luxembourg (valeurs par défaut de la config).
- **Newsletter** : une liste Brevo par langue.

## 2026-10-03 : identité visuelle

Logo (batée inclinée et pépite), palette noir d'encre et or, typographies Bricolage Grotesque (titres) et Plus Jakarta Sans (texte), hébergées avec l'app plutôt que chargées depuis Google Fonts (aucune donnée envoyée à un tiers). Détails : `docs/brand/README.md`.

Mise en page : barre latérale noire (thèmes, Connexions, langue), qui devient un menu repliable sur petit écran ; cartes arrondies ; tuile de score sur chaque élément ; contrôles segmentés pour les sections d'un thème ; sources en cartes plutôt qu'en tableau (sept colonnes illisibles à cette largeur) ; résumés et posts FR/EN côte à côte sur grand écran. Thèmes clair et sombre ; 54 couples de contraste vérifiés (27 combinaisons en clair et en sombre) ; audit axe-core sans violation sur toutes les pages.

## 2026-10-02 : logo, monogramme P

Le premier logo (batée en perspective, pépite cubique) évoquait une poêle avec du beurre. Quatre pistes comparées (`docs/brand/logo-explorations.png`) : pépite seule (pop-corn), tamis (panier), batée vue de dessus (assiette), monogramme P. Retenu : le **monogramme P**, dont la boucle est la batée, avec un éclat or pâle à l'intérieur et deux grains de sable sous la hampe. Net jusqu'à 16 px et sans évocation culinaire : dès qu'on dessine le récipient, on pense cuisine.

## 2026-10-02 : logo, batée vue de dessus et favicon pépite

Choix de Geoffrey parmi les quatre pistes : la **batée vue de dessus** (piste D) pour le logo et l'icône d'app, la **pépite seule** (piste A) pour le favicon. Remplace le monogramme P. Ajout d'un manifeste d'app web et des icônes d'écran d'accueil (iOS, Android, maskable).

## 2026-10-02 : diffusion sur les réseaux (étape 6)

**File d'attente tenue par Pann, publication immédiate chez les réseaux.** Chaque élément validé prend un créneau du thème (`schedule.slots`, `posts_per_day`, `timezone`) ; un index unique sur `item_topics (topic_id, publish_at)` garantit un seul élément par créneau. Un cron toutes les 5 minutes publie les posts dont l'heure est venue. Zernio sait aussi programmer, mais Mastodon passe par sa propre API : une seule file pour tous les réseaux reste plus simple, et les posts restent modifiables dans Pann jusqu'à leur départ.

**Validation humaine des textes.** Valider un élément ne programme rien : la personne relit les posts, puis choisit « Programmer au prochain créneau » ou « Publier maintenant » (avec confirmation). Rien ne sort sans ce geste.

**Comptes et langues.** `channels` devient une liste `{ channel, account_id, langs }` : chaque compte publie les langues cochées dans les réglages du thème, jamais de post bilingue. Un seul compte par réseau et par langue. LinkedIn et Bluesky : identifiant de compte Zernio (liste lue avec la clé et actualisable depuis Connexions, via un job). Mastodon : le compte de la clé Mastodon du workspace (jeton et adresse d'instance).

**Lien et longueur.** Le lien vers la source est ajouté après le texte, séparé par une ligne vide. Les limites envoyées à l'IA tiennent compte du lien (prompt `draft-v3`), Mastodon compte chaque lien pour 23 caractères, et sa limite réelle vient de l'instance. Un post trop long, lien compris, bloque la programmation.

**Fiabilité.** Les posts dus sont réservés par `claim_due_posts` (`for update skip locked`), puis repris après 10 minutes si le job s'arrête. Chaque envoi porte une clé d'idempotence (`pann-<post>-<essai>`) reconnue par Zernio (24 h) et Mastodon (1 h) : une réponse perdue ne crée pas de doublon. Erreurs passagères : 3 essais espacés ; clé refusée, compte à reconnecter ou post refusé : échec immédiat, affiché sur la fiche, puis « Programmer de nouveau ». Un élément passe en `published` quand tous ses posts sont partis ou en échec et qu'au moins un est publié.

**Droits.** Les utilisateurs ne modifient plus que le texte d'un post (droits par colonne) ; programmation et retrait passent par `schedule_item` et `unschedule_item`, qui vérifient l'accès au thème. Un élément qui quitte `validated` sort de la file.

**W Social** : toujours aucune API de publication documentée au 02/10/2026 (réseau sur AT Protocol, ouvert en bêta publique le 17/06/2026). Non branché.

## 2026-10-02 : lettre d'information hebdomadaire (étape 7)

**Une campagne Brevo par langue**, envoyée à la liste de cette langue (`newsletter.lists.fr` / `.en`) avec l'expéditeur choisi (`newsletter.sender_id`). Les listes et expéditeurs sont lus avec la clé Brevo (Connexions), et actualisables par un job, comme les comptes Zernio.

**Contenu.** Chaque lettre reprend les éléments validés depuis la fin de la lettre précédente envoyée (7 jours pour la première), avec leur résumé dans la langue de la lettre. Un élément sans résumé dans cette langue attend la lettre suivante. Rien n'est envoyé deux fois ni oublié : `digests.period_from` / `period_to` enchaînent les fenêtres, et un index unique (thème, langue, `period_to`) empêche un double envoi. Une semaine sans élément est enregistrée « rien à envoyer », sans campagne.

**Ce qui est à l'utilisateur** : nom de la lettre, introduction, jour et heure d'envoi, envoi automatique ou manuel (manuel par défaut : la lettre ne part que depuis l'onglet « Lettre », avec confirmation). **Ce qui est intégré** : la mise en page de l'e-mail et les deux liens imposés (voir dans le navigateur, désabonnement, via les balises Brevo `{{ mirror }}` et `{{ unsubscribe }}`).

**E-mail accessible** : `lang` déclaré, contenu enveloppé dans `role="article"` étiqueté par l'objet (recommandation de l'Email Markup Consortium, car les webmails retirent `<html lang>`), tableaux de mise en page en `role="presentation"`, vrais titres, liens soulignés, contraste du texte supérieur à 7:1, aucun texte dans une image.

**Envoi** : vérifié toutes les 5 minutes avec la publication ; une lettre automatique n'est plus envoyée si elle a plus de 6 heures de retard (panne). Erreurs gérées : clé refusée, crédits Brevo épuisés (402), liste ou expéditeur manquant. Brevo peut bloquer les IP inconnues : la vérification de la clé le détecte et l'interface explique comment lever ce blocage (Cloudflare n'a pas d'IP fixe).

## 2026-10-02 : flux publics RSS et JSON Feed

**Un flux par thème et par langue**, en RSS 2.0 (`/feeds/<clé>/fr.xml`) et en JSON Feed 1.1 (`/feeds/<clé>/fr.json`) : les éléments validés (ou publiés), du plus récent au plus ancien (50 au plus), avec leur résumé dans la langue du flux. Un élément sans résumé dans cette langue n'y figure pas encore.

**Désactivé par défaut, adresse non devinable.** Activer les flux crée une clé aléatoire de 192 bits (`topics.feed_key`) ; « Changer d'adresse » la remplace et coupe l'ancienne ; désactiver la supprime. Pas de compte pour lire un flux : c'est le principe d'un flux, et la clé fait office d'accès.

**Lecture anonyme sans clé secrète.** Les lecteurs de flux ne sont pas connectés : le Worker lit la base avec la clé publique et une fonction `public.topic_feed` (security definer, accordée à `anon`) qui ne renvoie que ce que le flux montre (nom du thème, réglages du flux, éléments validés et résumés), et rien pour une clé inconnue. La règle « jamais la clé secrète pour une requête » est respectée.

**Cache de 15 minutes** (en-têtes et cache de Cloudflare) : un flux coupé ou une adresse changée peut encore répondre pendant ce délai. `Access-Control-Allow-Origin: *` pour qu'une page de veille (CheckFox) puisse lire le JSON depuis le navigateur ; `X-Robots-Tag: noindex` pour que les moteurs n'indexent pas l'adresse. Titre, description et page de présentation du flux se règlent par thème.

## 2026-10-02 : serveur MCP pour Claude, connexion OAuth

**Supabase Auth comme serveur d'autorisation.** Le serveur OAuth 2.1 de Supabase gère l'enregistrement dynamique des clients (Claude s'inscrit seul), le code d'autorisation avec PKCE et l'émission des jetons. Pann n'écrit que la page de consentement (`/oauth/consent`, avec `supabase.auth.oauth`) et publie les métadonnées de ressource protégée (RFC 9728) qui pointent vers `<projet>/auth/v1`. Les jetons reçus sont des JWT Supabase de l'utilisateur (avec un `client_id`) : la RLS s'applique telle quelle. Écarté : `workers-oauth-provider` de Cloudflare, qui demandait de coder un serveur d'autorisation et de stocker des jetons Supabase dans KV.

**Sans état, dans le même Worker.** `POST /mcp` en Streamable HTTP, un serveur et un transport par requête (SDK MCP officiel, `WebStandardStreamableHTTPServerTransport`, validateur JSON Schema `@cfworker/json-schema` car Workers interdit la compilation dynamique d'ajv). Aucun Durable Object, aucune session.

**Les outils passent par l'API du board**, avec le jeton de l'utilisateur (appel interne `app.request`) : mêmes contrôles, mêmes transitions de statut, mêmes jobs, même RLS ; aucune logique dupliquée. Outils : lister thèmes et éléments, lire un élément, trier, ajouter un lien, modifier résumés et posts, relancer la rédaction, programmer ou retirer de la file, lire la file de diffusion et la prochaine newsletter. Pas d'envoi de newsletter depuis MCP : il reste dans le board. Les instructions du serveur demandent à Claude de toujours demander avant une publication immédiate ; les annotations (`readOnlyHint`, `openWorldHint`) aident le client à demander confirmation.

**Accès révocable** : la page Connexions liste les applications autorisées (`listGrants`) et retire un accès (`revokeGrant`, qui invalide aussi ses jetons de rafraîchissement). Après connexion par lien magique, Pann ramène sur la page demandée (consentement compris) : chemin gardé dans localStorage, car le lien s'ouvre dans un nouvel onglet.

## 2026-11-08 : déploiement automatique après la CI

**`Deploy` se lance quand la CI réussit sur `main`** (`workflow_run`), plutôt qu'à chaque `push` : un déclenchement sur `push` tournerait en parallèle de la CI et déploierait aussi un commit qui échoue. Le workflow déploie le commit vérifié par la CI (`head_sha`), même si `main` a avancé entre-temps. Le lancement manuel reste possible.

**Conséquence** : une migration fusionnée dans `main` est appliquée à la base de production dans la foulée (`supabase db push`). D'où la règle de `CLAUDE.md` : ne jamais modifier une migration déjà appliquée, toujours en ajouter une nouvelle.

## 2026-11-08 : thèmes et sources de recherche créés depuis le board

**Création d'un thème** : `POST /api/topics` avec le minimum (noms FR et EN, langues de publication, critères de pertinence, budget). Le reste de la configuration prend ses valeurs par défaut et se règle ensuite (onglet Réglages, sous-onglet Général pour les noms et les langues). Le slug vient du nom anglais, suffixé (`-2`, `-3`…) s'il existe déjà dans le workspace. La RLS existante (`members manage topics`) suffit : aucune migration. Après création, le board ouvre l'onglet Sources : c'est l'étape suivante de la mise en place.

**Sources Exa et GitHub** : leurs schémas de configuration passent dans `packages/shared/src/source-config.ts`, utilisés par l'API (création, modification) et par le collecteur. Une source se modifie depuis sa carte (nom, type de contenu, réglages de la recherche). L'adresse d'un flux RSS reste fixe : un autre flux est une autre source.

## 2026-11-08 : sites exclus d'un thème

**Une liste par thème** (`collection.excluded_domains`), alimentée depuis le tri (« Rejeter », puis « Exclure ce site web ») ou depuis Sources, sous-onglet Exclusions. Un domaine exclut aussi ses sous-domaines ; `www.` est ignoré.

**Appliquée partout, pas seulement à Exa.** Le collecteur écarte les pages de ces sites quelle que soit la source (RSS, Exa, GitHub), avant l'ingestion. Exa reçoit en plus les domaines exclus (`excludeDomains`), pour ne pas payer des résultats écartés ensuite ; une source limitée à certains sites (`includeDomains`) envoie seulement sa liste, privée des sites exclus. Un lien ajouté à la main n'est pas filtré : c'est un choix explicite.

**Au moment de l'exclusion**, l'élément d'origine et tous les éléments de ce site encore « À trier » passent en « Rejeté ». Les éléments déjà validés ne bougent pas. Retirer un site de la liste ne fait pas revenir les éléments rejetés.

## 2026-11-08 : types de contenu propres à chaque thème

**Liste par thème** (`kinds` dans la config : clé, noms FR et EN, définition). Pann propose quatre types par défaut (actualité, légal, outil, ressource) ; chaque thème les renomme, en ajoute ou en retire (Réglages, Types de contenu). Les anciennes configs reprennent `categories`, prévu pour cela mais jamais utilisé, sinon les types par défaut.

**Le type d'un élément est stocké par thème** (`item_topics.kind`), plus sur l'élément partagé : un même article peut être « légal » dans un thème et « actualité » dans un autre. Migration `20261108000000_custom_kinds` : reprise des valeurs, `sources.default_kind` en texte, fonctions `ingest_items`, `add_manual_item` et `topic_feed` réécrites, suppression de `items.kind` et du type `item_kind`. Les clés ne sont pas contraintes en base (elles vivent dans la config) : l'API vérifie qu'un type existe dans le thème.

**Retirer un type** passe par `PUT /api/topics/:id/kinds`, qui reporte ses éléments et ses sources sur un type choisi (ou aucun). Le `PATCH` générique de la config refuse `kinds`.

**Tri par IA** : il choisit parmi les clés du thème (sortie structurée avec une énumération construite par thème) et lit leurs définitions, qui sont des réglages de l'utilisateur ; le prompt (`triage-v3`) ne contient plus de définition en dur. Un type venu de la source ou de l'utilisateur prime sur celui du tri. Le dédoublonnage par titre écartait les outils via `items.kind` : il écarte désormais les éléments suivis par version (`change_signature`).

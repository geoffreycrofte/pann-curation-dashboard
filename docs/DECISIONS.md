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

## 2026-11-08 : réécriture par IA depuis la fiche

**Réécrire** (Raccourcir, Allonger un peu, Plus pro, Plus familier, Instruction personnalisée) sur chaque résumé et chaque post. La proposition remplace le texte dans le champ, rien n'est enregistré sans « Enregistrer », et « Annuler la réécriture » rétablit le texte précédent.

**Par un job, pas dans la requête.** Lire la clé Anthropic demande la clé secrète, interdite dans une requête utilisateur. La requête enregistre la demande dans `rewrites` (RLS : l'utilisateur accède au thème, et ne lit que ses propres demandes), un job l'exécute et écrit le résultat, le board interroge la ligne toutes les 1,5 s (90 s au plus). Les demandes de plus de 7 jours sont supprimées par le job.

**Prompt** (`rewrite-v1`) : uniquement le fonctionnement (garder les faits et la langue, pas d'URL dans un post, limite de longueur du post moins le lien). Les consignes de style viennent des réglages du thème (`style_rules` pour les résumés, `post_rules` pour les posts). Modèle de rédaction du thème ; même budget mensuel que la rédaction ; coût enregistré sous l'opération `rewrite`.

## 2026-11-08 : badges

Un seul style pour les étiquettes et statuts de toute l'application (`.badge` dans `base.css`) : petit, plat, coins peu arrondis, fond teinté, sans bordure, pour ne jamais ressembler à un bouton (les boutons sont des pilules bordées). Tons `accent`, `success`, `danger` et neutre, point optionnel (`data-dot`) ; le texte porte l'information. Nouveaux tokens de fond, vérifiés en contraste : `--color-neutral-soft`, `--color-success-soft`, `--color-danger-soft`.

## 2026-11-08 : un thème, deux outils (curation et engagement)

**Un thème représente un produit ou un sujet à faire connaître** (CheckFox, Kitzy, Pann, RampUp…). Il porte deux outils, activables séparément dans Réglages, Général (`topics.config.modules`) :

- **curation** : ce que Pann fait déjà (collecter, trier, partager sur les réseaux et dans la newsletter) ;
- **engagement** : repérer des conversations (Hacker News, Bluesky, Mastodon, GitHub…) où l'équipe du produit peut aider, et préparer une réponse que la personne publie elle-même.

Les deux outils partagent la sémantique du thème (types de contenu, langues, sites exclus), ses connexions (clés par workspace) et son budget. Un outil séparé (dépôt `halo-marketing-tool`, brief « Growth OS ») a été écarté : il aurait refait la collecte, le tri, le board et la rédaction.

**Valeurs par défaut** : curation activée, engagement désactivé. Les thèmes existants ne changent pas de comportement, aucune migration (la config est en jsonb et lue avec ses valeurs par défaut).

**Curation désactivée** : la collecte des sources du thème et l'envoi automatique de la newsletter s'arrêtent ; ses sections (Tri, Diffusion, Newsletter, Sources et les réglages qui lui sont propres) sont masquées. Rien n'est supprimé : les éléments restent, les posts déjà programmés partent (c'était une décision explicite), les flux publics restent actifs tant qu'ils ne sont pas coupés. Toutes les sources actuelles alimentent la curation ; quand l'engagement aura ses propres sources, elles porteront leur outil.

**Fiche produit** (`topics.config.product`, Réglages, Produit) : nom, adresse, description, public, positionnement et messages, preuves (avec leur source), ce qu'il ne faut jamais dire, et la mention du lien de l'auteur avec le produit. Ce sont des réglages de l'utilisateur, conformément à la règle « rien en dur dans les prompts » : l'IA s'en servira quand elle écrit au nom du produit (réponses d'engagement).

**Garde-fous de l'engagement, à intégrer à l'outil et non aux réglages** (étapes suivantes) : une réponse n'est jamais publiée par une API, la personne l'ouvre, la copie et la marque comme publiée ; la mention du lien avec le produit est ajoutée dès que le produit est cité ; un plafond de réponses par communauté et par semaine, commun à tous les thèmes d'un même compte. Sinon, Pann ouvert en SaaS deviendrait un outil de spam.

**Suite prévue** : interface de l'engagement et sources de conversations (Hacker News et Bluesky d'abord), puis tri et rédaction propres à l'engagement (une réponse dans la langue de la discussion, aux limites de la plateforme d'origine).

## 2026-11-09 : sources et tri de l'engagement

**L'outil d'une source et d'un élément est enregistré** (`sources.module`, `item_topics.module`, `curation` ou `engagement`, `curation` par défaut : rien ne change pour l'existant). Il découle du type de la source : RSS, Exa et GitHub alimentent la curation, Hacker News et Bluesky l'engagement. Une source ne tourne que si l'outil qu'elle alimente est activé pour son thème. `ingest_items` reçoit l'outil (`p_module`) et l'écrit sur le lien de l'élément au thème ; les conversations ne sont jamais fusionnées sur leur titre (les commentaires d'un même sujet le partagent). La clé primaire de `item_topics` reste (élément, thème) : une même URL ne peut pas être à la fois dans la curation et dans l'engagement d'un thème, ce qui n'arrive pas en pratique (une conversation est une page de discussion, pas un article).

**Les deux outils ne se mélangent pas.** Seuls les éléments de curation sont rédigés (trigger `queue_draft_on_validate` et `request_draft` limités à la curation), affichés dans le tri, comptés sur ses onglets et repris dans la newsletter. Une réponse à une conversation n'est jamais publiée par une API : la personne ouvre la discussion et répond elle-même ; Pann ne rédige pas encore de réponse (étape suivante).

**Sources de conversations**, vérifiées le 2026-11-08 :

- Hacker News via l'API Algolia (`hn.algolia.com/api/v1/search_by_date`, sans clé) : sujets, commentaires ou les deux, seuil de points pour les sujets. L'élément est la page de discussion sur Hacker News (là où l'on répondrait), pas la page vers laquelle un sujet pointe.
- Bluesky via `app.bsky.feed.searchPosts` sur `api.bsky.app`, sans compte. `public.api.bsky.app` refuse les recherches (403) : à surveiller, Bluesky peut fermer l'accès anonyme ; il faudrait alors un compte et un mot de passe d'application (page Connexions).

Les faits d'une conversation (plateforme, auteur, fil, points, réponses) sont stockés avec l'élément partagé (`items.meta`) et rafraîchis à chaque collecte. Fenêtre de collecte propre à l'engagement (`engagement.max_age_days`, 14 jours par défaut) : une réponse tardive aide rarement.

**Tri propre à l'engagement** (`engagement-triage-v1`, modèle de tri du thème) : opportunité de 0 à 100 décrite par niveaux plutôt que par une grille de points (remarque de relecture du brief), décision (répondre, surveiller, passer), piste d'aide en une phrase, risque (faible, moyen, élevé), langue. Les principes du brief sont dans le prompt parce qu'ils sont le fonctionnement de l'outil (aider d'abord, ne pas surestimer l'intention d'achat, écarter les fils hostiles et les demandes de prestation) ; le produit et les conversations à rejoindre sont des réglages du thème (fiche produit, `engagement.criteria`). Sous le seuil (`engagement.threshold`, 60) ou « passer » : archivée. Coût enregistré sous `engagement_triage`.

## 2026-11-09 : suppression du compte et renommage de l'espace de travail

**Renommer l'espace de travail** (Profil) : `PATCH /api/workspaces/:id`, avec le client de l'utilisateur ; la politique RLS existante « owners update workspace » réserve la modification au propriétaire, un éditeur reçoit `owner_only`.

**Supprimer son compte** (Profil, confirmation par la saisie de l'adresse e-mail) : la requête vérifie l'adresse et, par la RLS, qu'aucun espace possédé n'est utilisé par d'autres personnes (`workspace_has_members` sinon : il n'existe pas encore de transfert de propriété), puis met en file un job. Le job, avec la clé secrète, appelle `delete_account_data` (réservée à `service_role`) : les espaces où la personne est seule membre sont supprimés avec tout leur contenu (cascade), ainsi que les secrets Vault de leurs clés, qu'aucune clé étrangère n'atteint ; puis il supprime l'utilisateur Supabase, ce qui retire ses autres adhésions et ses demandes de réécriture. La fonction est idempotente : un job relancé termine la suppression. Les éléments partagés (cache commun) restent ; ce qui a déjà été publié ou envoyé reste en place. Le board déconnecte l'appareil dès que la demande est acceptée.

**`/api/me`** ne renvoie plus que les adhésions de l'utilisateur : la RLS laisse lire celles de tous les membres de ses espaces.

## 2026-11-10 : onglet « Programmés » du tri

« Programmés » n'est pas un statut : ce sont les éléments validés dont au moins un post attend son créneau (`posts.status = 'scheduled'`). L'onglet se place après « Validés » dans le tri, sans toucher aux transitions de statut. Son compteur vient de `GET /topics/:id/counts` (clé `scheduled`, curation seulement).

Deux vues, gardées dans l'adresse (`view=week`, `week=AAAA-MM-JJ`) : une liste des prochaines publications groupées par jour, et un planning de la semaine (du lundi au dimanche) qui montre aussi ce qui est parti ou a échoué, et les créneaux encore libres à partir de maintenant. Jours et heures sont ceux du fuseau du thème (`schedule.timezone`), comme les créneaux. Le planning lit `GET /topics/:id/queue?from=&to=`. Un jour par ligne plutôt que sept colonnes : à la largeur du contenu, une colonne ferait 120 pixels et les titres seraient illisibles.

**Mise à jour (2026-11-10) : les filtres du tri en kanban.** Un élément programmé quitte « Validés » : la liste et le compteur `validated` excluent les éléments dont un post attend son créneau, l'onglet « Programmés » les reprend. Le statut en base reste `validated` (rien ne change dans les transitions) ; s'il est retiré de la file, l'élément revient dans « Validés ». Même règle pour `list_items` côté MCP, qui renvoie vers `get_queue`.

## 2026-11-10 : page d'accueil publique

**Où** : sur `/`, une personne non connectée voit la page de présentation (`LandingView`, chargée à la demande) ; connectée, elle voit ses thèmes comme avant. La page a son propre en-tête, `main` et pied de page (le lien d'évitement vise toujours `#main`). Les adresses inconnues mènent à une page 404 (`NotFoundView`) qui reprend l'illustration de la batée vide.

**Contenu** : les illustrations du brief (`docs/brand/illustrations-brief.md`), une par idée : héros, problème, les cinq étapes (collecter, trier, garder, rédiger, diffuser), newsletter, engagement (sans illustration : une conversation telle que Pann la montre), budget. Chaque étape dit qui s'en charge (Pann ou vous) : seule la validation revient à l'utilisateur. Pas d'inscription publique (les comptes sont invités) : l'appel à l'action est « Se connecter », avec la mention « sur invitation ».

**Charte** : les couleurs des scènes deviennent des tokens (sable, plateau, olive, bois), contrôlés par `check-contrast.mjs` ; le fond de l'app est légèrement réchauffé vers le sable (`#f7f0e2`). Les sections alternent sable, encre, or et olive. Les illustrations sont posées sur un « plateau » couleur sable aux bords estompés : invisible sur le sable, il les encadre sur les autres fonds et en thème sombre. Images en WebP (560 et 1 000 px, `srcset`), dimensions déclarées.

**Mise à jour (2026-11-11) : illustrations détourées.** Le « plateau » sable qui encadrait les images ne rendait pas bien en thème sombre ni sur les fonds encre, or et olive. Chaque scène existe désormais en deux versions : la scène, dont le fond a été uni à la couleur exacte de sa section (`--color-scene-hero`, `--color-paper` pour les étapes, `--color-scene-budget`), avec les ombres au sol conservées ; et un détourage (fond transparent, ombre portée en CSS) pour le thème sombre et les sections colorées. Détourage fait avec rembg (modèle `isnet-general-use`), puis retouché : tas de sable du héros récupéré par la couleur, étiquette et avions en papier rendus opaques. L'en-tête ne garde que le nom et le bouton clair/sombre (les liens sont dans le héros) ; le choix de la langue passe dans le pied de page.

**Mouvement** : un seul moment au chargement (la pépite du héros scintille, des grains tombent de la batée), les avions en papier qui dérivent, et le rail des étapes qui se remplit d'or au défilement (animation liée au défilement, rail plein là où elle n'existe pas). Tout est coupé avec `prefers-reduced-motion`.

## 2026-11-11 : X, Facebook et Discord

Trois réseaux de plus, publiés **par Zernio** comme LinkedIn et Bluesky (même clé, comptes connectés dans Zernio). Vérifié le 2026-11-11 sur docs.zernio.com :

- **X** (`twitter` chez Zernio) : 280 caractères pour un compte gratuit, lien compté 23, emoji compté 2. X facture chaque appel à son API, refacturé par Zernio.
- **Facebook** : une Page (pas de profil personnel). Facebook accepte 63 206 caractères mais coupe vers 480 derrière « Voir plus » : Pann garde la limite de LinkedIn (3 000).
- **Discord** : un compte Zernio par salon ; `platformSpecificData.channelId` est obligatoire, lu au moment de publier (`GET /v1/accounts/{id}/discord-settings`) pour suivre un changement de salon. 2 000 caractères.

**Rédaction** : LinkedIn, Bluesky et Mastodon restent rédigés pour chaque élément ; X, Facebook et Discord seulement dans les thèmes qui ont un compte pour eux (`draftChannels`), pour ne pas payer des posts que personne ne publiera. Un compte ajouté après coup : relancer la rédaction de l'élément. W reste sans API de publication connue.

## 2026-11-11 : la newsletter part de la file de diffusion

Une newsletter reprenait les éléments **validés** depuis la précédente. Elle reprend désormais les éléments **programmés ou publiés** sur les réseaux (Programmés et Publiés du tri) : ce qu'on a choisi de diffuser, et rien d'autre. Un élément validé mais jamais programmé n'y figure pas.

- **Pas de doublon** : chaque envoi enregistre ses éléments (`digest_items`, écrite par les jobs, lue par les membres). Un élément déjà dans un envoi en cours ou envoyé de la même langue est écarté ; un envoi en échec ne compte pas, ses éléments partent avec le suivant.
- **Fenêtre** : depuis le début du dernier envoi (un élément manqué faute de résumé a une seconde chance), ou, pour le premier envoi, depuis le jour réglé par l'utilisateur (`newsletter.first_issue_from`), à défaut les 7 derniers jours.
- Un élément programmé pour la semaine suivante peut donc partir dans la newsletter avant son post : c'est voulu, la newsletter annonce ce qui est choisi.
- Au plus 100 éléments par envoi, dans l'ordre de leur créneau.

## 2026-11-11 : apparence de la newsletter

Réglages du thème (Newsletter, Apparence), appliqués à l'aperçu et à l'envoi (`digestLook`) :

- **Logo** : une image en https au-dessus du nom, décorative (`alt=""`) car le nom suit en texte ; une adresse qui n'est pas en https est ignorée.
- **Couleur d'accent** : un bandeau en haut et un trait à gauche de chaque élément, sans texte posé dessus, donc sans contrainte de contraste. Pann la refuse si ce n'est pas une couleur `#rrggbb`.
- **Pied de page** par langue, au-dessus de la mention d'inscription et du lien de désabonnement, qui restent toujours.
- **Regroupement par type de contenu** : un titre par type (dans l'ordre des types du thème), les éléments passent en titres de niveau 3 ; les éléments sans type connu sous « Autres ».

Le reste du gabarit reste fixe : il garantit l'accessibilité de l'e-mail (langue, rôle article, titres, liens soulignés, contrastes).

## 2026-11-11 : SendFox, second service de newsletter

Chaque thème choisit son service d'envoi (`newsletter.provider` : `brevo` par défaut, ou `sendfox`) ; la clé se règle dans Connexions comme les autres. Vérifié le 2026-11-11 sur sendfox.com/developer/docs (API 1.6.0) :

- **Clé** : un jeton d'accès personnel (`Authorization: Bearer`), vérifié par `GET /me` ; les listes viennent de `GET /lists` (abonnés joignables : `subscribed_contacts_count`).
- **Envoi** : `POST /campaigns` (brouillon adressé à la liste de la langue, `web_publish: false` car les flux publics de Pann publient sur le web), puis `POST /campaigns/{id}/send`. Pas d'expéditeur à choisir : SendFox envoie avec celui du compte, et exige un fuseau horaire réglé dans le compte.
- **Gabarit** : SendFox exige `{{unsubscribe_url}}` et un `<body>` ; il n'a pas de lien « voir en ligne », la ligne disparaît (`renderDigest` choisit les liens selon le service). Hors mise en page « Code Your Own », SendFox retire les balises hors de son éditeur : à vérifier sur un premier envoi réel.
- 60 requêtes par minute, partagées entre tous les appels : un envoi en fait deux par langue.

## 2026-11-12 : réseaux en direct ou via Zernio, X abandonné

Suite de l'étude `docs/studies/social-publishing.md` : modèle hybride.

- **En direct**, parce que leur API est ouverte et gratuite : Mastodon (déjà), **Bluesky** et **Discord**. Une clé par espace dans le Vault, comme les autres.
  - Bluesky : identifiant et mot de passe d'application (jamais le mot de passe principal). L'identifiant est résolu en DID, puis en serveur (PDS) via le document DID ; une session est ouverte à chaque publication. Le post porte sa langue et le lien en « facet » (sinon il n'est pas cliquable), en octets UTF-8.
  - Discord : l'adresse du webhook d'un salon, qui fait office de clé ; seuls les hôtes de Discord sont acceptés. Mentions désactivées (`allowed_mentions`), pour qu'un post ne notifie jamais tout un serveur. Un seul webhook par espace pour l'instant.
- **Via Zernio** : LinkedIn et Facebook, dont l'API n'est ouverte qu'aux applications validées.
- **X abandonné** par principe (et 0,20 $ par post avec lien). Les entrées X d'une configuration de thème sont ignorées à la lecture ; la valeur reste dans l'enum `channel` de la base (on ne retire pas une valeur d'enum).
- Un compte Bluesky réglé via Zernio doit être reconnecté en direct (Connexions), puis ses langues recochées dans les réglages de diffusion.

## 2026-11-13 : plusieurs comptes par réseau direct, choisis par thème

Besoin : publier avec des comptes différents selon le thème (profil perso pour un thème, page pro pour un autre). Plutôt qu'une connexion par thème qui remplacerait celle de l'espace, l'espace garde **toutes** les clés et peut avoir **plusieurs comptes** pour les réseaux publiés en direct (Bluesky, Mastodon, Discord) ; chaque thème coche ses comptes dans Réglages, Diffusion, comme pour LinkedIn et Facebook via Zernio. Un compte utilisé par plusieurs thèmes ne se saisit qu'une fois, et les clés restent au même endroit.

- `workspace_credentials.account` : l'identifiant Bluesky, `utilisateur@instance` pour Mastodon, l'identifiant du webhook Discord ; vide pour les autres services, qui gardent une clé par espace (la base le vérifie). Clé primaire `(workspace_id, provider, account)`.
- Les comptes existants sont repris par la migration, et les thèmes réglés avec l'ancien webhook Discord pointent vers son identifiant.
- À la publication, le thème désigne le compte ; s'il n'en désigne pas un qui existe et que l'espace n'en a qu'un, celui-ci est pris. Un compte refusé ne bloque que lui, pas les autres comptes du même réseau.
- Connexions : une carte par compte, puis une carte « Autre compte » pour en ajouter un.

## 2026-11-13 : confirmations en toast

Les confirmations d'enregistrement s'affichent dans un toast vert en bas à droite (`lib/toast.ts`, `Toaster.vue`) : zone `role="status"` présente dès le chargement (annoncée par les lecteurs d'écran), disparition après 5 secondes sauf tant que le pointeur ou le focus est dessus, bouton de fermeture. Les erreurs, et les messages qui demandent une action (clé enregistrée mais non vérifiée, e-mail à confirmer), restent à côté de leur formulaire.

## 2026-11-13 : logo, la pépite seule

La batée vue de dessus était trop détaillée et pas assez imagée. Nouvelles pistes autour de la pépite sur son coussin (écrin, présentoir, trait d'encre, pépite enfoncée dans le coussin, pépite seule), comparées aux petites tailles. Choix de Geoffrey : **la pépite seule**, taillée en facettes, avec un éclat. Le symbole n'a pas de fond : l'éclat suit la couleur du texte, ce qui le rend lisible en clair comme en sombre sans deux composants. Le favicon retire l'éclat et agrandit la pépite pour rester net à 16 px ; les icônes d'app la posent sur une tuile encre. Le mot « Pann » des logos complets est vectorisé pour ne pas dépendre de la police. Fichiers et usages : `docs/brand/README.md`.

## 2026-11-14 : texte de la source fourni à la main

Quand Pann ne peut pas lire une page (accès payant, page vide ou construite par script), la rédaction échoue avec `insufficient_content`. La personne peut désormais coller le texte de l'article dans le bloc de rédaction (« Fournir le texte de la source », ouvert d'office après cet échec). Le texte remplace `items.fetched_content` via la fonction `set_item_source_text`, qui vérifie l'accès au thème comme `request_draft`, puis la rédaction habituelle repart : même ancrage dans la source, mêmes posts, même budget, pas de second circuit. Le texte vaut pour tous les thèmes qui suivent l'élément, puisque c'est le même article. Bornes communes à l'API, à la base et au board (`SOURCE_TEXT_MIN` = 600, seuil sous lequel la rédaction récupère à nouveau la page et pourrait garder une accroche plus longue ; `SOURCE_TEXT_MAX` = 60 000). Un rappel invite à ne coller qu'un contenu qu'on a le droit de lire.

## 2026-11-14 : signature et premier commentaire LinkedIn

Deux réglages par thème et par langue, dans la diffusion : une **signature** ajoutée à la fin de chaque post LinkedIn (après le lien) et un **premier commentaire** par défaut. La signature est ajoutée à la publication, pas stockée dans le texte du post : la modifier vaut pour tous les posts à venir, et la rédaction comme la réécriture la déduisent des 3 000 caractères (la plus longue des langues pour la rédaction). Le premier commentaire passe par Zernio (`platformSpecificData.firstComment` sur l'entrée LinkedIn, vérifié le 2026-11-14 sur docs.zernio.com) ; chaque post peut le garder, le désactiver ou le remplacer (`posts.first_comment` : `null` = celui du thème, `''` = aucun, sinon son texte), et ce choix survit à une nouvelle rédaction. LinkedIn seulement : Facebook accepte aussi un premier commentaire chez Zernio, à ajouter si besoin.

## 2026-11-16 : rédiger seulement les posts manquants

Les posts Discord et Facebook ne sont rédigés que si le thème publie déjà sur ces réseaux. Un élément rédigé avant l'ajout d'un réseau (ou d'une langue à un compte) n'a donc pas de post pour lui, et rien ne part dessus. La page de l'élément le signale, uniquement dans ce cas, avec un bouton « Rédiger les posts manquants ». La demande passe par `request_missing_posts`, qui met `item_topics.draft_scope` à `missing` : la rédaction ne demande au modèle que les réseaux manquants, n'ajoute que les posts absents et laisse résumés et autres posts tels quels. Sans post manquant au moment du passage, aucun appel au modèle. Le job remet `draft_scope` à `all` en finissant, pour que toute autre demande rédige tout.

## 2026-11-17 : arbitrages de la mission onboarding et architecture

Réponses de Geoffrey aux questions de `docs/studies/onboarding-ia.md` (détail dans l'étude) : la refonte se fait **d'un coup**, sans version allégée ni redirections (seul utilisateur pour l'instant) ; l'objectif se demande avant les réseaux ; sections Aujourd'hui (multi-thèmes), Aperçu, Veille, Conversations, Création, Calendrier ; **la métaphore de l'orpaillage quitte le board** et reste sur les pages publiques (règle mise à jour dans `CLAUDE.md`) ; inscription sur invitation, avec une demande motivée envoyée par e-mail ; créneaux distincts par outil ; demandes « autre réseau » traitées et priorisées ; Création avec les 5 réseaux actuels, images dans l'offre intermédiaire ; **toutes les langues pour les contenus**, l'interface restant en français et en anglais.

## 2026-11-17 : espace d'admin, clés et centre de coûts de Pann

L'IA de l'onboarding et des offres où Pann fournit les services est payée par Pann, avec ses propres clés : c'est la seule exception à la règle des clés par espace (`CLAUDE.md` mis à jour). Ces clés (Anthropic, Zernio en mode plateforme pour l'offre la plus élevée ; d'autres IA quand Pann les prendra en charge) se règlent dans un **espace d'admin** (`/admin`), stockées dans Supabase Vault comme les autres, vérifiées auprès du service avant enregistrement et jamais réaffichées. Les jobs les lisent avec la clé secrète (`platform_credentials_for_jobs`).

Le rôle d'administrateur est une table du schéma `private` (`private.platform_admins`), hors de portée de l'API : il ne s'accorde qu'en SQL, une fois, dans l'éditeur de Supabase :

```sql
insert into private.platform_admins (user_id)
select id from auth.users where email = '<adresse de l’administrateur>';
```

L'API répond 404 aux autres comptes, et chaque fonction de la base revérifie le rôle. Le **centre de coûts** lit `usage_log`, où une nouvelle colonne `billed_to` (`workspace` ou `platform`) dit qui paie chaque appel, et règle deux plafonds (`platform_settings`) : le crédit d'onboarding par espace et le plafond mensuel de Pann. Rien n'utilise encore les clés de Pann : l'onboarding s'y branchera, en respectant ces plafonds.

## 2026-11-17 : contenus dans toutes les langues

L'interface reste en français et en anglais (`UI_LANGS`), mais un thème écrit ses résumés, posts, newsletters et flux dans **n'importe quelle langue**, six au plus (`output_langs`). Une langue est un code BCP 47 sous forme canonique (`fr`, `de`, `pt-BR`, `zh-Hant`), validé par `langSchema` côté code et par `private.is_lang_tag` en base, où le type `public.lang` (`fr`, `en`) disparaît (migration `20261117000100_any_language`). Le choix se fait dans une liste de langues courantes, nommées dans la langue de l'interface par `Intl.DisplayNames`, ou par code saisi.

- **Rédaction** : la sortie du modèle n'a plus de champs `summary_fr` et `summary_en`, mais un résumé et un post par langue du thème (`draft-v4`) ; le prompt nomme les langues en anglais pour le modèle. Une langue que le modèle omet n'est pas enregistrée vide.
- **Textes saisis par l'utilisateur** : un texte par langue (`newsletter.title`, `intro`, `footer`, `feed.title`, `description`, `linkedin.signature`, `first_comment`). Les anciens champs `title_fr` et `title_en` sont convertis à la lecture de la configuration, sans migration des données.
- **Types de contenu** : noms d'interface en français et en anglais, plus un nom facultatif par autre langue du thème ; à défaut, le nom anglais.
- **Newsletter** : les textes fixes de l'e-mail (version web, désabonnement, raison, « Autres ») se règlent par langue. À défaut, ceux de Pann en français ou en anglais, marqués `lang` pour que les lecteurs d'écran les prononcent correctement.
- **Flux publics** : `/feeds/<clé>/<langue>.xml` pour toute langue du thème.
- Le nom d'un thème reste en français et en anglais (noms d'interface) : un contenu dans une autre langue prend le nom anglais quand aucun titre n'est réglé.

## 2026-11-17 : demandes d'accès et e-mails du service (Resend)

L'inscription reste sur invitation. Une personne sans compte envoie une **demande motivée** depuis la page de connexion (`/request-access`) : nom, adresse, projet. La demande est enregistrée par `request_access` (clé publique, sans compte), qui limite à trois demandes par jour et par adresse IP (stockée hachée) et à une demande ouverte par e-mail ; la réponse est la même dans tous les cas, pour ne jamais révéler qu'une adresse a déjà demandé. Un champ piège, invisible, écarte les robots.

Une tâche prévient ensuite les administrateurs par e-mail avec **Resend**, choisi pour le transactionnel : clé de Pann réglée dans l'espace d'admin (une clé « envoi seulement » suffit, reconnue à sa réponse `restricted_api_key`), expéditeur sur un domaine vérifié (`platform_settings.email_from`), destinataires lus en base (`platform_admin_emails`, clé secrète seulement), réponse directe à la personne (`reply_to`). Sans clé ni expéditeur, la demande reste listée avec la raison. Cet e-mail interne est écrit en français, pour l'administrateur : ce n'est pas un texte du produit. Les demandes se lisent et se marquent (acceptée, refusée) dans l'espace d'admin ; l'invitation elle-même part de Supabase.

## 2026-11-18 : nouvelle architecture du board

**Faire d'abord, régler ensuite.** L'accueil devient « Aujourd'hui » (tous les thèmes : ce qui attend un tri, ce qui part aujourd'hui). Par thème : Aperçu, Veille, Conversations (selon les outils actifs), Calendrier (programmés, historique, newsletter), Réglages. Les réglages sont regroupés par sujet dans une seule page à onglets (`?tab=`), chaque onglet n'apparaissant que si l'outil concerné est actif. Les anciennes vues Sources, File et Newsletter deviennent des panneaux de Réglages et du Calendrier ; pas de redirections (un seul utilisateur aujourd'hui). La métaphore de l'orpaillage quitte le board et ne vit plus que sur les pages publiques.

## 2026-11-18 : création d'un thème guidée

**Des étapes, rien d'enregistré avant la relecture.** Objectif (nom, site, outils), réseaux (où publier, où écouter, « autre réseau »), questions de l'assistant si disponible, puis relecture de tous les réglages. Le brouillon vit dans `sessionStorage` (survit à un rechargement, pas à la fermeture de l'onglet), l'étape dans l'adresse (`?step=`) pour que Retour fonctionne. Les réseaux visés sont gardés dans `topics.config.target_channels` (rédigés dès le départ, une ligne de la liste de démarrage chacun). « Autre réseau » et « Créer mes propres posts » deviennent des demandes (`feature_requests`), traitées dans l'espace d'admin. Après création : première collecte immédiate, et un Aperçu avec une liste de démarrage tirée de l'état réel (jamais cochée à la main).

## 2026-11-18 : conversation de cadrage (assistant de création)

**Un échange court sur la clé de Pann, dans un crédit par espace.** Entre « Réseaux » et « Relecture », un assistant pose au plus 10 questions et propose les réglages (description, public, langues, critères, ton, rythme…). Il tourne sur la clé Anthropic de Pann (espace d'admin), dans le crédit d'onboarding de l'espace et le plafond mensuel de Pann (`platform_settings`) : chaque appel est inscrit dans `usage_log` avec `billed_to = 'platform'`, et le job vérifie les deux limites avant d'appeler. Au-delà, ou sans clé, l'étape disparaît et la relecture se remplit à la main.

**Même modèle que les réécritures.** La requête de l'utilisateur écrit la session (`onboarding_sessions`, RLS : la personne et seulement elle, dans un espace dont elle est membre), une tâche répond avec la clé secrète, le board interroge la session. Modèle `claude-opus-5-5` en effort `low`, sortie structurée (zod), repli serveur en cas de refus. Le prompt ne décrit que le fonctionnement (quels réglages remplir, une question à la fois, ne pas redemander ce qui est connu, ne rien inventer) : ton et règles viennent des réponses de la personne. Le site est lu une fois, au premier tour.

**Accessible.** L'échange est une liste où chaque message dit qui parle ; seule la dernière réponse est annoncée ; le champ garde le focus ; les réponses suggérées remplissent le champ sans envoyer ; le formulaire reste à un bouton, et est proposé si la réponse tarde (30 s) ou échoue. À la relecture, chaque valeur proposée porte « Proposé par l'assistant », qui disparaît dès qu'on la modifie.

## 2026-11-18 : création d'un thème en conversation, plein écran

**Une conversation scriptée, pas un formulaire en étapes.** La création d'un thème (et la première visite sans thème) s'ouvre en plein écran, sans la barre latérale : une colonne de 840 px au plus. Les choix fixes (outils, réseaux, langues, rythme, budget) sont des questions fermées ; ce qui définit le thème (ce que c'est, pour qui, messages, voix) passe par l'assistant, ou par des questions ouvertes quand il n'est pas disponible. Le prompt de l'assistant ne demande plus ni langues ni rythme (au plus 6 questions) ; il propose seulement les langues, pré-cochées ensuite. Chaque question est un vrai formulaire dont la légende ou l'étiquette est la bulle de l'assistant ; la réponse s'affiche dans la bulle de la personne, avec « Modifier ». Le focus va toujours à la question suivante. « Tout voir sur une page » ouvre à tout moment le récapitulatif, qui reprend tous les réglages et reste la seule étape qui enregistre.

**Recomposition à la création.** Le board se reconstruit autour du nouveau thème avec l'API View Transitions (fondu, barre latérale qui glisse), sauf si les animations sont réduites. Le titre de l'Aperçu prend le focus.

**Illustration : la batée qui se remplit.** La page publique montre un prospecteur devant une batée vide ; ici, la même batée, en aplat, reçoit une paillette à chaque réponse, et les paillettes fusionnent en la pépite du logo au récapitulatif. Décorative (masquée aux technologies d'assistance, l'avancement est aussi donné en texte), affichée seulement à partir de 1200 px, dans la marge droite, jamais sous la colonne. C'est la seule exception à la métaphore de l'orpaillage hors des pages publiques : ce moment est un seuil, pas un outil du board.

## 2026-11-18 : ajuster un thème avec l'assistant, menu des réglages, souhait de newsletter

**« Ajuster avec l'assistant ».** Le même assistant qu'à la création, sur un thème existant (bouton en tête des Réglages, plein écran comme la création). Il reçoit les réglages actuels sous forme de texte et ne propose que les changements voulus (null pour le reste, jamais de copie) ; il ne relit pas le site. La personne voit ensuite chaque changement à côté de la valeur actuelle, le modifie si besoin, décoche ceux qu'elle ne veut pas, puis applique : rien ne change avant. Même crédit que la création (crédit de l'assistant de l'espace et plafond mensuel de Pann) ; s'il est épuisé, le bouton disparaît. Le cadre plein écran est partagé (`components/onboarding/FullScreen.vue`).

**Menu des réglages.** Dix sections ne tiennent plus sur une ligne : liste verticale à côté du panneau à partir de 1152 px (flèches haut et bas), liste déroulante native au-dessus en dessous.

**Souhait de newsletter.** Le choix « une newsletter » de la création est gardé (`topics.config.target_newsletter`) : la liste de démarrage de l'Aperçu demande de la configurer tant que chaque langue n'a pas sa liste (et Brevo son expéditeur), même règle que la tâche d'envoi (`newsletterReady`).

## 2026-11-19 : outil Création (première version)

**Ce que c'est.** Un troisième outil par thème (`modules.compose`) : les posts écrits par la personne, pas tirés de la veille. Une composition part d'un sujet et d'une matière, choisie à chaque fois : ses idées (notes seules, l'IA met en forme sans rien ajouter de factuel), des liens qu'elle donne (lus une fois), ou une recherche Exa dont elle coche les résultats (clé Exa de l'espace). Un post par réseau et par langue, rédigé par une tâche ; coût sur le budget du thème. Le prompt ne dit que comment rester ancré dans la matière du mode ; ton et règles viennent des réglages du thème.

**Modèle.** Tables `compositions` et `composition_media` ; `posts` vient d'un élément ou d'une composition (exactement un). Créneaux propres, uniques par thème (`compositions.publish_at`), réglés dans `topics.config.compose` (même fuseau que la veille), et fonctions `schedule_composition` / `unschedule_composition` calquées sur celles de la veille. La personne écrit le contenu ; statuts et créneaux passent par des fonctions qui vérifient l'accès (`request_compose_job`, `request_media_alt`), puis par les tâches.

**Images de la personne, texte alternatif obligatoire.** Bucket privé `composition-media`, un dossier par thème (RLS sur le premier dossier). Le board redimensionne (2048 px) et compresse en JPEG sous 2 Mo avant l'envoi, la limite de Bluesky (`maxSize` de `app.bsky.embed.images`, paquet officiel `@atproto/api` 0.32.2), la plus basse des réseaux. Quatre images au plus (même lexique). Texte alternatif par langue : l'IA propose ceux qui manquent en regardant l'image, marqués « Proposé par l'IA » jusqu'à modification ; la programmation est refusée tant qu'une image n'a pas son texte dans la langue d'un post. Publication : Bluesky (uploadBlob, alt et proportions), Mastodon (upload avec `description`, jeton avec `write:media`), Discord (pièces jointes avec `description`), Zernio pour LinkedIn et Facebook par adresse signée (`mediaItems[].altText`, appliqué sur ces deux réseaux d'après docs.zernio.com/posts/create-post, vérifié le 2026-11-19).

**Lien.** Un post composé n'a pas de source unique : un lien facultatif par composition (par défaut la première source cochée), ajouté comme pour la veille ; vide, le post n'a pas de lien.

## 2026-11-19 : différenciateurs de la Création

**Contrôle d'accessibilité des posts.** Une fonction de l'outil, pas une règle donnée à l'IA (`checkPost`, partagé) : pendant la modification d'un post (veille ou Création), des avertissements signalent un hashtag de plusieurs mots dans une seule casse (les sigles comme #WCAG passent), des emoji en début de ligne, en excès ou à la suite, des lettres Unicode « stylisées », des mots en capitales. Jamais bloquant, désactivable par thème (`accessibility_check`, actif par défaut). Les onglets Voix et Publication s'affichent aussi pour un thème qui n'utilise que la Création.

**Votre voix à partir de vos posts.** La personne colle des posts dont elle est contente ; une tâche propose des `style_rules` et `post_rules` (seulement ce que les posts montrent, dans sa langue). Chaque proposition est affichée à côté de la règle actuelle et ne remplit le champ que si elle la choisit ; l'enregistrement reste le sien. La voix reste un réglage lisible, jamais un profil caché (`voice_analyses`, clé de l'espace, budget du thème).

**Idées tirées du thème.** Un élément de veille gardé, une conversation à laquelle répondre (son angle devient les notes) et une liste « Idées » en tête de la Création démarrent une composition en mode « Des liens », la source déjà cochée. Le regroupement automatique de questions récurrentes (« 3 personnes ont demandé… ») n'est pas fait : à reprendre si l'usage le demande.

**Séries.** Sujet, nombre de posts (2 à 8), période (1 à 60 jours) : une tâche propose un plan (un angle par post, ancré dans les notes et la fiche produit), la personne le modifie, puis chaque post devient une composition rédigée à partir de son angle seul (mode « Mes idées »). « Programmer la série » place chaque post sur le premier créneau libre de la Création à partir de sa part de la période (`not_before`). Supprimer une série garde ses posts.

## 2026-11-19 : Zernio en mode plateforme

**Pour qui.** Un administrateur de la plateforme coche, dans l'espace d'admin, les espaces dont LinkedIn et Facebook passent par la clé Zernio de Pann (plus tard : les offres où Pann fournit les services). Un espace qui a sa propre clé Zernio la garde ; la clé de Pann ne sert qu'à défaut.

**Comment.** Un profil Zernio par espace (`externalId` = id de l'espace, nom « Pann <id> » car les noms sont uniques), créé à la première connexion. La clé de Pann ne sert qu'aux tâches : la personne demande une connexion (fonction `request_zernio_platform`, membres seulement, espace activé), une tâche prépare le lien de Zernio (`GET /v1/connect/{platform}`, mode standard : Zernio héberge le choix de la Page ou de l'organisation, écran d'accueil au nom de Pann, droits `posting,comments` pour les premiers commentaires), le board y envoie la personne, qui revient sur Connexions. L'adresse de retour est construite par l'API, jamais reçue du navigateur. Au retour, une tâche liste les comptes du profil (`GET /v1/accounts?profileId=`). Vérifié sur docs.zernio.com le 2026-11-19.

**Isolement.** La clé de Pann atteint tous les profils : la tâche de publication n'accepte qu'un compte de la liste du profil de l'espace ; un compte d'un autre espace mis dans les réglages d'un thème est refusé (`channel_not_configured`). Table `zernio_platform_links` (lecture : membres ; écriture : fonctions et tâches).

## 2026-11-19 : Thème en pause, identité visuelle par type de contenu

**Pause.** `topics.active` (déjà en base) se règle depuis l'Aperçu, qui montre aussi ce qui tourne (sources de veille, recherches de conversations, clé d'IA, comptes de publication). Un thème en pause ne collecte plus, ne trie plus, ne rédige plus de lui-même, et `claim_due_posts` ignore ses posts : ils attendent la reprise au lieu d'être perdus.

**Types de contenu.** Trois couleurs (`--color-kind-publication`, `-conversation`, `-creation`, chacune avec sa version `-soft`), toujours doublées d'une icône et d'un libellé : la couleur seule ne porte jamais l'information. `ContentCard` (liste ou compacte, bord coloré, icône ronde, type en petites capitales) sert aux idées, brouillons et publications à venir ; les éléments du calendrier, de la file de la Création et les conversations reprennent le même bord et la même icône. `StatTile` remplace les compteurs de l'Aperçu (toute la tuile est un lien).

**Profondeur.** Deux niveaux d'ombre (`--shadow-card`, `--shadow-raised` au survol) ; les boutons n'ont plus de soulignement et gagnent une taille `small`.

**Icônes.** Tabler Icons (`@tabler/icons-vue`, version figée) via `components/Icon.vue`, qui n'expose qu'une liste choisie (taille du paquet, cohérence). Toujours décoratives (`aria-hidden`) : le texte du bouton reste le nom accessible.

## 2026-11-20 : ordre stable des listes, onglets qui défilent

**Ordre stable.** Les listes de la veille et des conversations se trient par pertinence, puis date d'entrée dans le thème, puis `item_id`. Les éléments d'une même collecte partagent leur `created_at` (une seule transaction) : sans clé unique en dernier, Postgres rendait les ex æquo dans un ordre libre, qui changeait après une action ou d'une page à l'autre.

**Onglets qui défilent.** Plus de barre de défilement : un fondu à gauche ou à droite (masque CSS) signale les onglets cachés, posé par la directive `v-scroll-active`, qui garde aussi l'onglet courant en vue. La molette verticale fait défiler la rangée tant qu'elle le peut, puis la page reprend. Au clavier, `scroll-padding-inline` garde l'onglet atteint hors des fondus.

## 2026-11-21 : pause de la collecte au-delà d'un nombre d'éléments à trier

**Réglage par outil.** `collection.pause_above` (veille) et `engagement.pause_above` (conversations), entre 10 et 5 000, `null` par défaut (pas de pause) : une collecte programmée attend tant que l'outil a au moins ce nombre d'éléments en `new` pour le thème. Rien ne change pour les thèmes existants tant que la personne ne coche pas la case (Réglages, Tri pour la veille ; Réglages, Conversations).

**Reprise d'elle-même.** Les sources concernées restent « dues » : le cron les compte à chaque passage (une requête `count` par thème et par outil, seulement pour ceux qui ont un seuil) et elles repartent dès que le tri passe sous le seuil, sans état à tenir. Elles ne prennent pas de place dans le lot de 10 sources par passage pendant l'attente. « Collecter maintenant » passe outre : c'est une demande explicite.

**Visible.** Au-dessus de la liste À trier, un avertissement dit combien d'éléments attendent, le seuil, et mène au réglage. Dans l'Aperçu, la ligne de l'outil passe « à faire » avec les mêmes chiffres.

## 2026-11-21 : enregistrement automatique des textes

**Où.** Les textes qu'on relit et retouche (posts, résumés, premier commentaire, textes alternatifs, « Sujet et matière » d'une Création) s'enregistrent seuls : une seconde après la dernière frappe, en quittant le champ, et en quittant la page (`lib/autosave.ts`). Les formulaires de réglages gardent un bouton : ils se valident ensemble et une valeur à moitié tapée n'y a pas de sens.

**Comment.** Un seul enregistrement à la fois ; une frappe pendant l'envoi repart juste après. La valeur envoyée est une copie, et « modifié » compare à la fois à la valeur du serveur et au dernier envoi réussi, pour ne pas renvoyer un texte en attendant le rechargement. Fermer l'onglet avec un changement non enregistré fait demander le navigateur. Une ligne discrète dit l'état ; seule l'issue (enregistré, erreur) est annoncée aux lecteurs d'écran, pas chaque « Enregistrement… ».

## 2026-11-21 : doublons

**Même page.** `normalizeUrl` compte une seule fois les versions d'une même page : AMP (`/amp` en fin de chemin, `?amp=1`, `?outputType=amp`), hôte mobile (`m.`, `mobile.`) et `index.html` ou `index.php` en fin de chemin. L'adresse gardée est la version de bureau, qui sert aussi de lien dans les posts. Un élément déjà collecté sous une ancienne forme peut revenir une fois : pas de migration des adresses existantes, le cas est rare et sans perte.

**Même sujet.** Le tri reçoit, après le contenu, les titres des 40 derniers éléments du thème (14 jours, triés, hors archives) et peut nommer celui qui raconte la même histoire (même nouvelle, autre site ou autres mots). L'élément garde son score et sa place : la carte dit « Même sujet que » avec un lien, la personne décide. Pas de rejet automatique : deux articles sur une même nouvelle n'apportent pas toujours la même chose. Colonne `item_topics.same_story_of`, écrite par le job seul, sans clé étrangère pour ne pas rendre ambiguës les jointures `item:items (...)` de l'API.

**Pas retenu.** Lire la balise `<link rel="canonical">` de chaque page : il faudrait charger chaque page dès la collecte, alors qu'elle ne l'est qu'à la rédaction.

## 2026-11-21 : réponses aux conversations

**Proposition de réponse.** Sur une conversation « À répondre », « Proposer une réponse » fait rédiger une réponse par l'IA (job `engagement-reply`, clé Anthropic de l'espace, budget du thème, modèle de rédaction). La requête passe par la fonction `request_reply_draft`, qui vérifie l'accès (`private.can_access_topic`) avant de marquer la demande ; le job écrit avec la clé secrète. Le prompt ne contient que le fonctionnement de l'outil : aider d'abord, s'en tenir à la conversation et à la fiche produit, dire son lien avec le produit quand on le cite (avec la phrase de la fiche si elle existe), la limite de la plateforme (300 caractères sur Bluesky). Le style vient de `ai.style_rules`. La réponse se retouche avec l'enregistrement automatique et se copie : Pann ne publie jamais.

**Marquer comme répondu.** Une conversation n'a pas de publication : `published` veut dire « répondue par la personne ». Transitions `validated → published` et retour, pour l'outil Conversations seulement (`status.ts` et le trigger SQL). `replied_at` date la réponse. Nouvel onglet « Répondues ».

**Limite par communauté.** `engagement.weekly_replies` (3 par défaut, `null` pour aucune) : au-delà, sur 7 jours glissants, la carte rappelle qu'une réponse de plus risque de passer pour de la promotion. Un rappel, jamais un blocage. La communauté est la plateforme (Hacker News, Bluesky) tant qu'aucune source ne donne mieux (`communityOf`).

## 2026-11-21 : tri sur Haiku 5.5, coûts par jour et par post

**Haiku 5.5.** Le tri (veille et conversations) passe de Haiku 4.5 à Haiku 5.5 : dix fois moins cher (0,10 $ / 0,50 $ par million de tokens), qualité déjà vérifiée par Geoffrey sur un autre outil. Le modèle réfléchit avant de répondre et cette réflexion compte dans `max_tokens` : effort `low` et 2 048 tokens de marge. Les thèmes qui avaient l'ancien défaut enregistré passent au nouveau (migration) ; un autre choix est gardé.

**Coûts lisibles.** Le Budget du thème donne le coût moyen par appel, par jour, par post rédigé et par post publié, et la projection du mois. L'espace d'admin liste chaque espace avec tout ce qu'il a dépensé (ses clés ou celles de Pann), la part payée par Pann, le coût par jour et par post publié (`platform_workspace_stats`) : de quoi fixer les quotas des offres sur l'usage réel.

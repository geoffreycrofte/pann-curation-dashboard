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

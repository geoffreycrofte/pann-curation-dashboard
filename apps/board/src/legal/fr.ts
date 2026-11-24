import type { LegalDocs } from './types'

const UPDATED = '22 novembre 2026'

export default {
  legal: {
    title: 'Mentions légales',
    lead: 'Qui édite Glimr, où il est hébergé, et comment me joindre.',
    updated: UPDATED,
    sections: [
      {
        id: 'editor',
        title: 'Éditeur',
        blocks: [
          {
            p: 'Glimr (glimr.cc) est édité par Crofte Studio S.à r.l.-S, société à responsabilité limitée simplifiée de droit luxembourgeois.',
          },
          {
            list: [
              'Siège social : 43, rue d’Anvers, L-1130 Luxembourg',
              'Registre de commerce et des sociétés : B310079',
              'Numéro de TVA : LU37891138',
              'Directeur de la publication : Geoffrey Crofte',
              'Contact : {email}',
            ],
          },
        ],
      },
      {
        id: 'hosting',
        title: 'Hébergement',
        blocks: [
          {
            list: [
              'Application et site : Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis (Cloudflare Workers).',
              'Base de données, authentification et fichiers : Supabase, Inc., données hébergées dans l’Union européenne (région de Paris, France).',
            ],
          },
        ],
      },
      {
        id: 'ip',
        title: 'Propriété intellectuelle',
        blocks: [
          {
            p: 'Le nom Glimr, son logo, ses illustrations, ses textes et son code sont la propriété de Crofte Studio S.à r.l.-S. Toute reproduction sans autorisation écrite est interdite.',
          },
          {
            p: 'Les contenus que vous créez dans Glimr (réglages, brouillons, posts, images) restent les vôtres, comme le précisent les [conditions générales](/terms).',
          },
        ],
      },
      {
        id: 'documents',
        title: 'Autres documents',
        blocks: [
          {
            list: [
              '[Conditions générales](/terms) : l’usage du service, l’essai, l’abonnement et la résiliation.',
              '[Confidentialité et cookies](/privacy) : les données traitées, pourquoi, combien de temps, et vos droits.',
              '[Accessibilité](/accessibility) : le niveau visé, comment Glimr est vérifié, et comment signaler un problème.',
            ],
          },
        ],
      },
    ],
  },

  terms: {
    title: 'Conditions générales',
    lead: 'Les règles d’usage de Glimr, de l’essai gratuit à la résiliation. En utilisant le service, vous les acceptez.',
    updated: UPDATED,
    sections: [
      {
        id: 'purpose',
        title: '1. Objet',
        blocks: [
          {
            p: 'Glimr (« le Service ») est exploité par Crofte Studio S.à r.l.-S, Luxembourg (RCS B310079, TVA LU37891138) (« je », « moi »). Ces conditions générales (« les Conditions ») régissent l’usage du Service et de toutes ses fonctionnalités.',
          },
          {
            p: 'En créant un compte ou en utilisant le Service, vous acceptez les Conditions. Si vous n’êtes pas d’accord avec l’une d’elles, n’utilisez pas le Service.',
          },
        ],
      },
      {
        id: 'service',
        title: '2. Le Service',
        blocks: [
          {
            p: 'Glimr aide à faire connaître un produit ou un sujet (un « thème »). Selon les outils activés, il :',
          },
          {
            list: [
              'collecte des articles et des conversations depuis les sources que vous choisissez ;',
              'les trie avec l’aide d’une intelligence artificielle, selon vos critères ;',
              'rédige des résumés, des posts, des réponses et des newsletters, dans les langues de votre choix ;',
              'publie sur les réseaux et services que vous connectez, au moment que vous choisissez ;',
              'expose vos contenus à des assistants IA compatibles MCP, avec votre autorisation.',
            ],
          },
          {
            p: 'Le Service est destiné à un usage professionnel. L’ouverture d’un compte se fait sur invitation.',
          },
        ],
      },
      {
        id: 'account',
        title: '3. Compte et espace de travail',
        blocks: [
          {
            p: 'La connexion se fait par un lien envoyé à votre adresse e-mail. Vous êtes responsable de l’accès à cette adresse et de ce qui est fait avec votre compte. Signalez-moi sans délai toute utilisation non autorisée.',
          },
          {
            p: 'Les thèmes, les clés des services connectés et l’abonnement appartiennent à un espace de travail. Son propriétaire gère l’offre, les clés et les membres, et répond de leur usage du Service.',
          },
        ],
      },
      {
        id: 'trial',
        title: '4. Essai gratuit et offres',
        blocks: [
          {
            p: 'Chaque nouvel espace de travail bénéficie de 14 jours d’essai gratuit sur l’offre choisie, sans moyen de paiement. Pendant l’essai, le nombre de tokens fourni par Glimr est réduit. À la fin de l’essai sans abonnement, les thèmes sont mis en pause : rien n’est supprimé, et tout reprend dès l’abonnement.',
          },
          {
            p: 'Les offres, leurs limites (nombre de thèmes, de comptes, de tokens) et leurs prix sont présentés sur la page [Tarifs](/pricing).',
          },
          {
            list: [
              'Offres où Glimr fournit l’IA et la recherche : un quota mensuel de tokens est inclus. Quand il est atteint, les tâches d’IA s’arrêtent jusqu’au mois suivant, sauf si vous ajoutez vos propres clés.',
              'Offre « Perso » : vous utilisez vos propres clés (IA, recherche, publication). Vous payez ces services directement, selon leurs propres conditions.',
            ],
          },
        ],
      },
      {
        id: 'payment',
        title: '5. Prix et paiement',
        blocks: [
          {
            p: 'Les prix sont indiqués en euros, hors taxes. La TVA est ajoutée selon votre adresse de facturation. Une entreprise établie dans l’Union européenne qui fournit un numéro de TVA valide est facturée sans TVA (autoliquidation).',
          },
          {
            p: 'Le paiement est traité par Stripe. L’abonnement se paie d’avance, au mois ou à l’année, et se renouvelle automatiquement à chaque échéance. Si vous vous abonnez pendant l’essai, les jours d’essai restants sont conservés et le premier paiement a lieu à la fin de l’essai.',
          },
          {
            p: 'Les factures sont disponibles dans votre espace client Stripe, depuis Profil, Espace de travail, Gérer l’abonnement.',
          },
          {
            p: 'Si un paiement échoue, Stripe le retente pendant quelques jours et le Service continue. Si le paiement n’aboutit pas, les thèmes sont mis en pause jusqu’à sa régularisation.',
          },
        ],
      },
      {
        id: 'cancel',
        title: '6. Changement d’offre et résiliation',
        blocks: [
          {
            p: 'Vous pouvez changer d’offre ou résilier à tout moment depuis Gérer l’abonnement. La résiliation prend effet à la fin de la période déjà payée : le Service reste disponible jusque-là, puis les thèmes sont mis en pause.',
          },
          {
            p: 'Un remboursement intégral n’est pas possible si une quantité significative de tokens d’IA a été utilisée pendant la période d’essai. Chaque demande de remboursement est étudiée avec attention : écrivez à {email}.',
          },
        ],
      },
      {
        id: 'content',
        title: '7. Vos contenus et l’IA',
        blocks: [
          {
            p: 'Vous restez propriétaire des contenus que vous créez ou importez. Vous m’accordez seulement le droit de les traiter pour faire fonctionner le Service.',
          },
          {
            p: 'Les tris, résumés, posts et réponses sont produits par une intelligence artificielle. Ils peuvent contenir des erreurs. Relisez-les avant de les publier : rien ne part sans votre validation ou votre programmation, et vous êtes responsable de ce qui est publié en votre nom.',
          },
          {
            p: 'Il vous revient de respecter les conditions des réseaux sur lesquels vous publiez et les droits des auteurs des sources que vous citez.',
          },
          {
            p: 'Vos contenus ne sont ni vendus ni utilisés pour entraîner des modèles d’IA. Le détail est dans la [politique de confidentialité](/privacy).',
          },
        ],
      },
      {
        id: 'third-parties',
        title: '8. Services tiers',
        blocks: [
          {
            p: 'Glimr publie et envoie par des services tiers que vous connectez (réseaux sociaux, services de newsletter, fournisseurs d’IA). En les connectant, vous autorisez Glimr à agir en votre nom auprès d’eux, dans la limite de ce que vous demandez. Je ne réponds ni de leur disponibilité ni de leurs changements de conditions.',
          },
        ],
      },
      {
        id: 'use',
        title: '9. Utilisation appropriée',
        blocks: [
          { p: 'Vous vous engagez à ne pas :' },
          {
            list: [
              'utiliser le Service à des fins illégales, trompeuses ou pour diffuser des messages non sollicités en masse ;',
              'tenter d’accéder aux comptes ou aux données d’autres utilisateurs ;',
              'téléverser du code malveillant ou des contenus illicites ;',
              'perturber le Service ou ses serveurs, ou y accéder par des moyens automatisés sans autorisation.',
            ],
          },
        ],
      },
      {
        id: 'availability',
        title: '10. Disponibilité',
        blocks: [
          {
            p: 'Je fais de mon mieux pour que le Service soit disponible en permanence, sans pouvoir le garantir : maintenance, correctifs de sécurité, incidents chez un prestataire ou force majeure peuvent l’interrompre. Les maintenances prévues sont annoncées à l’avance quand elles gênent l’usage.',
          },
        ],
      },
      {
        id: 'liability',
        title: '11. Responsabilité',
        blocks: [
          {
            p: 'Le Service est fourni « tel quel ». Dans les limites permises par la loi, je ne donne aucune garantie expresse ou implicite, notamment d’adéquation à un usage particulier.',
          },
          {
            p: 'Je ne suis pas responsable des dommages indirects, dont la perte de bénéfices, de données ou d’image. Ma responsabilité totale, pour toute réclamation liée au Service, est limitée au montant que vous avez payé pour le Service au cours des douze mois précédant la réclamation.',
          },
        ],
      },
      {
        id: 'ip',
        title: '12. Propriété intellectuelle',
        blocks: [
          {
            p: 'Le Service, son code, son nom, son logo et ses illustrations sont la propriété de Crofte Studio S.à r.l.-S. Vous ne pouvez pas les copier, les modifier ou les revendre sans mon autorisation écrite.',
          },
        ],
      },
      {
        id: 'termination',
        title: '13. Suspension et clôture',
        blocks: [
          {
            p: 'Vous pouvez supprimer votre compte à tout moment depuis Profil, Sécurité et compte. Un compte inactif pendant un an est supprimé, après un e-mail d’avertissement envoyé un mois avant. Je peux suspendre ou clôturer un compte, sans préavis, en cas de violation des Conditions ou d’usage nuisible au Service ou à d’autres utilisateurs.',
          },
        ],
      },
      {
        id: 'data',
        title: '14. Données personnelles',
        blocks: [
          {
            p: 'Les données personnelles sont traitées conformément au règlement (UE) 2016/679 (RGPD), comme le décrit la [politique de confidentialité](/privacy).',
          },
        ],
      },
      {
        id: 'changes',
        title: '15. Modifications',
        blocks: [
          {
            p: 'Je peux modifier les Conditions. Les changements importants sont annoncés par e-mail avant leur entrée en vigueur. Continuer à utiliser le Service ensuite vaut acceptation.',
          },
        ],
      },
      {
        id: 'law',
        title: '16. Droit applicable et langue',
        blocks: [
          {
            p: 'Les Conditions sont régies par le droit luxembourgeois. En cas de litige, les parties cherchent d’abord une solution amiable ; à défaut, les tribunaux de Luxembourg-Ville sont seuls compétents, sous réserve des règles qui protègent les consommateurs.',
          },
          {
            p: 'Les Conditions sont rédigées en français. Leurs traductions sont fournies pour faciliter la lecture : en cas de divergence, la version française fait foi.',
          },
        ],
      },
      {
        id: 'contact',
        title: '17. Contact',
        blocks: [
          {
            p: 'Une question sur ces Conditions : {email}.',
          },
        ],
      },
    ],
  },

  privacy: {
    title: 'Confidentialité et cookies',
    lead: 'Les données que Glimr traite, pourquoi, combien de temps, qui d’autre les voit, et vos droits.',
    updated: UPDATED,
    sections: [
      {
        id: 'controller',
        title: '1. Responsable du traitement',
        blocks: [
          {
            list: [
              'Crofte Studio S.à r.l.-S, Luxembourg, RCS B310079, TVA LU37891138.',
              'Contact : {email}.',
              'Délégué à la protection des données : non requis par l’article 37 du RGPD. Les questions sont traitées directement par l’exploitant.',
              'Autorité de contrôle : Commission nationale pour la protection des données (CNPD), Luxembourg.',
            ],
          },
        ],
      },
      {
        id: 'collected',
        title: '2. Ce que je collecte',
        blocks: [
          { p: 'Seulement ce dont le Service a besoin pour fonctionner et être payé :' },
          {
            list: [
              'Compte : adresse e-mail, nom affiché, langue, thème clair ou sombre, espaces de travail dont vous êtes membre.',
              'Demande d’accès : nom, adresse e-mail et message envoyés depuis le formulaire.',
              'Facturation : offre, statut de l’abonnement, adresse de facturation, numéro de TVA et factures. Les numéros de carte ne passent jamais par Glimr : Stripe les traite directement.',
              'Contenu des thèmes : sources, articles et conversations collectés, réglages, brouillons, posts, images téléversées.',
              'Clés des services que vous connectez : chiffrées dans Supabase Vault, jamais réaffichées.',
              'Usage : consommation de tokens et coût de chaque opération d’IA ou de recherche, pour appliquer les quotas et suivre les coûts.',
              'Données techniques : adresse IP et navigateur dans les journaux des hébergeurs.',
            ],
          },
        ],
      },
      {
        id: 'purposes',
        title: '3. Pourquoi, et sur quelle base légale',
        blocks: [
          {
            table: {
              caption: 'Finalités, données utilisées et bases légales',
              head: ['Finalité', 'Données', 'Base légale'],
              rows: [
                [
                  'Fournir le Service et votre compte',
                  'Compte, contenu des thèmes, clés, usage',
                  'Exécution du contrat, article 6.1.b',
                ],
                [
                  'Gérer l’essai, l’abonnement et la facturation',
                  'Facturation, compte, usage',
                  'Exécution du contrat, article 6.1.b',
                ],
                [
                  'Tenir la comptabilité',
                  'Factures, facturation',
                  'Obligation légale, article 6.1.c',
                ],
                [
                  'Répondre à une demande d’accès',
                  'Demande d’accès',
                  'Mesures précontractuelles, article 6.1.b',
                ],
                [
                  'Sécurité et prévention des abus',
                  'Données techniques, compte',
                  'Intérêt légitime, article 6.1.f',
                ],
                [
                  'E-mails liés au compte et à l’abonnement',
                  'Compte, facturation',
                  'Exécution du contrat, article 6.1.b',
                ],
              ],
            },
          },
          {
            p: 'Quand je m’appuie sur l’intérêt légitime, je l’ai mis en balance avec vos droits. Vous pouvez vous y opposer à tout moment (article 21).',
          },
        ],
      },
      {
        id: 'ai',
        title: '4. Vos contenus et l’IA',
        blocks: [
          {
            p: 'Pour trier et rédiger, Glimr envoie le texte nécessaire (article collecté, réglages du thème) au fournisseur d’IA, le temps de la requête. Avec les offres où Glimr fournit l’IA, il s’agit d’Anthropic (Claude), qui n’utilise pas ces données pour entraîner ses modèles. Avec vos propres clés, la requête part chez le fournisseur que vous avez choisi, selon votre contrat avec lui.',
          },
          {
            p: 'Vos contenus ne sont ni vendus, ni partagés à des fins publicitaires, ni utilisés pour entraîner des modèles.',
          },
        ],
      },
      {
        id: 'processors',
        title: '5. Qui d’autre voit les données',
        blocks: [
          {
            p: 'Quelques prestataires font fonctionner Glimr. Chacun n’agit que sur mes instructions, dans le cadre d’un accord de traitement des données.',
          },
          {
            table: {
              caption: 'Sous-traitants de Glimr',
              head: ['Prestataire', 'Rôle', 'Données concernées'],
              rows: [
                [
                  'Supabase',
                  'Base de données, authentification, fichiers (région de Paris)',
                  'Toutes les données du Service',
                ],
                [
                  'Cloudflare',
                  'Hébergement de l’application, réseau',
                  'Requêtes, données techniques',
                ],
                ['Stripe', 'Paiement et factures', 'Facturation, adresse e-mail'],
                [
                  'Resend',
                  'E-mails de connexion et du service',
                  'Adresse e-mail, contenu des e-mails',
                ],
                [
                  'Anthropic',
                  'IA, quand Glimr la fournit',
                  'Textes envoyés pour le tri et la rédaction',
                ],
                [
                  'Exa',
                  'Recherche web, quand Glimr la fournit',
                  'Requêtes de recherche de vos thèmes',
                ],
                [
                  'Zernio',
                  'Publication sur LinkedIn et Facebook, quand Glimr la fournit',
                  'Posts à publier, comptes connectés',
                ],
              ],
            },
          },
          {
            p: 'Les services que vous connectez vous-même avec vos clés (réseaux, newsletter, IA) reçoivent ce que vous leur faites publier ou traiter, selon votre propre contrat avec eux.',
          },
          {
            p: 'Certains prestataires sont établis hors de l’Espace économique européen, surtout aux États-Unis. Ces transferts reposent sur les clauses contractuelles types de la Commission européenne ou, le cas échéant, sur le Data Privacy Framework UE-États-Unis.',
          },
          {
            p: 'En dehors de ces prestataires, je ne communique des données que si une loi ou une décision de justice l’exige.',
          },
        ],
      },
      {
        id: 'retention',
        title: '6. Combien de temps',
        blocks: [
          {
            table: {
              caption: 'Durées de conservation par catégorie de données',
              head: ['Données', 'Conservation'],
              rows: [
                [
                  'Compte et contenu des thèmes',
                  'Pendant la vie du compte. Un compte inactif pendant un an est supprimé, après un e-mail d’avertissement envoyé un mois avant.',
                ],
                ['Thème supprimé', 'Ses contenus sont supprimés avec lui'],
                ['Demande d’accès refusée', '1 an après la réponse'],
                [
                  'Factures et données comptables',
                  '10 ans, comme l’exige le droit comptable luxembourgeois',
                ],
                ['Sauvegardes de la base', 'Effacées au plus tard 7 jours après la suppression'],
                ['Journaux techniques', 'Durées fixées par les hébergeurs'],
              ],
            },
          },
        ],
      },
      {
        id: 'security',
        title: '7. Sécurité',
        blocks: [
          {
            list: [
              'Chiffrement des échanges (TLS) et des données au repos.',
              'Connexion sans mot de passe, par lien envoyé par e-mail.',
              'Clés des services chiffrées dans Supabase Vault, jamais renvoyées au navigateur.',
              'Sécurité au niveau des lignes de la base : une requête ne peut pas atteindre les données d’un autre espace de travail.',
            ],
          },
        ],
      },
      {
        id: 'rights',
        title: '8. Vos droits',
        blocks: [
          {
            p: 'Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, la limitation du traitement, une copie portable, et vous opposer aux traitements fondés sur l’intérêt légitime.',
          },
          {
            p: 'Une partie se fait sans rien demander : votre profil se modifie dans Profil, et le compte se supprime dans Profil, Sécurité et compte. Pour le reste, écrivez à {email}. Je réponds dans un délai d’un mois.',
          },
          {
            p: 'Si ma réponse ne vous satisfait pas, vous pouvez saisir la CNPD ([cnpd.public.lu](https://cnpd.public.lu)) ou l’autorité de contrôle de votre pays.',
          },
        ],
      },
      {
        id: 'cookies',
        title: '9. Cookies et stockage local',
        blocks: [
          {
            p: 'Glimr ne dépose aucun cookie et ne mesure pas l’audience. C’est pourquoi il n’y a pas de bandeau de consentement : seul le stockage strictement nécessaire est utilisé, ce que l’article 5.3 de la directive ePrivacy dispense de consentement.',
          },
          {
            table: {
              caption: 'Ce que Glimr garde dans votre navigateur',
              head: ['Élément', 'Rôle', 'Durée'],
              rows: [
                [
                  'Session de connexion',
                  'Vous garder connecté',
                  'Jusqu’à la déconnexion, renouvelée pendant l’usage',
                ],
                [
                  'Langue et thème',
                  'Retenir la langue et le thème clair ou sombre',
                  'Jusqu’à effacement',
                ],
                [
                  'Préférences d’affichage',
                  'Retenir de petits choix, comme un panneau replié',
                  'Jusqu’à effacement',
                ],
              ],
            },
          },
          {
            p: 'Sur ses pages de paiement, Stripe dépose ses propres cookies pour prévenir la fraude, sous sa responsabilité.',
          },
        ],
      },
      {
        id: 'children',
        title: '10. Mineurs',
        blocks: [
          {
            p: 'Glimr est un outil professionnel, qui ne s’adresse pas aux enfants. Je ne crée pas sciemment de compte pour une personne de moins de 16 ans.',
          },
        ],
      },
      {
        id: 'changes',
        title: '11. Modifications',
        blocks: [
          {
            p: 'Quand cette politique change sur le fond, sa date de mise à jour change aussi, et les titulaires d’un compte sont prévenus par e-mail.',
          },
        ],
      },
    ],
  },
  accessibility: {
    title: 'Accessibilité',
    lead: 'Le niveau d’accessibilité visé par Glimr, comment il est vérifié, et comment me signaler un problème.',
    updated: '22 novembre 2026',
    intro: [
      {
        p: 'Crofte Studio n’a aucune obligation légale en matière d’accessibilité : la [loi du 8 mars 2023 relative aux exigences en matière d’accessibilité applicables aux produits et services](https://legilux.public.lu/eli/etat/leg/loi/2023/03/08/a133/jo) exempte les microentreprises. Je vise malgré tout, personnellement, le niveau AA du RAWeb (référentiel d’évaluation de l’accessibilité web luxembourgeois) : Glimr est conçu dès le départ dans ce but.',
      },
      { p: 'La présente déclaration d’accessibilité s’applique à Glimr et à toutes ses pages.' },
    ],
    sections: [
      {
        id: 'what',
        title: 'Qu’est-ce que l’accessibilité numérique ?',
        blocks: [
          {
            p: 'Chacun doit pouvoir utiliser et consulter facilement les informations figurant sur un site web ou une application, notamment les personnes présentant un handicap et les personnes utilisant des logiciels d’assistance ou du matériel spécialisé (par exemple en raison de handicaps visuels, auditifs, physiques ou cognitifs).',
          },
        ],
      },
      {
        id: 'status',
        title: 'État de conformité',
        blocks: [
          {
            p: 'Glimr n’a pas encore fait l’objet d’une évaluation complète selon le RAWeb : aucun statut de conformité n’est donc revendiqué pour l’instant.',
          },
        ],
      },
      {
        id: 'features',
        title: 'Fonctionnalités d’accessibilité',
        blocks: [
          {
            list: [
              'Contrastes des couleurs de l’interface vérifiés automatiquement, en mode clair et en mode sombre',
              'Modes clair et sombre, selon le réglage de votre système ou votre propre choix',
              'Contenu qui peut être agrandi et qui s’adapte aux écrans étroits',
              'Toutes les fonctionnalités utilisables au clavier, avec un focus visible et un lien d’évitement',
              'Un langage clair et des pages bien structurées',
              'Votre préférence de réduction des animations est respectée',
              'Des aides contextuelles qui expliquent les réglages techniques directement dans l’interface',
            ],
          },
        ],
      },
      {
        id: 'testing',
        title: 'Comment Glimr est vérifié',
        blocks: [
          {
            p: 'À chaque modification de Glimr, les contrastes de toutes les couleurs de l’interface sont vérifiés automatiquement selon les seuils AA, en mode clair et en mode sombre.',
          },
          {
            p: 'Les vérifications automatiques ne trouvent qu’une partie des problèmes possibles. Des vérifications manuelles au clavier, avec des lecteurs d’écran et d’autres technologies d’assistance, les complètent.',
          },
        ],
      },
      {
        id: 'report',
        title: 'Signaler un problème',
        blocks: [
          {
            p: 'Si vous constatez un problème d’accessibilité, écrivez-moi à {email} : décrivez le problème et la page concernée. Je réponds par e-mail dans un délai d’un mois au plus tard. Je privilégie la correction du problème directement dans Glimr. Si cela n’est pas possible rapidement, je vous transmets l’information souhaitée dans un format accessible de votre choix :',
          },
          {
            list: [
              'par écrit, dans un document ou un e-mail ;',
              'à l’oral, lors d’un entretien ou par téléphone.',
            ],
          },
        ],
      },
      {
        id: 'unsatisfied',
        title: 'Si vous n’êtes pas satisfait ou satisfaite',
        blocks: [
          {
            p: 'Si ma réponse ne vous satisfait pas, vous pouvez le signaler à l’OSAPS, l’organisme luxembourgeois qui surveille l’accessibilité des produits et services, au moyen de son [formulaire de signalement](https://accessibilite-produits-services.public.lu/fr/communaute/signaler.html).',
          },
        ],
      },
    ],
    outro: [
      {
        p: 'La présente déclaration se base sur le modèle défini par la décision d’exécution (UE) 2018/1523. Ce modèle appartient à l’Union européenne et est publié sous licence [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.fr).',
      },
    ],
  },
  affiliates: {
    title: 'Liens affiliés',
    lead: 'Pourquoi certains liens d’inscription de la page Connexions sont des liens affiliés, et ce que cela change pour vous.',
    updated: '23 novembre 2026',
    sections: [
      {
        id: 'what',
        title: 'De quoi s’agit-il',
        blocks: [
          {
            p: 'Avec l’offre « Perso », vous ouvrez vous-même vos comptes chez les services que Glimr utilise (IA, recherche, publication, newsletter). Pour certains d’entre eux, la page Connexions propose un lien d’inscription marqué « lien affilié ».',
          },
          {
            p: 'Si vous créez votre compte par ce lien, le service peut verser une commission à Crofte Studio S.à r.l.-S, qui édite Glimr.',
          },
        ],
      },
      {
        id: 'you',
        title: 'Ce que cela change pour vous',
        blocks: [
          {
            list: [
              'Rien sur le prix : vous payez le service au même tarif, sans surcoût.',
              'Rien sur le choix : vous pouvez créer votre compte sans passer par le lien, Glimr fonctionne de la même façon.',
              'Aucune donnée de vos thèmes n’est transmise au service par le lien : il sait seulement que vous venez de Glimr.',
            ],
          },
        ],
      },
      {
        id: 'choice',
        title: 'Comment les services sont choisis',
        blocks: [
          {
            p: 'Glimr ne propose de lien que pour les services qu’il sait utiliser et qu’il utilise lui-même. Une commission ne décide jamais de l’ajout d’un service : un service est proposé parce qu’il fonctionne avec Glimr, pas parce qu’il rapporte.',
          },
        ],
      },
      {
        id: 'contact',
        title: 'Une question',
        blocks: [{ p: 'Écrivez à {email}.' }],
      },
    ],
  },
} satisfies LegalDocs

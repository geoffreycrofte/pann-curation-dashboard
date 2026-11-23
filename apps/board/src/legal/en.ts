import type { LegalDocs } from './types'

const UPDATED = '22 November 2026'

export default {
  legal: {
    title: 'Legal notice',
    lead: 'Who publishes Glimr, where it is hosted, and how to reach me.',
    updated: UPDATED,
    sections: [
      {
        id: 'editor',
        title: 'Publisher',
        blocks: [
          {
            p: 'Glimr (glimr.cc) is published by Crofte Studio S.à r.l.-S, a simplified limited liability company under Luxembourg law.',
          },
          {
            list: [
              'Registered office: 43, rue d’Anvers, L-1130 Luxembourg',
              'Trade and companies register: B310079',
              'VAT number: LU37891138',
              'Publication director: Geoffrey Crofte',
              'Contact: {email}',
            ],
          },
        ],
      },
      {
        id: 'hosting',
        title: 'Hosting',
        blocks: [
          {
            list: [
              'Application and website: Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, United States (Cloudflare Workers).',
              'Database, authentication and files: Supabase, Inc., data hosted in the European Union (Paris region, France).',
            ],
          },
        ],
      },
      {
        id: 'ip',
        title: 'Intellectual property',
        blocks: [
          {
            p: 'The Glimr name, its logo, illustrations, texts and code belong to Crofte Studio S.à r.l.-S. Any reproduction without written permission is forbidden.',
          },
          {
            p: 'The content you create in Glimr (settings, drafts, posts, images) stays yours, as the [terms](/terms) state.',
          },
        ],
      },
      {
        id: 'documents',
        title: 'Other documents',
        blocks: [
          {
            list: [
              '[Terms](/terms): using the service, the trial, the subscription and cancellation.',
              '[Privacy and cookies](/privacy): the data processed, why, for how long, and your rights.',
              '[Accessibility](/accessibility): the level aimed at, how Glimr is checked, and how to report a problem.',
            ],
          },
        ],
      },
    ],
  },

  terms: {
    title: 'Terms',
    lead: 'The rules for using Glimr, from the free trial to cancellation. By using the service, you accept them.',
    updated: UPDATED,
    sections: [
      {
        id: 'purpose',
        title: '1. Purpose',
        blocks: [
          {
            p: 'Glimr ("the Service") is operated by Crofte Studio S.à r.l.-S, Luxembourg (RCS B310079, VAT LU37891138) ("I", "me"). These terms ("the Terms") govern the use of the Service and all its features.',
          },
          {
            p: 'By creating an account or using the Service, you accept the Terms. If you disagree with any of them, do not use the Service.',
          },
        ],
      },
      {
        id: 'service',
        title: '2. The Service',
        blocks: [
          {
            p: 'Glimr helps make a product or a subject (a "topic") known. Depending on the tools turned on, it:',
          },
          {
            list: [
              'collects articles and conversations from the sources you choose;',
              'sorts them with the help of artificial intelligence, by your criteria;',
              'drafts summaries, posts, replies and newsletters, in the languages you choose;',
              'publishes to the networks and services you connect, when you choose;',
              'exposes your content to MCP-compatible AI assistants, with your permission.',
            ],
          },
          {
            p: 'The Service is meant for professional use. Accounts are opened on invitation.',
          },
        ],
      },
      {
        id: 'account',
        title: '3. Account and workspace',
        blocks: [
          {
            p: 'You sign in with a link sent to your e-mail address. You are responsible for access to that address and for what is done with your account. Tell me at once about any unauthorised use.',
          },
          {
            p: 'Topics, the keys of connected services and the subscription belong to a workspace. Its owner manages the offer, the keys and the members, and answers for their use of the Service.',
          },
        ],
      },
      {
        id: 'trial',
        title: '4. Free trial and offers',
        blocks: [
          {
            p: 'Every new workspace gets a 14-day free trial of the chosen offer, without a payment method. During the trial, the number of tokens Glimr provides is reduced. When the trial ends without a subscription, topics are paused: nothing is deleted, and everything resumes once you subscribe.',
          },
          {
            p: 'The offers, their limits (topics, accounts, tokens) and their prices are on the [Pricing](/pricing) page.',
          },
          {
            list: [
              'Offers where Glimr provides AI and search: a monthly token quota is included. Once it is reached, AI tasks stop until the next month, unless you add your own keys.',
              '"Own keys" offer: you use your own keys (AI, search, publishing). You pay those services directly, under their own terms.',
            ],
          },
        ],
      },
      {
        id: 'payment',
        title: '5. Prices and payment',
        blocks: [
          {
            p: 'Prices are in euros, excluding tax. VAT is added according to your billing address. A business established in the European Union that gives a valid VAT number is billed without VAT (reverse charge).',
          },
          {
            p: 'Payment is handled by Stripe. The subscription is paid in advance, monthly or yearly, and renews automatically at each term. If you subscribe during the trial, the remaining trial days are kept and the first payment is taken when the trial ends.',
          },
          {
            p: 'Invoices are in your Stripe customer space, from Profile, Workspace, Manage subscription.',
          },
          {
            p: 'If a payment fails, Stripe retries it for a few days and the Service goes on. If the payment does not go through, topics are paused until it is settled.',
          },
        ],
      },
      {
        id: 'cancel',
        title: '6. Changing offer and cancelling',
        blocks: [
          {
            p: 'You can change offer or cancel at any time from Manage subscription. Cancellation takes effect at the end of the period already paid: the Service stays available until then, then topics are paused.',
          },
          {
            p: 'A full refund is not possible if a significant amount of AI tokens was used during the trial period. Every refund request is looked at carefully: write to {email}.',
          },
        ],
      },
      {
        id: 'content',
        title: '7. Your content and AI',
        blocks: [
          {
            p: 'You keep ownership of the content you create or import. You only grant me the right to process it to run the Service.',
          },
          {
            p: 'Sorting, summaries, posts and replies are produced by artificial intelligence. They can contain mistakes. Read them before publishing: nothing goes out without your approval or your scheduling, and you are responsible for what is published in your name.',
          },
          {
            p: 'It is up to you to respect the terms of the networks you publish on and the rights of the authors of the sources you quote.',
          },
          {
            p: 'Your content is neither sold nor used to train AI models. The details are in the [privacy policy](/privacy).',
          },
        ],
      },
      {
        id: 'third-parties',
        title: '8. Third-party services',
        blocks: [
          {
            p: 'Glimr publishes and sends through third-party services you connect (social networks, newsletter services, AI providers). By connecting them, you allow Glimr to act on your behalf with them, within what you ask. I am not responsible for their availability or for changes to their terms.',
          },
        ],
      },
      {
        id: 'use',
        title: '9. Acceptable use',
        blocks: [
          { p: 'You agree not to:' },
          {
            list: [
              'use the Service for illegal or misleading purposes, or to send unsolicited messages in bulk;',
              "try to access other users' accounts or data;",
              'upload malicious code or unlawful content;',
              'disrupt the Service or its servers, or access it by automated means without permission.',
            ],
          },
        ],
      },
      {
        id: 'availability',
        title: '10. Availability',
        blocks: [
          {
            p: 'I do my best to keep the Service available at all times, without being able to guarantee it: maintenance, security fixes, incidents at a provider or force majeure can interrupt it. Planned maintenance is announced in advance when it gets in the way.',
          },
        ],
      },
      {
        id: 'liability',
        title: '11. Liability',
        blocks: [
          {
            p: 'The Service is provided "as is". As far as the law allows, I give no express or implied warranty, including fitness for a particular purpose.',
          },
          {
            p: 'I am not liable for indirect damage, including loss of profits, data or reputation. My total liability, for any claim related to the Service, is limited to the amount you paid for the Service in the twelve months before the claim.',
          },
        ],
      },
      {
        id: 'ip',
        title: '12. Intellectual property',
        blocks: [
          {
            p: 'The Service, its code, name, logo and illustrations belong to Crofte Studio S.à r.l.-S. You may not copy, modify or resell them without my written permission.',
          },
        ],
      },
      {
        id: 'termination',
        title: '13. Suspension and closure',
        blocks: [
          {
            p: 'You can delete your account at any time from Profile, Security and account. An account inactive for one year is deleted, after a warning e-mail sent one month before. I may suspend or close an account, without notice, if the Terms are breached or if its use harms the Service or other users.',
          },
        ],
      },
      {
        id: 'data',
        title: '14. Personal data',
        blocks: [
          {
            p: 'Personal data is processed under Regulation (EU) 2016/679 (GDPR), as the [privacy policy](/privacy) describes.',
          },
        ],
      },
      {
        id: 'changes',
        title: '15. Changes',
        blocks: [
          {
            p: 'I may change the Terms. Important changes are announced by e-mail before they take effect. Going on using the Service afterwards means accepting them.',
          },
        ],
      },
      {
        id: 'law',
        title: '16. Governing law and language',
        blocks: [
          {
            p: 'The Terms are governed by Luxembourg law. In case of dispute, the parties first look for an amicable solution; failing that, the courts of Luxembourg City have sole jurisdiction, subject to the rules that protect consumers.',
          },
          {
            p: 'The Terms are written in French. Translations are provided for convenience: in case of discrepancy, the French version prevails.',
          },
        ],
      },
      {
        id: 'contact',
        title: '17. Contact',
        blocks: [
          {
            p: 'A question about these Terms: {email}.',
          },
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy and cookies',
    lead: 'The data Glimr processes, why, for how long, who else sees it, and your rights.',
    updated: UPDATED,
    sections: [
      {
        id: 'controller',
        title: '1. Controller',
        blocks: [
          {
            list: [
              'Crofte Studio S.à r.l.-S, Luxembourg, RCS B310079, VAT LU37891138.',
              'Contact: {email}.',
              'Data protection officer: not required under Article 37 of the GDPR. Questions are handled directly by the operator.',
              'Supervisory authority: Commission nationale pour la protection des données (CNPD), Luxembourg.',
            ],
          },
        ],
      },
      {
        id: 'collected',
        title: '2. What I collect',
        blocks: [
          { p: 'Only what the Service needs to work and to be paid for:' },
          {
            list: [
              'Account: e-mail address, display name, language, light or dark theme, workspaces you belong to.',
              'Access request: name, e-mail address and message sent from the form.',
              'Billing: offer, subscription status, billing address, VAT number and invoices. Card numbers never go through Glimr: Stripe handles them directly.',
              'Topic content: sources, collected articles and conversations, settings, drafts, posts, uploaded images.',
              'Keys of the services you connect: encrypted in Supabase Vault, never shown again.',
              'Usage: tokens used and the cost of each AI or search operation, to enforce quotas and track costs.',
              "Technical data: IP address and browser in the hosting providers' logs.",
            ],
          },
        ],
      },
      {
        id: 'purposes',
        title: '3. Why, and on what legal basis',
        blocks: [
          {
            table: {
              caption: 'Purposes, data used and legal bases',
              head: ['Purpose', 'Data', 'Legal basis'],
              rows: [
                [
                  'Providing the Service and your account',
                  'Account, topic content, keys, usage',
                  'Performance of the contract, Article 6(1)(b)',
                ],
                [
                  'Managing the trial, subscription and billing',
                  'Billing, account, usage',
                  'Performance of the contract, Article 6(1)(b)',
                ],
                ['Keeping accounts', 'Invoices, billing', 'Legal obligation, Article 6(1)(c)'],
                [
                  'Answering an access request',
                  'Access request',
                  'Pre-contractual steps, Article 6(1)(b)',
                ],
                [
                  'Security and abuse prevention',
                  'Technical data, account',
                  'Legitimate interests, Article 6(1)(f)',
                ],
                [
                  'E-mails about the account and the subscription',
                  'Account, billing',
                  'Performance of the contract, Article 6(1)(b)',
                ],
              ],
            },
          },
          {
            p: 'Where I rely on legitimate interests, I have weighed them against your rights. You can object at any time (Article 21).',
          },
        ],
      },
      {
        id: 'ai',
        title: '4. Your content and AI',
        blocks: [
          {
            p: 'To sort and draft, Glimr sends the text it needs (collected article, topic settings) to the AI provider, for the time of the request. With offers where Glimr provides the AI, that is Anthropic (Claude), which does not use this data to train its models. With your own keys, the request goes to the provider you chose, under your own contract with it.',
          },
          {
            p: 'Your content is not sold, not shared for advertising, and not used to train models.',
          },
        ],
      },
      {
        id: 'processors',
        title: '5. Who else sees the data',
        blocks: [
          {
            p: 'A few providers run Glimr. Each acts only on my instructions, under a data processing agreement.',
          },
          {
            table: {
              caption: "Glimr's processors",
              head: ['Provider', 'Role', 'Data concerned'],
              rows: [
                [
                  'Supabase',
                  'Database, authentication, files (Paris region)',
                  'All the data of the Service',
                ],
                ['Cloudflare', 'Application hosting, network', 'Requests, technical data'],
                ['Stripe', 'Payment and invoices', 'Billing, e-mail address'],
                ['Resend', 'Sign-in and service e-mails', 'E-mail address, e-mail content'],
                ['Anthropic', 'AI, when Glimr provides it', 'Texts sent for sorting and drafting'],
                ['Exa', 'Web search, when Glimr provides it', 'Search queries of your topics'],
                [
                  'Zernio',
                  'Publishing to LinkedIn and Facebook, when Glimr provides it',
                  'Posts to publish, connected accounts',
                ],
              ],
            },
          },
          {
            p: 'The services you connect yourself with your keys (networks, newsletter, AI) receive what you have them publish or process, under your own contract with them.',
          },
          {
            p: 'Some providers are established outside the European Economic Area, mainly in the United States. Those transfers rely on the European Commission’s standard contractual clauses or, where applicable, on the EU-US Data Privacy Framework.',
          },
          {
            p: 'Beyond those providers, I disclose data only where a law or a court order requires it.',
          },
        ],
      },
      {
        id: 'retention',
        title: '6. For how long',
        blocks: [
          {
            table: {
              caption: 'Retention periods by category of data',
              head: ['Data', 'Retention'],
              rows: [
                [
                  'Account and topic content',
                  'For the life of the account. An account inactive for one year is deleted, after a warning e-mail sent one month before.',
                ],
                ['Deleted topic', 'Its content is deleted with it'],
                ['Declined access request', '1 year after the answer'],
                [
                  'Invoices and accounting records',
                  '10 years, as Luxembourg accounting law requires',
                ],
                ['Database backups', 'Erased at most 7 days after deletion'],
                ['Technical logs', 'Periods set by the hosting providers'],
              ],
            },
          },
        ],
      },
      {
        id: 'security',
        title: '7. Security',
        blocks: [
          {
            list: [
              'Encryption in transit (TLS) and at rest.',
              'Passwordless sign-in, with a link sent by e-mail.',
              'Service keys encrypted in Supabase Vault, never sent back to the browser.',
              "Row-level security in the database: a query cannot reach another workspace's data.",
            ],
          },
        ],
      },
      {
        id: 'rights',
        title: '8. Your rights',
        blocks: [
          {
            p: 'You may ask for access to your data, its correction, its erasure, a restriction of processing, a portable copy, and object to processing based on legitimate interests.',
          },
          {
            p: 'Part of it needs no request: your profile is edited in Profile, and the account is deleted in Profile, Security and account. For the rest, write to {email}. I answer within one month.',
          },
          {
            p: 'If my answer does not satisfy you, you may complain to the CNPD ([cnpd.public.lu](https://cnpd.public.lu)) or to the supervisory authority of your country.',
          },
        ],
      },
      {
        id: 'cookies',
        title: '9. Cookies and local storage',
        blocks: [
          {
            p: 'Glimr sets no cookie and does not measure its audience. That is why there is no consent banner: only strictly necessary storage is used, which Article 5(3) of the ePrivacy Directive exempts from consent.',
          },
          {
            table: {
              caption: 'What Glimr keeps in your browser',
              head: ['Item', 'Role', 'Lifetime'],
              rows: [
                [
                  'Sign-in session',
                  'Keeping you signed in',
                  'Until you sign out, renewed while in use',
                ],
                [
                  'Language and theme',
                  'Remembering the language and the light or dark theme',
                  'Until cleared',
                ],
                [
                  'Display preferences',
                  'Remembering small choices, such as a folded panel',
                  'Until cleared',
                ],
              ],
            },
          },
          {
            p: 'On its payment pages, Stripe sets its own cookies to prevent fraud, under its own responsibility.',
          },
        ],
      },
      {
        id: 'children',
        title: '10. Children',
        blocks: [
          {
            p: 'Glimr is a professional tool, not meant for children. I do not knowingly create an account for anyone under 16.',
          },
        ],
      },
      {
        id: 'changes',
        title: '11. Changes',
        blocks: [
          {
            p: 'When this policy changes in substance, its update date changes too, and account holders are told by e-mail.',
          },
        ],
      },
    ],
  },
  accessibility: {
    title: 'Accessibility',
    lead: 'The accessibility level Glimr aims at, how it is checked, and how to tell me about a problem.',
    updated: '22 November 2026',
    intro: [
      {
        p: 'Crofte Studio has no legal obligation regarding accessibility: the [law of 8 March 2023](https://legilux.public.lu/eli/etat/leg/loi/2023/03/08/a133/jo) on the accessibility requirements for products and services exempts microenterprises. Even so, I personally aim at level AA of RAWeb (the Luxembourg web accessibility assessment framework): Glimr is designed for it from the start.',
      },
      { p: 'This accessibility statement applies to Glimr and all its pages.' },
    ],
    sections: [
      {
        id: 'what',
        title: 'What is digital accessibility?',
        blocks: [
          {
            p: 'Everyone should be able to use and consult the information on a website or application easily, especially people with disabilities and people using assistive software or specialised hardware (for example because of visual, auditory, physical or cognitive impairments).',
          },
        ],
      },
      {
        id: 'status',
        title: 'Compliance status',
        blocks: [
          {
            p: 'Glimr has not had a complete RAWeb assessment yet, so no compliance status is claimed for now.',
          },
        ],
      },
      {
        id: 'features',
        title: 'Accessibility features',
        blocks: [
          {
            list: [
              'Interface colour contrast checked automatically, in light and dark mode',
              'Light and dark modes, following your system setting or your own choice',
              'Content that can be zoomed and that reflows on narrow screens',
              'Every feature usable with the keyboard, with a visible focus and a skip link',
              'Plain language and well-structured pages',
              'Your reduced motion preference is respected',
              'Contextual help explaining technical settings right in the interface',
            ],
          },
        ],
      },
      {
        id: 'testing',
        title: 'How Glimr is checked',
        blocks: [
          {
            p: 'Each time Glimr changes, the contrast of every interface colour is checked automatically against the AA thresholds, in light and dark mode.',
          },
          {
            p: 'Automated checks only find part of the possible problems. Manual checks with the keyboard, screen readers and other assistive technologies complete them.',
          },
        ],
      },
      {
        id: 'report',
        title: 'Reporting a problem',
        blocks: [
          {
            p: 'If you notice an accessibility problem, write to me at {email}: describe the problem and the page concerned. I answer by email within one month at the latest. I prefer to fix the problem directly in Glimr. If that is not possible quickly, I send you the information you need in an accessible format of your choice:',
          },
          {
            list: [
              'in writing, in a document or an email;',
              'orally, during an interview or by telephone.',
            ],
          },
        ],
      },
      {
        id: 'unsatisfied',
        title: 'If you are not satisfied',
        blocks: [
          {
            p: 'If my answer does not satisfy you, you can report it to the OSAPS, the Luxembourg body that monitors the accessibility of products and services, through its [reporting form](https://accessibilite-produits-services.public.lu/en/communaute/signaler.html).',
          },
        ],
      },
    ],
    outro: [
      {
        p: 'This statement is based on the model defined by Implementing Decision (EU) 2018/1523. That model belongs to the European Union and is published under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) licence.',
      },
    ],
  },
  affiliates: {
    title: 'Affiliate links',
    lead: 'Why some sign-up links of the Connections page are affiliate links, and what it changes for you.',
    updated: '23 November 2026',
    sections: [
      {
        id: 'what',
        title: 'What it is',
        blocks: [
          {
            p: 'With the "Own keys" offer, you open your own accounts with the services Glimr uses (AI, search, publishing, newsletter). For some of them, the Connections page offers a sign-up link marked "affiliate link".',
          },
          {
            p: 'If you create your account through that link, the service may pay a commission to Crofte Studio S.à r.l.-S, which publishes Glimr.',
          },
        ],
      },
      {
        id: 'you',
        title: 'What it changes for you',
        blocks: [
          {
            list: [
              'Nothing on the price: you pay the service the same rate, at no extra cost.',
              'Nothing on the choice: you can create your account without the link, Glimr works the same way.',
              'No data from your topics goes to the service through the link: it only knows you come from Glimr.',
            ],
          },
        ],
      },
      {
        id: 'choice',
        title: 'How services are chosen',
        blocks: [
          {
            p: 'Glimr only offers links for services it knows how to use and uses itself. A commission never decides whether a service is added: a service is offered because it works with Glimr, not because it pays.',
          },
        ],
      },
      {
        id: 'contact',
        title: 'A question',
        blocks: [{ p: 'Write to {email}.' }],
      },
    ],
  },
} satisfies LegalDocs

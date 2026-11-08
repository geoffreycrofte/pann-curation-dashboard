-- Local development seed (`supabase db reset`). Never run against production.
-- Creates a dev user (magic links land in the local Inbucket/Mailpit inbox),
-- which triggers the creation of its personal workspace, then the first topic.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'dev@pann.local', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

with ws as (
  select workspace_id as id from public.workspace_members
  where user_id = '00000000-0000-4000-8000-000000000001'
), topic as (
  insert into public.topics (workspace_id, slug, name_fr, name_en, monthly_budget_usd, config)
  select ws.id, 'accessibilite', 'Accessibilité numérique', 'Digital accessibility', 10,
  $json${
    "kinds": [
      { "key": "news",     "label_fr": "Actualité", "label_en": "News",     "description": "Announcements, events, industry news." },
      { "key": "legal",    "label_fr": "Légal",     "label_en": "Legal",    "description": "Laws, regulations, standards, court or authority decisions, official guidance." },
      { "key": "tool",     "label_fr": "Outil",     "label_en": "Tool",     "description": "Software, libraries, extensions, services, new releases." },
      { "key": "resource", "label_fr": "Ressource", "label_en": "Resource", "description": "Guides, tutorials, articles, research, talks." }
    ],
    "output_langs": ["fr", "en"],
    "ai": {
      "triage_model": "claude-haiku-4-5",
      "draft_model": "claude-sonnet-5-5",
      "draft_mode": "on_validate",
      "relevance_threshold": 50,
      "relevance_criteria": "Digital accessibility: WCAG, RGAA, RAWeb, EN 301 549, European Accessibility Act (Directive (EU) 2019/882) and national transpositions, assistive technologies, inclusive design, accessibility tooling and audits.",
      "editorial_rules": "- Distinguish a European directive from its national transposition, and name the country when the text concerns one.\n- For a standard or reference framework (WCAG, RGAA, RAWeb, EN 301 549), quote the exact version given in the source: RGAA 4.1 and RGAA 5 are different texts.",
      "style_rules": "- Summaries: 2 to 3 short sentences, factual tone.\n- French: never use an em dash or a double hyphen; non-breaking space before : ; ! ? and inside « ».\n- Inclusive language: no \"point médian\"; prefer neutral wording (\"l'équipe de développement\"); say \"personnes handicapées\" or \"personnes en situation de handicap\" (EN: \"disabled people\" or \"people with disabilities\").\n- Banned expressions: \"personne avec des besoins spécifiques\" and its variants, \"au jour d'aujourd'hui\".",
      "post_rules": "- At most 2 hashtags on Bluesky and Mastodon, at most 3 on LinkedIn, written in CamelCase for screen readers (#DigitalAccessibility).\n- No emoji used as bullet points or to replace words.\n- LinkedIn: aim for 400 to 900 characters.",
      "prompt_version": "v1"
    },
    "collection": {
      "intervals_hours": { "news": 24, "legal": 48, "tool": 168, "resource": 72 },
      "default_hours": 24,
      "max_age_days": 30
    },
    "schedule": {
      "timezone": "Europe/Luxembourg",
      "posts_per_day": 2,
      "slots": ["09:00", "16:00"],
      "digest": { "weekday": 5, "time": "08:00" }
    },
    "channels": []
  }$json$::jsonb
  from ws
  returning id
)
insert into public.sources (topic_id, type, label, config, default_kind)
select topic.id, s.type::public.source_type, s.label, s.config::jsonb, s.kind
from topic, (values
  ('github', 'GitHub topic: accessibility', '{"query": "topic:accessibility", "min_stars": 20}', 'tool'),
  ('github', 'GitHub topic: a11y',          '{"query": "topic:a11y", "min_stars": 20}', 'tool'),
  ('github', 'GitHub topic: wcag',          '{"query": "topic:wcag", "min_stars": 20}', 'tool'),
  ('exa',    'Exa: accessibility legal news', '{"query": "European Accessibility Act enforcement news", "num_results": 10}', 'legal'),
  ('exa',    'Exa: WCAG updates',             '{"query": "WCAG W3C WAI new publication", "num_results": 10}', 'news')
) as s(type, label, config, kind);

-- RSS sources are intentionally not seeded: add them from the board (Sources page),
-- which fetches and verifies each feed. Candidates: docs/sources/accessibilite.md.

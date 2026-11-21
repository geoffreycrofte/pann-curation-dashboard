-- Triage on Claude Haiku 5.5 (2026-11-21): the same job at a tenth of the price of
-- Haiku 4.5 ($0.10 / $0.50 per million tokens). Topics that stored the old default move
-- to the new one; a model chosen otherwise is left as it is.
update public.topics
set config = jsonb_set(config, '{ai,triage_model}', '"claude-haiku-5-5"')
where config #>> '{ai,triage_model}' in ('claude-haiku-4-5', 'claude-haiku-4-5-20251001');

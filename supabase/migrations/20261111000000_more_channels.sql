-- Pann: X, Facebook and Discord posts, published through Zernio. Posts are drafted for
-- these channels only in topics that have an account for them (see draftChannels).
alter type public.channel add value if not exists 'x';
alter type public.channel add value if not exists 'facebook';
alter type public.channel add value if not exists 'discord';

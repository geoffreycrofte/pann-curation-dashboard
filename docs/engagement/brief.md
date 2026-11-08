# Engagement brief (originally "CheckFox Growth OS")

English translation of the brief Geoffrey wrote on 2026-11-08 for a supervised organic acquisition system for CheckFox. It is kept as the reference for the **engagement** tool of Pann: principles, qualification rules, drafting rules and publishing rules.

## How to read this document in Pann

The brief was written for a standalone tool (Markdown files in a Git repository, driven by Claude Code). That tool was not built: engagement became a tool of each Pann topic (see `docs/DECISIONS.md`, entry "un thème, deux outils"). Some parts therefore map to Pann features or are superseded:

| Brief                                                                      | In Pann                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| One repository per product (CheckFox)                                      | One topic per product (CheckFox, Kitzy, Pann, RampUp...), with curation and engagement tools |
| `brand/positioning.md`, `messaging.md`, `objections.md`, `proof-points.md` | Product profile of the topic (`topics.config.product`, Settings, Product)                    |
| `listening/queries.md`, collection with Harken or OpenMagpie               | Engagement sources of the topic (Hacker News, Bluesky, Mastodon, GitHub...)                  |
| `listening/rules.md`, scoring grid                                         | Engagement triage (to be built), its criteria set per topic                                  |
| `content/drafts/`, `prompts/draft-reply.md`                                | Engagement drafts in the board (to be built)                                                 |
| Markdown tables of opportunities and rejections                            | Items and statuses in the database, shown on the board                                       |
| `prompts/*.md`                                                             | Prompts of the Pann jobs (tool behaviour only) plus topic settings (style, rules)            |
| Postiz for scheduling                                                      | Pann diffusion queue (curation). Engagement replies are never published by an API            |
| `ops/metrics.md`, `ops/learnings.md`                                       | Not built yet                                                                                |

Rules that stay valid as written: sections 1 (non-negotiable principles), 2 (positioning, as CheckFox content for its product profile), the qualification signals and Reddit rules of section 6, the drafting constraints of section 7 and the publishing rules of section 8.

Product-specific content (CheckFox positioning, personas, keywords, queries) is an example for the CheckFox topic, not built-in behaviour: Pann never hard-codes a topic.

---

## Purpose

Build and run a system for **listening, qualification, drafting, human validation, publication and learning** for CheckFox.

CheckFox is a tool for auditors and teams who want to audit the accessibility of websites, mobile apps and PDFs faster.

The system must produce little, but well: useful, accurate, credible content, consistent with a position of expertise in digital accessibility.

---

## 1. Non-negotiable principles

1. **No automatic publication without human validation.**
   The system prepares drafts. Geoffrey validates, corrects and decides to publish.

2. **Never imitate HeyCatch.**
   The goal is not to generate as many posts as possible. The goal is to create opportunities for useful conversations and to strengthen CheckFox's credibility.

3. **A useful answer before any promotion.**
   If a reply would not be useful without the mention of CheckFox, it must not be published.

4. **Zero unverifiable claims.**
   Never invent statistics, WCAG citations, legal rules or test results.

5. **No spam on Reddit, X, Hacker News or GitHub.**
   Replies must bring direct value to the discussion. Mentioning CheckFox is optional and must be natural.

6. **Expertise over volume.**
   Three good pieces of content a week are worth more than thirty generic posts.

7. **Every piece of content has a clear intent.**
   Education, practical help, experience report, comparison, demonstration, monitoring or soft conversion.

8. **Everything is versioned.**
   Rules, drafts, decisions and learnings are kept and tracked.

Added during the review of the brief: **disclose the link with the product.** Whenever a reply mentions the product, it says who is writing (for example "I am the maker of CheckFox"). In Pann this is a rule of the tool, not a setting.

---

## 2. CheckFox positioning

### Value proposition

CheckFox helps auditors, designers, developers and product teams audit the accessibility of websites, mobile apps and PDFs faster, without replacing human judgement.

### Priority audience

- Independent accessibility auditors.
- Web agencies and UX agencies.
- Design system teams.
- Product designers and UX designers.
- Front-end developers.
- Quality, compliance and accessibility managers.
- Product teams that must make their journeys accessible.
- Organisations subject to accessibility requirements, especially in Europe.

### Problems to solve

- Manual audits are long and repetitive.
- Automated tools detect part of the issues, but not issues of use, context or understanding.
- PDFs, mobile apps and websites call for different methods.
- Teams lack concrete benchmarks to prioritise fixes.
- Audit deliverables are often hard for product teams to use.
- Organisations confuse compliance, real accessibility and simply running an automated tool.

### Core messages

- Automation speeds up audits, it does not replace human expertise.
- Real accessibility is judged in use, not only in a tool's report.
- Forms are a major lever for accessibility, conversion and trust.
- Audits must produce understandable, prioritised, actionable work.
- Accessibility is a product skill, not a final checkbox.

### Tone of voice

- Direct, precise, educational.
- Pragmatic, without unnecessary jargon.
- Constructively critical.
- Focused on decisions and action.
- Never alarmist, never selling fear.
- Never condescending towards teams discovering accessibility.

### To avoid

- Promising automatic legal compliance.
- Claiming that a tool can detect every accessibility barrier.
- Hollow marketing tone: "revolutionary", "game-changing", "10x your traffic".
- Publishing generic lists of best practices without context.
- Naming and shaming or spreading FUD about competitors.
- Publishing automatically on Reddit, X or Hacker News.

---

## 3. Original project structure (superseded)

The brief planned a standalone repository:

```text
checkfox-growth-os/
├── README.md
├── CLAUDE.md
├── brand/        positioning, voice-and-tone, messaging, objections, proof-points
├── research/     personas, competitors, keywords, sources, insights
├── listening/    queries, rules, opportunities/, rejected/
├── content/      drafts/, approved/, published/, ideas
├── ops/          weekly-plan, metrics, learnings, publishing-rules
└── prompts/      listen, qualify, draft-reply, draft-post, weekly-plan, learn
```

See the mapping table at the top of this document for where each part lives in Pann.

---

## 4. Foundation content

### Assistant instructions (original `CLAUDE.md`)

> You are CheckFox's growth and content assistant.
>
> Your role is to help Geoffrey identify relevant opportunities, prepare quality content and progressively improve CheckFox's organic acquisition strategy.
>
> You never publish automatically. You prepare drafts, analyses and recommendations. Geoffrey always keeps the final say.

**Product context.** CheckFox is an accessibility audit tool for websites, mobile apps and PDFs. It is mainly for accessibility auditors, agencies, designers, developers, product teams and quality managers. The central promise: speed up accessibility audits without replacing human expertise.

**Absolute rules.**

- Answer in French unless explicitly asked otherwise (conversation with Geoffrey; published content follows the language of its channel or discussion).
- Never use the em dash character (U+2014).
- Never publish automatically.
- Never claim that a tool guarantees legal compliance.
- Do not present CheckFox as a replacement for a human audit.
- Do not publish generic content about "accessibility" without a precise angle.
- Do not cite a WCAG rule, a law or a figure without a verifiable source.
- Do not reply to a discussion if the reply brings no real value.
- Mention CheckFox only when it is natural, relevant and non-intrusive.
- State uncertainties, limits and risks explicitly.

**Method.**

1. Read the positioning, research and qualification rules first.
2. Look at the opportunities of the day.
3. Qualify each opportunity.
4. Only draft for opportunities marked "to reply".
5. One draft per piece of content.
6. Propose a status: "to validate", "to improve", "to reject".
7. Log decisions and learnings.

**Definition of quality.** Good CheckFox content:

- Starts from a concrete problem.
- Gives an actionable answer.
- Is precise about its scope: web, mobile, PDF, audit, design, development or compliance.
- Respects the CheckFox tone.
- Does not oversell the tool.
- Is easy to proofread and publish.
- Can be understood by someone who is not an accessibility expert.

**Expected deliverables.** Qualified opportunities; community replies ready to proofread; LinkedIn, Bluesky, Mastodon or X posts; article and product demo ideas; weekly plans; performance reports; recommendations to improve the positioning.

### Positioning

**Category.** AI-assisted accessibility audit tool for teams that want to go faster without sacrificing human judgement.

**For whom.** Accessibility auditors, agencies, design teams, developers and product teams who must assess the accessibility of websites, mobile apps and PDFs.

**Main problem.** Accessibility audits take time, rigour and contextual expertise. Automated tools speed up some checks, but do not always understand real use, context or impact on people.

**Promise.** CheckFox helps structure, speed up and document accessibility audits, while leaving to the human expert the decisions that require context, judgement and empathy.

**Differentiation.**

- Covers web, mobile and PDF.
- Designed for audit professionals and product teams.
- Speeds up the work without claiming to replace expertise.
- Focuses on actionable deliverables.
- Built on real expertise in accessibility, UX and design systems.

**Proof to collect.** Anonymised case studies; time saved per type of audit; number of issues detected or prioritised; user feedback; before/after demonstrations; methodological comparisons; reference articles and content written by Geoffrey.

**Forbidden.**

- Promising automatic legal compliance.
- Presenting AI as an autonomous auditor.
- Comparing CheckFox to a tool only on the number of features.
- Promising a number of users, leads or conversions.

### Messages

**Founding message.** Tools speed up audits. Humans understand context.

**Secondary messages.**

- CheckFox helps teams audit faster without mistaking speed for superficiality.
- Accessibility is not reduced to an automated score.
- A good audit produces clear decisions, not just a list of defects.
- Forms are a major friction point for users and a major conversion opportunity.
- PDFs, web and mobile call for distinct audit approaches.
- Accessibility is continuous product work, not a final check.

**Wordings to prefer.**

- "Here is a simple method to..."
- "The real problem is often..."
- "Before fixing, check..."
- "A useful audit answers three questions..."
- "What tools detect, and what they don't..."
- "Here is how to prioritise without drowning the team..."

**Wordings to avoid.**

- "AI is revolutionising accessibility."
- "100% automated audit."
- "Guaranteed compliance."
- "The best accessibility tool."
- "Never waste time again."
- "Boost your traffic with AI."

### Voice and tone

**Personality.** Expert, direct, educational, pragmatic, curious and critical.

**Principles.**

- Explain before convincing.
- Give a method before selling a tool.
- Separate facts, hypotheses and opinions.
- Acknowledge the limits of tools and AI.
- Speak to people first, then to teams and organisations.

**Style.** Short to medium sentences. Accessible vocabulary. Concrete examples. No unexplained jargon. No marketing superlatives. No em dash.

**Examples.**

Good:

> An automated audit can spot insufficient contrast, but it cannot decide on its own whether the text remains understandable in its context. A human is still needed to assess real use.

To avoid:

> Our revolutionary AI guarantees perfect accessibility and full compliance.

### Common objections

**"Accessibility is not a priority."**
Accessibility becomes a priority when it blocks users, generates costly fixes or exposes the organisation to risks. The most effective approach is to start with critical journeys: sign-up, login, payment, support and search.

**"We already have an automated tool."**
An automated tool is useful to detect part of the technical issues. It does not replace assessing context, understanding, keyboard navigation, screen reader use or content quality.

**"We don't have time."**
Start with the most critical journeys. A targeted audit of sign-up, login, payment or search often has more impact than a poorly prioritised general audit.

**"It's a legal obligation."**
Compliance matters, but it is not enough. An experience can be technically compliant and still be hard to use. The goal is to reduce real barriers, not only to fill in a report.

**"AI will replace auditors."**
AI can speed up preparation, signal detection and documentation. It does not replace human judgement on context, use and prioritisation.

### Proof points

**To document.** Reduced audit preparation time; number of automatable checks per medium; kinds of issues detected automatically; kinds of issues requiring human expertise; quality and usability of deliverables; feedback from auditors and product teams; use cases (website, mobile app, PDF); before/after comparison on the same scope.

**Rule.** Never publish a proof point without a clear source, method, sample or context.

**Recommended format.**

| Proof                    | Method                              | Result         | Limit          | Source          |
| ------------------------ | ----------------------------------- | -------------- | -------------- | --------------- |
| Reduced preparation time | Before/after comparison on X audits | To be measured | Limited sample | To be completed |

---

## 5. Research and monitoring

### Priority personas

**1. The independent accessibility auditor.**
Context: audits for several clients, must produce clear deliverables quickly.
Pains: preparation and documentation time; repetitive checks; difficulty prioritising issues; clients who do not understand the recommendations.
Message: CheckFox helps structure and speed up audit work, without replacing expertise.
Channels: Reddit, LinkedIn, Bluesky, Mastodon, GitHub, specialised newsletters.

**2. The product designer or UX designer.**
Context: designs journeys and must integrate accessibility early in the process.
Pains: lack of concrete benchmarks; deadlines; difficulty getting accessibility issues accepted; complex forms and journeys that are hard to assess.
Message: accessibility is a product design skill, not an end-of-project fix.
Channels: LinkedIn, Bluesky, Mastodon, Medium, design blogs, UX communities.

**3. The front-end developer.**
Context: must implement accessible interfaces and fix issues found in audits.
Pains: complex components; misused ARIA; keyboard navigation; insufficient tests; lack of time.
Message: an accessible interface starts with semantic HTML, a clear structure and real tests.
Channels: GitHub, Stack Overflow, Reddit, dev.to, X, Bluesky.

**4. The product or quality manager.**
Context: must arbitrate between deadlines, quality, risk and resources.
Pains: lack of visibility on risks; difficulty prioritising; cost of late fixes; regulatory or commercial pressure.
Message: start with critical journeys and measure the real impact on users.
Channels: LinkedIn, newsletters, webinars, product communities.

### Competitive landscape

**Rule.** Never disparage a competitor. Describe differences in scope, method and use.

**To document for each competitor.** Name; positioning; target; scope (web, mobile, PDF); strengths; limits; public price if available; CheckFox differentiation; possible content angle.

**Angles to explore.**

- Automated audit versus expert audit.
- Technical detection versus assessment of use.
- Raw report versus action plan.
- Website versus mobile app versus PDF.
- Compliance versus real accessibility.
- Tool for developers versus tool for auditors.

### Keywords and intents

**Intents to monitor.** How to audit the accessibility of a website; how to test an accessible PDF; how to check keyboard navigation; how to test with a screen reader; how to fix an inaccessible form; how to prioritise WCAG issues; how to convince a team to do accessibility; how to choose an accessibility audit tool; how to audit a mobile app; how to document an accessibility audit.

**English keywords.** accessibility audit; accessibility audit checklist; WCAG audit; WCAG 2.2 AA; accessibility testing; screen reader testing; keyboard navigation testing; accessible PDF; accessible forms; form accessibility; accessibility remediation; accessibility audit tool; automated accessibility testing; accessibility report; inclusive design.

**French keywords.** audit accessibilité; audit accessibilité site web; audit accessibilité PDF; audit accessibilité application mobile; test accessibilité; conformité RGAA; WCAG 2.2 AA; formulaire accessible; navigation clavier; lecteur d'écran; accessibilité numérique.

### Reliable sources

**Preferred references.** W3C WAI; Web Content Accessibility Guidelines (WCAG); WCAG 2.2; ARIA Authoring Practices Guide (APG); MDN Web Docs; GOV.UK Service Manual; WebAIM; Deque University; TPGi; Level Access; national standards bodies or frameworks depending on the market.

**Citation rule.**

- Cite the exact source.
- Check the version of the standard.
- Distinguish requirement, recommendation and good practice.
- Never turn a recommendation into a legal obligation.
- State the scope: web, mobile, PDF, native app, etc.

---

## 6. Listening and opportunities

### Monitoring queries

**Reddit.**

- Audit intent: "accessibility audit checklist", "how to audit website accessibility", "WCAG audit", "accessibility audit tool", "automated accessibility testing", "accessibility report template", "accessibility audit pricing", "accessibility audit freelance".
- Forms: "form accessibility", "accessible form validation", "form error message accessibility", "required field accessibility", "form UX accessibility", "checkout accessibility".
- Tools: "axe DevTools alternative", "Lighthouse accessibility limitations", "automated accessibility testing limitations", "accessibility audit automation", "accessibility testing tool comparison".
- PDF and mobile: "accessible PDF audit", "PDF accessibility checker", "mobile accessibility audit", "iOS accessibility testing", "Android accessibility testing".

**Hacker News.** "accessibility audit", "WCAG", "screen reader", "keyboard navigation", "accessible web", "accessibility testing", "inclusive design", "design system accessibility".

**GitHub.** "accessibility audit", "axe-core", "Pa11y", "Lighthouse accessibility", "accessible components", "accessibility testing".

**Bluesky and Mastodon.** "accessibility audit", "WCAG", "accessible forms", "screen reader", "a11y", "accessibility testing", "inclusive design".

**X.** "accessibility audit", "WCAG", "a11y", "screen reader", "accessible forms", "accessibility testing", "inclusive design".

### Qualification rules

**Opportunity score, from 0 to 100.**

| Criterion                             |  Points |
| ------------------------------------- | ------: |
| Explicit pain or need                 | 0 to 25 |
| Purchase intent or search for a tool  | 0 to 20 |
| Relevance for CheckFox                | 0 to 20 |
| Authority or reach of the discussion  | 0 to 15 |
| Freshness                             | 0 to 10 |
| Possibility of giving a useful answer | 0 to 10 |

Review note: a points grid scored by a model looks more precise than it is. Prefer a few well-described levels, calibrated against Geoffrey's real decisions. Weighting purchase intent at 20 points also conflicts with "help first".

**Decision.**

|     Score | Status      | Action                                      |
| --------: | ----------- | ------------------------------------------- |
| 80 to 100 | Reply first | Quick draft, useful reply, optional mention |
|  60 to 79 | Reply       | Draft to proofread, educational angle       |
|  40 to 59 | Watch       | No immediate reply, follow the discussion   |
|  20 to 39 | Off topic   | Reject                                      |
|   0 to 19 | Noise       | Reject                                      |

**Positive signals.**

- The person describes a concrete problem.
- The person is looking for a method, a tool or help.
- The discussion is about a CheckFox use case.
- The person is an auditor, designer, developer, product manager or quality manager.
- The discussion is recent.
- The reply can help without being promotional.

**Negative signals.**

- Old or inactive discussion.
- Request for a quote, a service or a hire.
- Very hostile thread.
- Question already widely answered.
- Purely legal or regulatory topic without verifiable expertise.
- Disguised request for promotion.
- Risk of spam or of breaking the community's rules.

**Reddit rules.**

- Read the subreddit rules before any reply.
- Never publish automatically.
- Prefer a useful, factual and disinterested reply.
- Mention CheckFox only if the person is explicitly looking for a tool or if it is natural.
- Do not reply to a thread older than 30 days without a strong reason.
- No more than one reply per subreddit per week, except for an exceptional opportunity.

Review note: in Pann, the weekly limit per community applies per account across all topics, not per product.

### Listening step (original prompt)

**Mission.** Identify recent discussions, questions, articles and signals that may concern CheckFox.

**Priority sources.** Reddit; Hacker News; Bluesky; Mastodon; GitHub; specialised RSS feeds; accessibility blogs; X, only if API access is available and complies with the platform's rules.

**Scope.** Accessibility audit; WCAG; RGAA; form accessibility; PDF accessibility; mobile accessibility; keyboard navigation; screen readers; audit tools; accessibility in design systems; accessibility and conversion; inclusive design.

**Instructions.**

1. Collect items from the last 48 hours when possible.
2. Deduplicate similar content.
3. For each item, record: date; source; URL; title or excerpt; author or community; problem expressed; relevance for CheckFox; initial score; proposed status.
4. Store opportunities and rejections.
5. Draft no reply at this step.

**Rules.** Publish nothing. Contact no one. Generate no automatic reply. Do not mark a discussion "to reply" if it is old, off topic or risky. Prefer quality over quantity. At most 20 opportunities a day.

### Qualification step (original prompt)

**Mission.** Analyse the collected opportunities and give a final score (grid and decisions above).

**Instructions.**

1. Read the positioning, the messages and the qualification rules.
2. Analyse each opportunity.
3. Give a final score.
4. Justify the decision in one sentence.
5. Propose a reply angle if the status is "to reply".
6. Update the opportunities.
7. Create at most 3 priority drafts.

**Rules.** Publish nothing. Contact no one. Do not overrate purchase intent. Do not mistake a technical question for purchase intent. Do not reply to hostile discussions. Do not propose a reply if you cannot bring real value.

---

## 7. Drafting

### Community reply (original prompt)

**Mission.** Write a useful, precise and non-promotional community reply for a qualified opportunity.

**Goal.** Help the person solve their problem. Mention CheckFox only if it is natural, relevant and non-intrusive.

**Recommended structure.**

1. Restate the problem or need.
2. Give a direct, actionable answer.
3. Explain the important limit or context.
4. Suggest a concrete next step.
5. Mention CheckFox only if the angle justifies it.

**Constraints.**

- At most 180 words for Reddit.
- At most 280 characters for X.
- At most 500 characters for Bluesky or Mastodon.
- No superlatives.
- No em dash.
- No promise of legal compliance.
- No unexplained jargon.
- No link unless it brings direct value.
- At most one mention of CheckFox.

Review note: Bluesky's limit is 300 characters (graphemes), not 500; Pann already enforces it for posts. A reply is written in the language of the discussion.

**Draft fields.** Date; source; URL; status (to validate); channel; intent (help, education, monitoring or soft conversion); CheckFox mention (yes / no); risk (low / medium / high); proposed reply; why this reply.

**Checks before publication.**

- [ ] The reply brings real value.
- [ ] The claims are verifiable.
- [ ] The tone fits the community.
- [ ] The CheckFox mention is natural.
- [ ] No excessive promise.
- [ ] The format follows the channel's rules.

### Organic post (original prompt)

**Mission.** Propose a short, useful and credible organic post for LinkedIn, Bluesky, Mastodon or X.

**Priority kinds of posts.** Common accessibility mistake; concrete audit method; counter-intuitive idea; lesson learned from an audit; open question to the community; comparison of methods; demonstration of a use case; product experience report.

**Recommended structure.** Clear hook; concrete problem; short explanation; action or recommendation; optional open question.

**Constraints.** LinkedIn: 120 to 200 words. Bluesky: at most 300 characters. Mastodon: at most 500 characters. X: at most 280 characters. No em dash. No unverifiable promise. No advertising tone. One idea per post.

**Draft fields.** Title; channel; intent; final text; shorter alternative; optional call to action; risk; status (to validate).

### Weekly plan (original prompt)

**Mission.** Produce a realistic weekly plan, focused on quality and learning.

**Weekly goals.**

- Identify 10 to 20 relevant opportunities.
- Produce 3 to 5 high-quality pieces of content.
- Reply to 1 to 3 community discussions at most.
- Publish 1 to 2 organic posts.
- Measure the results.
- Update the rules and messages.

Review note: the brief also says "3 drafts at most per day", which conflicts with these weekly goals. Keep one weekly goal.

**Plan content.** Main goal; priority opportunities (source, URL, problem, score, action); content to produce (kind, channel, angle, intent, status); publishing actions (day, channel, content, owner, status); metrics to follow (opportunities identified and qualified, replies and posts published, visits, sign-ups, conversations started, key learnings); risks (spam, generic content, unverified claims, time lost on irrelevant channels).

### Weekly learning (original prompt)

**Mission.** Analyse the week's results and propose concrete improvements.

**Questions.**

1. Which sources produced the best opportunities?
2. Which angles generated the most engagement or visits?
3. Which content generated visits or sign-ups?
4. Which content was rejected or performed poorly?
5. Which messages deserve repeating?
6. Which messages should be dropped?
7. Which rules should be adjusted?

**Output per week.** What worked (observation, hypothesis, recommended action); what did not work (same); decisions (decision, success criterion, re-evaluation date).

**Rules.** Never conclude from a single result. Distinguish correlation and causation. Prefer actionable learnings. Do not increase volume if quality drops.

---

## 8. Publishing and measurement

### Publishing rules

**General rule.** Geoffrey validates every piece of content before publication.

**Reddit.** Draft only. No automatic publication. Useful reply first. CheckFox mention only if natural. At most 1 reply per subreddit per week. Never reply to an old thread without added value.

**X.** Draft required. Prefer useful threads, methods and experience reports. Avoid automatic replies to unknown accounts. Do not automate interactions.

**LinkedIn.** 2 to 3 posts a week at most. Prefer expertise, methods and use cases. Avoid purely promotional posts.

**Bluesky and Mastodon.** Prefer the accessibility community. Reply to relevant discussions. Share useful resources. Avoid mechanical cross-posting.

**GitHub.** Only comment on issues or discussions where CheckFox brings real value. Respect the repository's rules. Never spam issues. Prefer useful technical contributions.

**Measurement.** For each publication, record: date; channel; URL; kind of content; intent; views or impressions; interactions; clicks; site visits; sign-ups; conversations started; qualitative result.

### Metrics

**Activity.** Opportunities detected; opportunities qualified; replies drafted; replies published; posts published; time spent per step.

**Quality.** Rate of drafts accepted without major change; rate of drafts rejected; number of corrections needed; number of replies judged useful; number of reports or removals; quality perceived by Geoffrey.

**Performance.** Impressions; interactions; clicks; site visits; product page visits; sign-ups; trials started; inbound conversations; qualified leads.

**Business.** Sign-ups; active trials; activated accounts; paid conversions; acquisition cost, if paid campaigns; retention at 7 and 30 days.

**Interpretation rule.** A metric alone proves nothing. Always link: source of the visit; publishing channel; kind of content; intent of the content; action taken on the site; business result, if any.

Review note: start with about four metrics, with UTM links per topic and channel.

### Initial learnings (week of 2026-11-08)

Decisions:

- Start with Reddit, Hacker News, Bluesky, Mastodon and GitHub.
- Validate every piece of content before publication.
- Measure visits, sign-ups and conversations, not only impressions.

---

## 9. Original 14-day plan

- **Days 1 to 2, framing.** Complete positioning, messages and personas. Define the first 20 monitoring queries. Choose Harken or OpenMagpie.
- **Days 3 to 4, listening.** Set up monitoring. Collect the first opportunities. Qualify 20 to 40 items. Identify the 5 best angles. Create the first drafts.
- **Days 5 to 7, first content.** Produce 3 community replies and 2 organic posts. Validate and publish manually. Note reactions and learnings. Adjust the qualification rules.
- **Days 8 to 10, light industrialisation.** Add Postiz for scheduled drafts. Create a daily workflow. Add a weekly report. Link publications to visits and sign-ups. Remove unhelpful sources.
- **Days 11 to 14, optimisation.** Analyse results. Identify the 3 best angles. Double down on sources that convert. Reduce or stop sources that only produce noise. Prepare a pillar article or a product demo.

In Pann, monitoring is the engagement sources of the topic, and scheduling is the diffusion queue: Harken, OpenMagpie and Postiz are not needed.

---

## 10. First batch of content (CheckFox)

1. **"Why an automated accessibility audit is not enough."** What tools detect, what they don't, and how to combine automation and human expertise. Intent: education and authority.
2. **"7 mistakes that make a form inaccessible, even when it passes automated tests."** Built on Geoffrey's expertise on forms and accessibility. Intent: education, authority and soft conversion.
3. **"How to audit an accessible PDF without losing a day."** Practical method, common mistakes, limits of automated tools. Intent: education and product demonstration.
4. **"Mobile accessibility: the checks automated audits forget."** Navigation, gestures, focus, screen readers, contexts of use. Intent: education and differentiation.
5. **"How to prioritise accessibility issues without drowning your team."** User impact, critical journeys, fixing effort, risk. Intent: decision support and B2B conversion.

---

## 11. Final reminder

The best system is not the one that publishes the most.

It is the one that:

- Finds the right conversations.
- Brings real help.
- Respects communities.
- Protects the product's credibility.
- Measures what works.
- Learns fast.
- Keeps Geoffrey at the centre of important decisions.

The AI is an execution and analysis assistant. Geoffrey remains the strategist, the editor and the guarantor of quality.

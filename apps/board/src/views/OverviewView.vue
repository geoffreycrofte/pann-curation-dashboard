<script setup lang="ts">
/**
 * Overview of a topic, where it opens: what needs doing, figures, the next publications.
 * The setup checklist of a new topic comes first (OverviewChecklist).
 */
import { useQueryCache } from '@pinia/colada'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import OverviewChecklist from '../components/OverviewChecklist.vue'
import TopicStatus from '../components/overview/TopicStatus.vue'
import ContentCard from '../components/ContentCard.vue'
import Icon from '../components/Icon.vue'
import StreakFlame from '../components/StreakFlame.vue'
import TopicSummary from '../components/TopicSummary.vue'
import { api, type QueueItem } from '../lib/api'
import { contentLangName } from '../lib/langs'
import { useTopicName } from '../lib/topic-name'
import { useTopicSummary } from '../lib/topic-summary'

const props = defineProps<{ topicId: string }>()
const { t, d, locale } = useI18n()

/** Scheduled posts of an item, one line per network with the languages it goes out in. */
function networksOf(item: QueueItem) {
  const byChannel = new Map<string, string[]>()
  for (const post of item.posts) {
    if (post.status !== 'scheduled') continue
    const langs = byChannel.get(post.channel) ?? []
    if (post.lang && !langs.includes(post.lang)) langs.push(post.lang)
    byChannel.set(post.channel, langs)
  }
  return [...byChannel].map(([channel, langs]) => ({ channel, langs }))
}
const langList = (langs: string[]) =>
  new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(langs.map(contentLangName))
const topicName = useTopicName(() => props.topicId)
const { topic, upcoming, isPending } = useTopicSummary(() => props.topicId)

const next = computed(() => upcoming.value.slice(0, 5))

// Just created: collect its sources now rather than at the next hourly run, so that the
// first items arrive within minutes.
const route = useRoute()
const router = useRouter()
const queryCache = useQueryCache()
const startMessage = ref('')
onMounted(async () => {
  if (route.query.new !== '1') return
  void router.replace({ query: {} })
  startMessage.value = t('overview.created')
  const lists = await Promise.all([
    api.sources(props.topicId, 'curation').catch(() => []),
    api.sources(props.topicId, 'engagement').catch(() => []),
  ])
  const all = lists.flat()
  if (!all.length) return
  startMessage.value = t('overview.collecting')
  await Promise.all(all.map((s) => api.collectNow(props.topicId, s.id).catch(() => undefined)))
  await queryCache.invalidateQueries({ key: ['items', props.topicId] })
  await queryCache.invalidateQueries({ key: ['conversations', props.topicId] })
})
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
</script>

<template>
  <div class="overview-head">
    <h1 tabindex="-1">{{ topicName }}</h1>
    <StreakFlame :topic-id="topicId" />
  </div>
  <p role="status" class="start" :class="{ empty: !startMessage }">{{ startMessage }}</p>
  <TopicStatus :topic-id="topicId" />
  <OverviewChecklist :topic-id="topicId" />
  <!-- The next post is listed just below: no "Next:" line in the figures. -->
  <TopicSummary :topic-id="topicId" :show-next="false" />

  <section class="next" aria-labelledby="overview-next">
    <div class="next-head">
      <h2 id="overview-next">{{ t('overview.next') }}</h2>
      <RouterLink class="button" data-size="small" :to="{ name: 'calendar', params: { topicId } }">
        <Icon name="calendar" />
        {{ t('overview.openCalendar') }}
      </RouterLink>
    </div>
    <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!next.length">
      {{ t('overview.nothingScheduled') }}
      <RouterLink
        v-if="topic?.config.modules.curation"
        :to="{ name: 'board', params: { topicId }, query: { status: 'validated' } }"
        >{{ t('overview.chooseValidated') }}</RouterLink
      >
    </p>
    <ol v-else class="queue">
      <li v-for="item in next" :key="item.item_id">
        <ContentCard
          kind="publication"
          :title="item.item.title"
          :title-lang="item.item.source_lang ?? undefined"
          :to="{ name: 'item', params: { topicId, itemId: item.item_id } }"
        >
          <template #meta>
            <span class="when"
              ><Icon name="clock" :size="16" /> {{ formatDate(item.publish_at) }}</span
            >
          </template>
          <ul class="channels">
            <li v-for="n in networksOf(item)" :key="n.channel">
              <Icon :name="n.channel" :size="16" />
              {{ t(`draft.channels.${n.channel}`) }}
              <!-- The codes are for the eye; screen readers get the languages' names. -->
              <template v-if="n.langs.length">
                <span class="visually-hidden">{{
                  t('overview.inLangs', { langs: langList(n.langs) })
                }}</span>
                <span class="langs" aria-hidden="true">
                  <span v-for="lang in n.langs" :key="lang" class="badge">{{
                    lang.toUpperCase()
                  }}</span>
                </span>
              </template>
            </li>
          </ul>
        </ContentCard>
      </li>
    </ol>
  </section>
</template>

<style scoped>
/* The topic's name, its streak beside it (under it on a narrow screen). */
.overview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3) var(--space-5);
  margin-bottom: var(--space-5);
}

.overview-head h1 {
  margin: 0;
}

.start {
  margin: 0 0 var(--space-4);
}

.start.empty {
  position: absolute;
}

.next {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-8);
}

.next-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
}

.next h2,
.next p {
  margin: 0;
}

/* Publications side by side: a card each. */
.queue {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(19rem, 100%), 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.queue > li {
  display: grid;
}

.when {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.channels {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}

.channels li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.langs {
  display: inline-flex;
  gap: var(--space-1);
}
</style>

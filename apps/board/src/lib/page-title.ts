import { onBeforeUnmount, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

/**
 * Most specific part of the document title, set by the page shown when it has one (an
 * item's title, a settings tab…). App builds the title: detail, page, topic, Pann.
 */
export const pageDetail = ref('')

export function usePageDetail(source: MaybeRefOrGetter<string | undefined>) {
  watchEffect(() => (pageDetail.value = toValue(source) ?? ''))
  onBeforeUnmount(() => (pageDetail.value = ''))
}

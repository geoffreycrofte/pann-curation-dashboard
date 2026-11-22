import { checkPost, type TopicConfig } from '@glimr/shared'

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * The accessibility warnings of a post as sentences, or nothing when the topic turned
 * the check off. Given to TextSaver, which shows them while the post is edited.
 */
export function postWarnings(
  config: TopicConfig | undefined,
  t: Translate,
): ((text: string) => string[]) | undefined {
  if (!config?.accessibility_check) return undefined
  return (text) =>
    checkPost(text).map((issue) => t(`postChecks.${issue.code}`, { detail: issue.detail ?? '' }))
}

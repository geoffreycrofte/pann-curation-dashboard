/** Illustrations of the marketing page, in two widths (WebP, 3D scenes on a sand background). */
import budget1000 from '../assets/landing/budget-scale-1000.webp'
import budget560 from '../assets/landing/budget-scale-560.webp'
import collect1000 from '../assets/landing/collect-sluice-1000.webp'
import collect560 from '../assets/landing/collect-sluice-560.webp'
import draft1000 from '../assets/landing/draft-cushion-1000.webp'
import draft560 from '../assets/landing/draft-cushion-560.webp'
import empty1000 from '../assets/landing/empty-pan-1000.webp'
import empty560 from '../assets/landing/empty-pan-560.webp'
import keep1000 from '../assets/landing/keep-jar-1000.webp'
import keep560 from '../assets/landing/keep-jar-560.webp'
import newsletter1000 from '../assets/landing/newsletter-crate-1000.webp'
import newsletter560 from '../assets/landing/newsletter-crate-560.webp'
import hero1000 from '../assets/landing/prospector-pan-1000.webp'
import hero560 from '../assets/landing/prospector-pan-560.webp'
import share1000 from '../assets/landing/share-planes-1000.webp'
import share560 from '../assets/landing/share-planes-560.webp'
import triage1000 from '../assets/landing/triage-robot-1000.webp'
import triage560 from '../assets/landing/triage-robot-560.webp'

export interface Illustration {
  src: string
  srcset: string
  width: number
  height: number
}

const square = (small: string, large: string): Illustration => ({
  src: large,
  srcset: `${small} 560w, ${large} 1000w`,
  width: 1000,
  height: 1000,
})

export const ILLUSTRATIONS = {
  hero: { src: hero1000, srcset: `${hero560} 560w, ${hero1000} 1000w`, width: 1000, height: 1500 },
  empty: square(empty560, empty1000),
  collect: square(collect560, collect1000),
  triage: square(triage560, triage1000),
  keep: square(keep560, keep1000),
  draft: square(draft560, draft1000),
  share: square(share560, share1000),
  newsletter: square(newsletter560, newsletter1000),
  budget: square(budget560, budget1000),
} satisfies Record<string, Illustration>

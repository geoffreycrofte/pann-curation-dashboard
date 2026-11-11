/**
 * Illustrations of the marketing page, in two widths (WebP). Each one exists as the
 * scene on its sand background and as a cut-out (transparent background) for the dark
 * theme and for the ink, gold and olive sections.
 */
import budget_scale_1000 from '../assets/landing/budget-scale-1000.webp'
import budget_scale_560 from '../assets/landing/budget-scale-560.webp'
import budget_scale_cut1000 from '../assets/landing/budget-scale-cut-1000.webp'
import budget_scale_cut560 from '../assets/landing/budget-scale-cut-560.webp'
import collect_sluice_1000 from '../assets/landing/collect-sluice-1000.webp'
import collect_sluice_560 from '../assets/landing/collect-sluice-560.webp'
import collect_sluice_cut1000 from '../assets/landing/collect-sluice-cut-1000.webp'
import collect_sluice_cut560 from '../assets/landing/collect-sluice-cut-560.webp'
import draft_cushion_1000 from '../assets/landing/draft-cushion-1000.webp'
import draft_cushion_560 from '../assets/landing/draft-cushion-560.webp'
import draft_cushion_cut1000 from '../assets/landing/draft-cushion-cut-1000.webp'
import draft_cushion_cut560 from '../assets/landing/draft-cushion-cut-560.webp'
import empty_pan_1000 from '../assets/landing/empty-pan-1000.webp'
import empty_pan_560 from '../assets/landing/empty-pan-560.webp'
import empty_pan_cut1000 from '../assets/landing/empty-pan-cut-1000.webp'
import empty_pan_cut560 from '../assets/landing/empty-pan-cut-560.webp'
import keep_jar_1000 from '../assets/landing/keep-jar-1000.webp'
import keep_jar_560 from '../assets/landing/keep-jar-560.webp'
import keep_jar_cut1000 from '../assets/landing/keep-jar-cut-1000.webp'
import keep_jar_cut560 from '../assets/landing/keep-jar-cut-560.webp'
import newsletter_crate_1000 from '../assets/landing/newsletter-crate-1000.webp'
import newsletter_crate_560 from '../assets/landing/newsletter-crate-560.webp'
import newsletter_crate_cut1000 from '../assets/landing/newsletter-crate-cut-1000.webp'
import newsletter_crate_cut560 from '../assets/landing/newsletter-crate-cut-560.webp'
import prospector_pan_1000 from '../assets/landing/prospector-pan-1000.webp'
import prospector_pan_560 from '../assets/landing/prospector-pan-560.webp'
import prospector_pan_cut1000 from '../assets/landing/prospector-pan-cut-1000.webp'
import prospector_pan_cut560 from '../assets/landing/prospector-pan-cut-560.webp'
import share_planes_1000 from '../assets/landing/share-planes-1000.webp'
import share_planes_560 from '../assets/landing/share-planes-560.webp'
import share_planes_cut1000 from '../assets/landing/share-planes-cut-1000.webp'
import share_planes_cut560 from '../assets/landing/share-planes-cut-560.webp'
import triage_robot_1000 from '../assets/landing/triage-robot-1000.webp'
import triage_robot_560 from '../assets/landing/triage-robot-560.webp'
import triage_robot_cut1000 from '../assets/landing/triage-robot-cut-1000.webp'
import triage_robot_cut560 from '../assets/landing/triage-robot-cut-560.webp'

export interface Illustration {
  src: string
  srcset: string
  width: number
  height: number
}

export interface Scene {
  scene: Illustration
  cut: Illustration
}

const pair = (small: string, large: string, height: number): Illustration => ({
  src: large,
  srcset: `${small} 560w, ${large} 1000w`,
  width: 1000,
  height,
})

export const ILLUSTRATIONS = {
  hero: {
    scene: pair(prospector_pan_560, prospector_pan_1000, 1500),
    cut: pair(prospector_pan_cut560, prospector_pan_cut1000, 1558),
  },
  empty: {
    scene: pair(empty_pan_560, empty_pan_1000, 1000),
    cut: pair(empty_pan_cut560, empty_pan_cut1000, 1569),
  },
  collect: {
    scene: pair(collect_sluice_560, collect_sluice_1000, 1000),
    cut: pair(collect_sluice_cut560, collect_sluice_cut1000, 976),
  },
  triage: {
    scene: pair(triage_robot_560, triage_robot_1000, 1000),
    cut: pair(triage_robot_cut560, triage_robot_cut1000, 989),
  },
  keep: {
    scene: pair(keep_jar_560, keep_jar_1000, 1000),
    cut: pair(keep_jar_cut560, keep_jar_cut1000, 1425),
  },
  draft: {
    scene: pair(draft_cushion_560, draft_cushion_1000, 1000),
    cut: pair(draft_cushion_cut560, draft_cushion_cut1000, 877),
  },
  share: {
    scene: pair(share_planes_560, share_planes_1000, 1000),
    cut: pair(share_planes_cut560, share_planes_cut1000, 1074),
  },
  newsletter: {
    scene: pair(newsletter_crate_560, newsletter_crate_1000, 1000),
    cut: pair(newsletter_crate_cut560, newsletter_crate_cut1000, 1220),
  },
  budget: {
    scene: pair(budget_scale_560, budget_scale_1000, 1000),
    cut: pair(budget_scale_cut560, budget_scale_cut1000, 565),
  },
} satisfies Record<string, Scene>

# Accessibility

Glimr should work for everyone, whether you use a mouse, a keyboard, a screen reader or a magnifier. Here is what works today, how it is checked, what hasn't been checked yet, and how to tell us when something gets in your way.

The target is level AA of the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), and of RAWeb, the Luxembourg assessment framework built on them. Glimr hasn't had a complete audit yet, so no compliance level is claimed for now. The statement for Glimr Cloud is at [glimr.cc/accessibility](https://glimr.cc/accessibility).

## What works today

**No mouse needed.**

- Every feature works with the keyboard: Tab and Shift+Tab move through the page in the order you see it, and the focus is always visible.
- A "Skip to content" link opens every page.
- When a page changes, its heading takes the focus, so a screen reader announces where you are.
- Menus, dialogs and tabs follow the usual keyboard patterns (arrow keys, Escape to close), and the focus goes back where it was when they close.

**Every control has a name.** Buttons that only show an icon have a name that screen readers read out. Icons and illustrations are decorative and skipped; a network's logo always comes with its name.

**Status in words, not only in colour.** An item's state ("Validated", "Scheduled", "Failed"), a key's status in Connections, a post's length against its limit: each is written out, not only shown with a colour or an icon.

**Changes are announced.** Saving, scheduling, a draft being ready: these messages are read out by screen readers, without moving the focus.

**Colours you can read.** The contrast of every colour of the interface is checked against the AA thresholds, in light and dark mode, each time the code changes. High contrast modes (forced colours) are followed.

**Your settings are respected.**

- Light or dark mode follows your system, or your own choice.
- Reduced motion turns animations off.
- Text can be zoomed to 200 % and pages reflow on phone-sized screens.

**Plain language.** Technical settings come with a sentence that says what they do, right where you set them. The interface is available in English and French.

## How we check

- **Automated**: the contrast of every colour token, in both themes, on every change (`pnpm test`).
- **By hand**: the keyboard paths, the focus order and what screen readers announce, when a screen is added or changes.

Automated checks only find part of the problems. Nothing replaces testing with assistive technologies.

## What we haven't checked yet

We'd rather be upfront about these:

- **A complete audit**: no full WCAG or RAWeb review has been done yet.
- **Screen readers from start to finish**: screens are checked as they are built, but not every journey has been listened to end to end, with NVDA, JAWS, VoiceOver and TalkBack.
- **Voice control and switch access**: not tried yet.
- **Generated content**: summaries and posts are written by AI from the sources; their own accessibility (alternative text of your images, hashtags written in CamelCase) partly depends on your settings and your review.

## Something doesn't work for you?

Please tell us. [Open an issue on GitHub](https://github.com/geoffreycrofte/pann-curation-dashboard/issues), and describe what you were trying to do and what got in the way. Mention the assistive technology you use, if any (screen reader, magnifier, voice control…). On Glimr Cloud, you can also write to the address given on [glimr.cc/accessibility](https://glimr.cc/accessibility). Accessibility problems are treated as bugs, not wishes.

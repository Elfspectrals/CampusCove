---
paths:
  - "front/src/views/**"
  - "front/src/layouts/**"
  - "front/src/components/**"
  - "front/src/i18n/**"
  - "front/src/style.css"
---

# Site UI rules (Vue 3 + Tailwind)

- Every user-facing string goes through i18n (`src/i18n/messages.ts`) in English and French.
- Design for phone first, then tablet and desktop; no horizontal scroll at 360 px. Touch targets at least 44 px.
- Keep one visual language across pages: reuse existing components and Tailwind tokens before adding styles.
- Components render; data fetching and logic live in composables or `src/api/`.
- Use the `ui-ux-pro-max` or `frontend-design` skill for a new page or a redesign, and keep the mockup in `docs/mockups/`.

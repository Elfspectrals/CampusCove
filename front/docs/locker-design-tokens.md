# Locker Design Tokens

## Color Palette

- `background.start`: `#0A192F`
- `background.end`: `#1A365D`
- `panel.base`: `#1E293B` at 80% opacity
- `panel.border`: `#3B82F6`
- `input.base`: `#334155`
- `button.base`: `#475569`
- `category.active`: `#FFD700`
- `text.primary`: `#FFFFFF`
- `text.secondary`: `#CBD5E1`
- `text.muted`: `#94A3B8`
- `stat.fps`: `#22C55E`
- `stat.ping`: `#F97316`

## Typography

- **Title**
  - Family: Inter/system sans
  - Size: `32px`
  - Weight: `700`
  - Color: `#FFFFFF`
  - Effect: black drop shadow
- **Body**
  - Family: Inter/system sans
  - Size: `14px`
  - Weight: `600`
  - Colors: primary white / slate gray variants
- **Perf Stats**
  - Family: monospace
  - Size: `12px`
  - Weight: `500`
  - Colors: green for FPS, orange for ping

## Spacing & Radius Guide

- Base spacing scale uses Tailwind units (`4px` step).
- Panel internal spacing:
  - Mobile: `16px`
  - Desktop: `20px`
- Grid gap: `12px`
- Card minimum height: `152px`
- Corner radius:
  - Main panel: `12px`
  - Inputs/buttons/cards: `6px` to `8px`

## Effects & Motion

- Interactive transitions: `200ms`
- Card hover: scale to `1.05` with subtle neon blue shadow
- Selected card/button glow: blue outer shadow (`rgba(59,130,246,0.45+)`)
- Default elevation: soft dark drop shadow under panel/cards

## Responsive Rules

- Desktop: split `60/40` with 5-column parent grid (`3/2` spans).
- Mobile/tablet: stacked layout (`left panel` then `right panel`).
- Item grid:
  - Mobile: `2 columns`
  - Desktop: `4 columns`, `5 columns` at wide breakpoint

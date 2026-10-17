---
name: mastermind
description: One entry point for all UI and frontend design work. Combines frontend-design (distinctive direction), impeccable (craft, critique, audit, polish commands), ui-ux-pro-max (searchable design data and design-system generator), apple-design (motion, gestures, sheets), design-system (tokens), ui-styling (shadcn/Tailwind), elegant-design (complex interactive UI), app-ui-design (mobile app patterns, iOS HIG and Material 3), the taste-skill pack (design-taste-frontend, high-end-visual-design, redesign-existing-projects, minimalist-ui and the image-direction skills), bauhaus-design (grid, hierarchy and modernist clarity), the superpowers process skills (brainstorming, writing-plans, systematic-debugging, test-driven-development, verification-before-completion, requesting-code-review), anti-slop (generic-pattern detection) and, in this repo, jurrgun-ui (screenshot, decision-card and ship loop). Use for any request to design, build, redesign, review, critique, polish or fix an interface, page, component, flow, motion or design system.
---

# Mastermind

One router and one rulebook over the UI skills installed in this repo. Read this file first, decide the phase and the skills it needs, then load only those. Each source skill stays installed and is the authority on its own detail; Mastermind decides which one leads and settles their conflicts.

## 0. First, in every task

1. **Read project truth before taste.** Look for PRODUCT.md, DESIGN.md, CLAUDE.md, SVAGENTS.md, memory notes and the existing tokens and components. Owner decisions and the brief beat every skill's defaults, including this one.
2. **Name the mode** (from impeccable): Persuade (landing, marketing), Operate (app UI, dashboards, settings), Read (docs, articles) or Experience (showcase). The mode sets how much expression is allowed.
3. **Name the phase** and route with the table below.
4. **In the Jurrgun repo, the jurrgun-ui loop is the delivery wrapper** around every phase (section 4).

## 1. Router

| Phase | The ask sounds like | Lead skill | Support |
|---|---|---|---|
| Direction | "design a new page", "make it distinctive", "it looks generic" | `frontend-design` (plan, review the plan, build, critique) | `ui-ux-pro-max --design-system` for palette, type and pattern data; `impeccable` new-work for context |
| Discovery and shape | "plan this feature", "what should this screen do" | `impeccable shape` | `ui-ux-pro-max` UX rules |
| Tokens and system | "design tokens", "design system", "theme" | `design-system` | `impeccable extract`, `ui-ux-pro-max --persist` |
| Build | "implement this", "make the component" | the project's own kit first; else `ui-styling` (shadcn and Tailwind projects only) or `elegant-design` (chat, terminal, streaming, code display) | `impeccable` craft floor |
| Motion and gesture | "animate", "spring", "drag", "sheet", "swipe" | `apple-design` | `impeccable animate` |
| Critique | "review", "critique", "is this good" | `impeccable critique` | `anti-slop` design checks; `ui-ux-pro-max` priority checklist |
| Audit | "accessibility", "performance", "responsive" | `impeccable audit` | `ui-ux-pro-max` sections 1 to 3 |
| Refine | "polish", "quieter", "bolder", "less text", "less boxy", "clarify copy" | the matching `impeccable` command | `frontend-design` writing rules |
| Mobile app screens | "mobile view", "tab bar", "bottom sheet", "thumb reach", "iOS feel" | `app-ui-design` | `apple-design`; `impeccable adapt` |
| Upgrade an existing site | "make it look premium", "redesign without breaking it" | `redesign-existing-projects` | `high-end-visual-design`, `minimalist-ui`; `impeccable` refine commands |
| Marketing and landing pages | "landing page", "hero", "one-pager", "portfolio" | `design-taste-frontend` (taste-skill v2) | `frontend-design`; `imagegen-frontend-web` for reference images |
| Grid and hierarchy | "align it", "make it structured", "grid", "Swiss", "Bauhaus" | `bauhaus-design` (as a lens: grid, scale contrast, asymmetric balance, functional type) | `impeccable layout`, `typeset` |
| Generic-ness check | "looks AI-generated", "templated", "slop" | `anti-slop` | `frontend-design` calibration list |
| Ship in Jurrgun | any UI change here | `jurrgun-ui` | everything above |

Skill files live in `.claude/skills/<name>/SKILL.md`; impeccable's commands are in `.claude/skills/impeccable/reference/<command>.md`. ui-ux-pro-max is driven by its script: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<product> <industry> <keywords>" --design-system -p "<Project>"`.


## 1b. Process (superpowers)

Superpowers sets how the work is run, around any design phase above:
- **New feature or redesign:** `brainstorming` first (one question at a time, 2 or 3 approaches, then a design), then `writing-plans` for a step list before code.
- **Something broken** (overlap, clipping, wrong spacing, a failing test): `systematic-debugging`. Find the root cause (which rule, which component) before changing CSS.
- **Behaviour changes:** `test-driven-development` (write the failing test, then the fix).
- **Parallel work:** `dispatching-parallel-agents` only for tasks that don't share files.
- **Before saying done:** `verification-before-completion`. Show screenshots and test output, not claims. Use `requesting-code-review` for large changes.

## 2. The merged rulebook

These are the rules all the source skills agree on, stated once. Follow them unless the brief or the project says otherwise.

**Direction (frontend-design, impeccable)**
- Ground the design in the subject: its world, materials and vernacular are where distinctive choices come from.
- Plan before code: 4 to 6 named colours, the typefaces and their roles, a layout concept with an ASCII wireframe, and 2 or 3 principles. Then review the plan against the brief and revise anything you would have produced for any similar page.
- Spend boldness in one place; keep everything around it quiet. Before finishing, remove one accessory.
- Refinement preserves the incumbent look; redesign replaces it. Never split the difference.

**Defaults to avoid unless the brief asks for them (frontend-design, anti-slop)**
- Cream background with serif display and a terracotta accent; near-black with one acid accent; broadsheet hairlines with zero radius.
- The SaaS card kit: everything in identical rounded cards with the same soft shadow and gradient washes.
- Template chrome: ALL-CAPS eyebrow labels above every heading, one accented word in a headline, numbered markers on content that isn't a sequence, '→' on every link, monospace for small labels.
- Fade-and-slide on every section and hover effects on every card.

**Typography and layout (frontend-design, ui-ux-pro-max, impeccable)**
- One or two families with clearly distinct roles, a real type scale, line length under about 80 characters, and sentence case.
- Structure is information: borders, dividers, labels and numbers must encode something.
- A spacing scale (for example 4, 8, 12, 16, 24, 32, 48) and consistent rhythm; no sideways scroll at 320px.

**Motion (apple-design, impeccable)**
- Motion answers a person's action or marks one deliberate moment. Use springs (critically damped by default; some bounce only for a thrown gesture), feedback on pointer-down, interruptible animations that re-target from the live value, and transform and opacity only.
- Respect reduced motion, which means no movement but state changes still visible. Loops run at most 3 times.

**Accessibility and quality floor (impeccable craft floor, ui-ux-pro-max, elegant-design)**
- WCAG 2.2 AA: text contrast 4.5:1 (3:1 large text and control edges), 44px touch targets, visible focus, labels on every control, never colour alone for state, alt text on meaningful images, keyboard paths with no traps.
- Every state is designed: empty, loading, error, overflow, long text, other languages.

**Writing in the interface (frontend-design, impeccable clarify)**
- Name things the way users think of them. Buttons say what happens ("Save changes"), and the same verb carries through the flow. Errors say what happened and how to fix it, without apology. An empty screen invites an action.
- One short line beats a paragraph; move detail behind a disclosure.

## 3. When the skills disagree

| Conflict | Ruling |
|---|---|
| frontend-design pushes aesthetic risk; impeccable Operate mode wants restraint | App UI follows Operate restraint; save risk for Persuade and Experience surfaces and for one signature moment. |
| ui-ux-pro-max suggests a palette or font; the project already has tokens | The project's tokens win; use ui-ux-pro-max only to check contrast or fill a genuine gap. |
| The taste-skill pack prescribes its own fonts, shadows, GSAP scroll effects or perpetual micro-motion | Those are art direction for marketing sites. App screens keep the project's fonts and tokens, calm motion and no scroll-jacking; borrow only the anti-generic checks. |
| app-ui-design follows iOS or Material defaults; the project is a web app | Use its thumb-reach, target-size, hierarchy and accessibility guidance; keep the project's own visual language. |
| bauhaus-design prescribes primary red, yellow and blue, Futura or Helvetica, and hard edges | Take its grid, scale contrast and functional hierarchy only. The project's fonts, palette and radius stay. |
| ui-styling assumes shadcn and Tailwind | Use it only when the project already uses them; otherwise translate its patterns into the project's own components. |
| apple-design wants a spring with bounce; the project wants calm motion | Calm motion wins unless the user throws or drags something. |
| A skill asks for a separate design review step | In a repo with an owner decision process (Jurrgun's decision cards), use that process instead. |

## 4. In the Jurrgun repo

Load `.claude/skills/jurrgun-ui/SKILL.md` and follow its loop: shoot (375 and 1280, light and dark, Thai and English), check, fix plain bugs at once, put every design change on decision cards with the recommended option first, build only what is approved, verify, then ship (full suite on GitHub CI through a `ci/*` branch, rebase, push to main). House rules that override every skill above:
- Thai first, written naturally; no em or en dashes anywhere.
- The fonts (Sao Chingcha, Anuphan) and the palette (green, cream, mango) are fixed. 💘 visuals use love red only, never coral or orange.
- No visible scores or percentages about people.
- The owner's current direction: less text, open sections rather than boxy cards, flat surfaces with hairlines, calm motion with no overshoot.
- Never touch the production database except for the additive migrations the owner has allowed, and never print the seed password.

## 5. Finish

Before calling UI work done:
1. Take screenshots and look at them.
2. Run one batched check against the merged rulebook and fix everything it finds.
3. Confirm with at most one more round.
4. Report what changed, what was decided, and what is left.

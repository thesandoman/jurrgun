# BKK Social - City Values Quiz ("Bangkok Type") — v2

> ⚠️ **SUPERSEDED (2026-10-09)** by `vibe-quiz-v3.md`. This civic quiz is retired: its questions could reveal political opinion, so it can't be used for matching. Kept for traceability only.

## Scenario-based city-value questions for BMA mobile web

> **v2 changes (2026-10-09).**
> - The quiz is reframed as an **opt-in self-expression feature**. It is never used for matching, grouping or recommendations (PRD v2 §6.4).
> - The compatibility score, match map and "Natural / Complementary / Interesting Match" labels are **removed**.
> - The covert "subtle wording" framing is replaced with transparent consent copy.
> - A full scoring spec is added: every scored item maps to exactly one of the 4 axes, rotation guarantees a minimum number of items per axis, and results near the middle show as "balanced".
> - Q27 is removed. Q23, Q26 and Q28 are removed because they measure social attitudes outside the 4-axis model. Q10, Q12, Q33 and Q37 are removed because nothing uses them (data minimisation).
> - 4 new items (Q39–Q42) balance the Voice/Expert and People/Convenience axes.
> - Question IDs are kept from v1 for traceability.

# Purpose

The quiz is a light, playful way for a user to see their "Bangkok Type": how they tend to weigh trade-offs in city life. If the user consents separately, their anonymised answers also help BMA understand which city trade-offs residents care about.

It is **not** a political-identity test. It does not ask about parties, votes or candidates. It is never used to decide who a user meets.

# Hard Rules (from PRD v2 §6.4)

• Optional. Never required for onboarding, events or connections.  
• Separate explicit consent before the first question (copy below).  
• **Never** used in matching, small-group assignment, recommendations, People I Met ordering or any ranking of people.  
• Raw answers are stored only in the City Research store, under a pseudonymous research_id.  
• Profile display of the type is off by default. Users can hide or delete their result at any time.  
• BMA staff see aggregates only, with k ≥ 10 per cell.  
• Ships in P1, after the DPO approves the DPIA.

# Consent Copy (draft — translate to Thai, DPO to approve)

> **Find your Bangkok Type** 🏙️
> About 20 quick questions about the kind of Bangkok you'd like to live in: streets, neighbourhoods, rules, who gets to decide. Some questions touch on city values and civic preferences.
>
> • Your result is just for fun. It is **never** used to decide who you meet or which group you're in.
> • Your type stays private unless you choose to show it on your profile.
> • If you allow it, BMA uses anonymised, combined answers (never individual ones) to understand what residents want from the city.
>
> [ ] Use my anonymised answers for city research (optional)
> **Start quiz** · Not now

If the research box is unticked, the result is calculated and shown, then the raw answers are thrown away. Only the type code is kept, and only if the user saves it to their profile.

# Audience

• Primary: Bangkok residents aged 20–35. Open to all adult users.  
• Segmentation in aggregates: age band, current district, and (P1) verified registered-resident status. k ≥ 10 applies.

# The 4 Axes

Each axis is scored from −1 to +1. The **first** letter is the positive end.

| Axis | + end | − end |
|---|---|---|
| **NG** | **N** Neighbourhood-first: community, local identity, continuity, everyday quality of life | **G** Growth-first: development, investment, change, ambitious projects |
| **FO** | **F** Free-flow: spontaneity, informality, flexible rules, nightlife | **O** Organised: safety, predictability, standards, structure |
| **VE** | **V** Voice-led: residents decide, participation, bottom-up | **E** Expert-led: professionals and planners make long-term calls |
| **PC** | **P** People-space: walking, parks, public space, transit, street life | **C** Convenience: speed, parking, efficient movement, practical access |

The v1 doc also listed "Collective ↔ Individual / user-pays" and "Traditional ↔ Pluralism" as dimensions. They are **dropped**. The type system never used them, and the pluralism dimension came closest to measuring sensitive social attitudes.

# Scored Question Bank

**How to read the table:** "A →" names the letter that option A pushes toward. Option B pushes toward the opposite letter. For scales, the right-hand end pushes toward the listed letter.

## NG — Neighbourhood ↔ Growth (9 items)

| ID | Question | Options | Scoring |
|---|---|---|---|
| Q2 | A new café street becomes very popular, but local rent starts rising. What would concern you more? | A. The original community disappearing · B. The area losing momentum if development is restricted | A → N |
| Q7 | What makes a city feel successful to you? | A. People actually enjoying everyday life there · B. Big projects and strong economic activity | A → N |
| Q8 | Bangkok gets an unexpected extra budget. What would you choose first? | A. Improve everyday things people use everywhere · B. Build one major project that could transform the city | A → N |
| Q13 | An old neighbourhood is becoming trendy. What should Bangkok protect first? | A. The people already living and working there · B. The area's ability to attract new investment and visitors | A → N |
| Q14 | If an old building is not historically famous but locals love it, should that matter? | Scale 1–5: Not really → Very much | 5 → N |
| Q15 | What bothers you more? | A. A neighbourhood changing too quickly · B. A neighbourhood staying the same for too long | A → N |
| Q16 | A vacant plot could become either… | A. Small public space + community uses · B. Commercial development with shops / jobs | A → N |
| Q17 | When an area becomes popular, who should benefit first? | A. People already there · B. Anyone who can create the best new opportunities there | A → N |
| Q25 | What makes Bangkok feel more "Bangkok"? | A. Keeping its traditional character · B. Constantly mixing old and new | A → N |

## FO — Free-flow ↔ Organised (7 items)

| ID | Question | Options | Scoring |
|---|---|---|---|
| Q4 | Which makes a neighbourhood feel more alive? | A. Lots of small shops, vendors and different things happening · B. Clean, organised spaces with clear rules | A → F |
| Q5 | Would you rather live somewhere that is… | A. A little messy but full of character · B. Very organised but more predictable | A → F |
| Q6 | A park has become very crowded in the evening. What should happen first? | A. Add more activities and facilities · B. Introduce more rules to control use | A → F |
| Q18 | Which feels more uncomfortable in Bangkok? | A. A place with too few rules · B. A place with too many rules | **A → O** (reversed) |
| Q19 | Would you rather have a nightlife district that is… | A. More lively, even if it creates some noise · B. Quieter, even if businesses close earlier | A → F |
| Q20 | If CCTV made an area feel safer, how comfortable would you be with having significantly more of it? | Scale 1–5: Very uncomfortable → Very comfortable | **5 → O** (reversed) |
| Q22 | Two groups want the same public square: one for a quiet community activity, one for a loud public event. What should matter more? | A. Freedom to use public space · B. Minimising disturbance to others | A → F |

## VE — Voice ↔ Expert (7 items; 3 new)

| ID | Question | Options | Scoring |
|---|---|---|---|
| Q29 | Your district has THB 50 million to improve something. Which process sounds better? | A. Residents vote on several options · B. Experts study the area and choose | A → V |
| Q30 | A project is unpopular at first, but experts strongly believe it will work long-term. Should Bangkok… | A. Try it anyway · B. Wait until more residents support it | **A → E** (reversed) |
| Q31 | Who usually understands a neighbourhood best? | A. People who live there · B. Professionals who study the whole city | A → V |
| Q32 | Bangkok has 50 districts. Should they feel… | A. More consistent, with similar standards everywhere · B. More different, with each district deciding what suits it | **A → E** (reversed) |
| Q39 *(new)* | A new night market is planned for your district. Who should pick the spot? | A. An open meeting of local residents and vendors · B. City planners using footfall and traffic data | A → V |
| Q40 *(new)* | A redesigned footbridge gets lots of complaints in its first month. Bangkok should… | A. Adjust it based on what users are saying · B. Give it a year and judge by usage data | A → V |
| Q41 *(new)* | Which would you trust more to tell you if a new bus route is working? | A. What regular riders say about it · B. What the ridership numbers show | A → V |

## PC — People-space ↔ Convenience (6 items; 1 new)

| ID | Question | Options | Scoring |
|---|---|---|---|
| Q1 | You have a free Sunday. Which Bangkok sounds better? | A. Streets closed for walking, markets and activities · B. Roads kept fully open so getting around is easier | A → P |
| Q3 | A road near your home can fit only one improvement. Pick one. | A. Wider sidewalk + trees · B. More parking / traffic capacity | A → P |
| Q34 | Would you accept adding 10 minutes to your commute if your neighbourhood became noticeably greener and easier to walk? | Scale 1–5: Definitely no → Definitely yes | 5 → P |
| Q35 | If a busy street became pedestrian-only every weekend, your first reaction would be… | A. Finally · B. Sounds fun, but traffic will be terrible · C. Depends on the area · D. Please don't | A = +1, B = −0.5, C = 0, D = −1 (→ P) |
| Q36 | Which feels more valuable in a dense area? | A. 30 additional parking spaces · B. A small shaded plaza with seating | **A → C** (reversed) |
| Q42 *(new)* | Your ideal getting-around-Bangkok upgrade is… | A. Covered walkways and frequent, reliable buses · B. Faster expressways and easier parking | A → P |

# Unscored Items (City Pulse / playful)

These items don't affect the type. They add fun and produce useful City Pulse data. Use them as the 1–2 "breather" questions in each session.

| ID | Question | Format | Why keep |
|---|---|---|---|
| Q9 | Which would make you happier? A. A slightly cheaper commute every day · B. One really good new public attraction in your district | Forced choice | Service-priority signal |
| Q11 | If the city could subsidise only one thing: Getting around / Housing & living costs / Community activities / Support for local businesses | Single choice | Service-priority signal |
| Q21 | What makes you feel safer at night? More people around / More security / Better lighting / Better transport home | Single choice | Directly actionable for night-safety work |
| Q24 | At a city event, would you rather be grouped with… A. People quite similar to you · B. People you normally would never meet | Forced choice | Event-design input. **Never** used for grouping an individual. |
| Q38 | A street floods frequently. Which solution feels better? A. Major engineering infrastructure · B. More green areas that absorb water, even if they use valuable space | Forced choice | Infrastructure-preference signal |
| Budget game | Divide 10 coins among: transport, public space, cost of living, safety, jobs/business, culture | Allocation | City-priority signal |
| Playful | Ideal Friday night · Bangkok superpower · Inconvenience you'd delete · Neighbourhood goes viral on TikTok (copy unchanged from v1) | Single choice | Tone; personalises the result copy |

## Removed from the v2 bank

| ID | Reason |
|---|---|
| Q27 (families and relationships campaign) | Works as a proxy for attitudes toward sexual orientation or family diversity. That is sensitive data with no product use. |
| Q23, Q26, Q28 (lifestyle diversity, shared norms, inclusion vs standards) | They measure social-attitude / pluralism, which is outside the 4-axis model and the most sensitive part of the v1 bank. |
| Q10, Q12 (user-pays, targeted vs universal spending) | They measure redistribution preference, which nothing uses. Re-add only with a stated research purpose and DPO approval. |
| Q33 (majority vs negotiation) | Both options are citizen-led, so it doesn't separate V from E. |
| Q37 (pay more to reduce pollution) | No axis or pulse use. A generic "willingness to pay" item is low value. |

Rule: an item may be added back only if it either (a) maps to one of the 4 axes, or (b) has a documented City Pulse use that the DPO has approved.

# Scoring Specification

## Item scores

Each scored item gives a value `s` between −1 and +1, oriented so that + is the **first** letter of its axis (N, F, V, P):

• **Forced choice (A/B):** the option pointing to the + letter gives +1; the other gives −1. Reversed items are handled by the direction column in the tables above.  
• **5-point scale:** 1 → −1, 2 → −0.5, 3 → 0, 4 → +0.5, 5 → +1. For reversed scales (Q20), flip the sign.  
• **Multi-option (Q35):** use the values listed in its row.  
• **Skipped item:** no value, and it is left out of the mean.

## Axis scores

`axis_score = mean(s for answered items on that axis)`. The result is between −1 and +1.

## Letters and strength

| abs(axis_score) | Strength label shown | Letter |
|---|---|---|
| ≥ 0.60 | Strong | Sign of the score |
| 0.25 – 0.59 | Leans | Sign of the score |
| < 0.25 | **Balanced** | Sign of the score; a score of exactly 0 gives the first letter (N/F/V/P) |

• The 4-letter code is always shown. The strength label on each axis tells the user how firm that letter is, so a "Balanced" letter visibly means "this could go either way".  
• **If 2 or more axes are Balanced**, show the special result **"The Bangkok All-Rounder"** in place of a 16-type archetype ("You see the case for both sides of most city trade-offs"). The code is still stored.

## Session composition (rotation)

• Each session draws **4 scored items per axis, 16 in total**, at random from that axis's pool, plus **2–4 unscored items**. The total is 18–20, about 3–4 minutes.  
• Scored items from all axes are shuffled together, and an unscored or playful item is inserted after every 4–5 scored items.  
• **Within each axis, at least one item must be scale-type or reversed**, so that someone who always picks "A" doesn't end up with a fully positive type.  
• On a retake, prefer items the user hasn't seen. The new result replaces the old one, and the user is told "Types can shift. That's normal."

## Storage

| Store | What |
|---|---|
| City Research (C) | Raw item answers, keyed by research_id, session_id and item_id + version. Kept only if research consent is given. |
| City Research (C) | Axis scores (only with research consent) |
| Social (B) | `bkk_type_code`, `bkk_type_visible` (default false), `bkk_type_updated_at` |

Raw answers and derived scores are stored separately. If the scoring weights change, existing results are recalculated from the raw answers where consent allows.

## Validation before any policy use

• Pilot with at least 300 completions. Check each axis's internal consistency: Cronbach's α ≥ 0.6, or drop or reword the weak items.  
• Check retest stability with a small group retaking after 2 weeks. Aim for at least 70% keeping the same letter on each non-Balanced axis.  
• Archetype labels are for fun only. Policy analysis uses the axis scores and item-level aggregates directly, with k ≥ 10.

# The 16 Bangkok Types

The copy is unchanged from v1. The UI leads with the archetype name and shows the letters second.

| Code | Archetype | One-liner |
|---|---|---|
| NFVP | The Neighbourhood Connector | Loves local character, freedom, people and community participation. |
| NFVC | The Local Free Spirit | Loves neighbourhood life and independence but values convenience too. |
| NFEP | The Urban Idealist | Community-minded and open-minded, but believes good planning can make city life better. |
| NFEC | The Thoughtful Local | Protects local identity but prefers practical, professionally designed solutions. |
| NOVP | The Community Guardian | Wants safe, organised neighbourhoods shaped strongly by the people living there. |
| NOVC | The Practical Neighbour | Values stability, community input and a city that works smoothly day to day. |
| NOEP | The Caring Planner | Wants an orderly, walkable city designed around people's quality of life. |
| NOEC | The Reliable City Builder | Likes stability, practical infrastructure and well-managed neighbourhoods. |
| GFVP | The City Adventurer | Loves change, new ideas, public life and citizen energy. |
| GFVC | The Urban Explorer | Pro-growth, spontaneous and attracted to a fast-moving, convenient Bangkok. |
| GFEP | The Future Urbanist | Wants bold change, open city life and ambitious planning. |
| GFEC | The Modernizer | Development-oriented, practical and enthusiastic about making Bangkok more competitive. |
| GOVP | The Civic Reformer | Wants Bangkok to improve quickly, but with strong rules and citizen participation. |
| GOVC | The City Operator | Likes progress, efficiency, structure and things actually getting done. |
| GOEP | The Master Planner | Thinks Bangkok needs ambitious transformation led by strong planning and good systems. |
| GOEC | The Metro Strategist | Growth, efficiency, organisation and large-scale city solutions matter most. |
| (2+ Balanced) | The Bangkok All-Rounder | Sees the case for both sides of most city trade-offs. |

# Result Screen (v2)

> **You're a City Adventurer — GFVP**
> *"Bangkok should never stop changing."*
>
> You like new ideas, lively streets and places where different people mix. You're comfortable with a little chaos if it makes the city more exciting.
>
> **Your city energy**
> Growth — Strong · Free-flow — Leans · Citizen voice — Balanced · People-space — Strong
>
> **A good debate partner for you:** a Neighbourhood Connector (NFVP). *"Roots meet momentum."*
> **Conversation starter:** "Which Bangkok neighbourhood would you completely redesign if you could?"
>
> [ Show on my profile ] (off by default) · [ Retake ] · [ Delete my result ]

**Removed in v2:**
- the "Natural / Complementary / Interesting Match" blocks;
- every link from a type to real people.

**Allowed:** the "good debate partner" line and the pairing taglines from v1 ("Roots meet momentum", "Dreamer meets designer", "Change it — but listen first", "Opposites worth meeting"). These are only fun copy about *types* on the user's own result screen. They never name, suggest or rank actual users.

# How the Type May and May Not Be Used in BKK Social

| Allowed | Not allowed |
|---|---|
| Shown on the user's own result screen | Used in any matching, grouping or recommendation logic |
| Shown on their profile **if they opt in** | Shown on profiles by default |
| Visible to their People I Met list **only if** they opted to show it on their profile | Used to filter, hide, order or suppress people |
| Hosts use generic city-themed icebreakers ("Pick one city problem your table would fix first") | Hosts see attendees' types, or icebreakers pair people by type |
| BMA sees aggregates by axis and district, with k ≥ 10 | BMA sees an individual's type or answers |

# Product Note

The 16-type system is a playful reading of quiz answers, not a scientifically validated personality diagnosis. If BMA wants to use the data for policy, it should analyse the axis scores and item-level aggregates directly, after the validation steps above, and not the archetype labels.

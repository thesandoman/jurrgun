# Writing quiz scenarios for the Bangkok Type quiz

Every question in the quiz is hand-written. A **scenario** is one situation
("Your grandmother's 80th birthday lunch. Where do you suggest?") with **16
answers, one in the voice of each Bangkok Type**. The quiz shows 6 of the 16
at a time (three opposite pairs), so every answer has to stand on its own and
read like a real, sensible choice. A person should be able to pick it without
feeling silly, and someone who IS that type should think "yes, that's me".

## The four letters (every answer must fit ALL FOUR of its type's letters)

| Letter | Means | Shows up as |
|---|---|---|
| **B** Buzz | energised by people | a group, a crowd, inviting more people, a busy place |
| **C** Chill | small and calm | alone, one or two people, a quiet corner |
| **D** Discover | new and unknown | never been, just opened, a district you don't know |
| **F** Familiar | the usual | your regular spot, a ritual, every week, you know the owner |
| **M** Move | active | walking, cycling, sport, dancing, paddling, hands-on |
| **S** Savour | slow and seated | eating, sitting, talking, watching, lingering |
| **N** New-scene | creative and modern | art, design, indie music, malls, new venues, pop-ups, cafés |
| **H** Heritage | old Bangkok | temples, old markets, canals, shophouses, old recipes, traditional crafts |

The 16 types (full profiles in `src/vibe/archetypes.ts`):
BDMN Street Explorer · BDMH Old-Town Adventurer · BDSN Scene Seeker ·
BDSH Food Hunter · BFMN Team Player · BFMH Festival Regular · BFSN Party Host ·
BFSH Night-Market Regular · CDMN Quiet Wanderer · CDMH Temple Walker ·
CDSN Café Curator · CDSH Story Collector · CFMN Steady Mover ·
CFMH Park Regular · CFSN Cosy Creative · CFSH Neighbourhood Keeper

Check every answer letter by letter: a BFSN answer must be **with people** (B),
somewhere **familiar** (F), **seated/slow** (S) and **modern/creative** (N).

## Places: all of Bangkok

- Every answer names a **real place** and carries its `district` key. Use
  `src/vibe/landmarks.ts` (landmarks for all 50 districts, plus modern venues
  like EmSphere, ICONSIAM, Siam Square, the RCA clubs, Silom Soi 4,
  Rajamangala Stadium). You may also use other real Bangkok places you are
  sure of, with the right district key from `src/lib/constants.ts`.
- **Your file must use every one of the 50 districts at least once** (the
  checker enforces it), and no single district more than 6 times. Outer
  districts (Nong Chok, Lat Krabang, Bang Khun Thian, Khlong Sam Wa, Thawi
  Watthana, Bang Bon, ...) belong in answers too: rice fields, canal markets,
  mangroves, fishing parks, old markets, orchid farms, local malls.
- If you are unsure a place exists or is in that district, use a landmark from
  `landmarks.ts` instead. Do not invent places.

## Inclusive and family friendly (hard rules, checked)

- **Gender neutral.** Never he/she/him/her/his/boyfriend/girlfriend/husband/
  wife/guys/girls/mum/dad. Use "they", "your partner", "your date", "your
  parents", "your sibling", "your grandparent". Thai: no ครับ/ค่ะ, no
  แฟนหนุ่ม/แฟนสาว/สามี/ภรรยา; use แฟน, คู่เดท, พ่อแม่, พี่น้อง, ตายาย.
- **Family friendly.** No alcohol (no beer, wine, cocktails, drinks, shots,
  bar crawls framed around drinking), no drugs, smoking, gambling, nothing
  sexual. Nightlife is fine as **music, dancing, food and people**: "dancing at
  an RCA club", "live jazz at Brown Sugar", "a rooftop with a view". Use
  "mocktails", "Thai tea", "iced coffee", "coconut" when a drink fits.
- **Inclusive.** Across each scenario's 16 answers mix: free / cheap /
  treat-yourself; young and older people; a few answers that need little
  walking (boat, museum, a seat with a view); food for different diets
  (halal at Ban Khrua or Phahurat, vegetarian jay food, street food). Bangkok's
  communities (Kudi Chin, Ban Khrua, Little India, Yaowarat, Bang Lamphu) appear
  as places, food and crafts, **never as religious practice** (no making merit,
  praying, monks, worship).
- **Nothing political**, nothing about religion as practice, income, identity.
- **No em dashes or en dashes** (– —) anywhere, English or Thai.

## Style

- Prompt: short, second person, a real moment. Ends with "?" or ":" or "…".
- Answer: one line, about 8 to 18 words, concrete (a place + what you do).
  No "I". Write it as the action: "Bike the Khlong Ong Ang canal path, then a
  café nobody has posted yet".
- Thai: natural, casual-polite, not a word-for-word translation. Same meaning.
- Icon: one emoji per answer that fits it; one emoji for the scenario.
- `tone`: "dawn" | "morning" | "afternoon" | "evening" | "night" | "rain".
- Do not repeat an answer's wording from another scenario.

## rhythm and plan scenarios

`kind: "rhythm"`: every answer also leans **night owl (+1)** or **early riser
(−1)**, and the text must make the time obvious ("a 6 am paddle…", "a midnight
bowl of…"). `kind: "plan"`: **spontaneous (+1)** or **planner (−1)**, obvious in
the text ("booked a month ahead", "decide on the spot"). Rule: a type and its
opposite (BDSH and CFMN, flip every letter) always lean **opposite ways**. Give
8 answers +1 and 8 answers −1.

## File format

```ts
import type { Scenario } from "../scenarios";

const a = (icon: string, district: string, en: string, th: string, flavour?: 1 | -1) => ({ icon, district, en, th, ...(flavour ? { flavour } : {}) });

export const FAMILY: Scenario[] = [
  {
    id: "grandparent-birthday",
    kind: "core",
    context: "family",
    prompt: { en: "Your grandparent's 80th birthday lunch. Where do you suggest?", th: "มื้อเที่ยงวันเกิด 80 ปีของคุณตาคุณยาย คุณจะเสนอที่ไหน?" },
    icon: "🎂",
    tone: "afternoon",
    answers: {
      BDSH: a("🥟", "thon_buri", "A long table at a Talat Phlu shop none of you have tried, the whole family invited", "โต๊ะยาวที่ร้านในตลาดพลูที่ยังไม่มีใครเคยลอง ชวนมาทั้งบ้าน"),
      // ... all 16 codes
    },
  },
];
```

Only `import type` from `../scenarios` (no other imports).

## Check before you finish

```bash
npx vite-node scripts/check-bank.ts src/vibe/bank/<file>.ts <EXPORT_NAME>
```

It must print `OK`. Fix every error it reports.

## What the app is

Jurrgun is a social meetup app (think Timeleft dinners with strangers, Meetup
groups, a curated feel like Raya, and dates like Hinge). The quiz result
seats people at tables and suggests meetups, so scenarios about **meeting new
people** matter most: dinners with strangers, joining a group, a first date,
a party where you know one person. Answers should feel like something you'd
happily do with people you just met.

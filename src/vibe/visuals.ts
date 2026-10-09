/**
 * Visuals for procedurally generated quiz questions.
 *
 * Every activity, place and time of day has an icon or a sky tone, so each
 * generated question gets its own small illustrated "postcard" (see
 * src/ui/question-art.tsx). Tests check every bank item has one.
 */
import type { Category, Pole, Text } from "./content";

export type Tone = "dawn" | "morning" | "afternoon" | "evening" | "night" | "rain";

export const ACTIVITY_ICONS: Record<string, string> = {
  "squeezing through a packed night market": "🏮",
  "a big table where everyone talks at once": "🍻",
  "a rooftop party with a DJ": "🎧",
  "a festival with live music and crowds": "🎪",
  "a team game with lots of cheering": "📣",
  "meeting ten new people in one evening": "🤝",
  "a street-food crawl with eight new faces": "🍢",
  "a karaoke room with the whole group": "🎤",
  "a quiet corner in a small café": "☕",
  "a slow chat with two or three people": "💬",
  "a calm bench by the river": "🌊",
  "a small book or craft circle": "🧶",
  "a peaceful picnic in the park": "🧺",
  "a low-key board game table": "🎲",
  "a slow walk with one good friend": "🚶",
  "a tea tasting for four": "🍵",
  "a soi you've never walked down": "🛣️",
  "a dish you can't pronounce yet": "🥘",
  "a hidden spot someone just told you about": "🗝️",
  "a pop-up you saw online this morning": "📱",
  "a district across the river you rarely visit": "⛴️",
  "a class in something you've never tried": "🎓",
  "a ferry stop you've never got off at": "🚤",
  "a market in a district you've never visited": "🧭",
  "your go-to noodle shop": "🍜",
  "a café that already knows your order": "🧋",
  "a park where you know every path": "🌳",
  "a favourite market you could walk blindfolded": "🛍️",
  "your usual running route, with company": "👟",
  "a restaurant you'd recommend to anyone": "⭐",
  "the café where you always sit by the window": "🪟",
  "the street-food stall you've loved for years": "🍡",
  "a 10 pm street-food crawl": "🌃",
  "a late-night jazz bar": "🎷",
  "a midnight bike ride through the old town": "🚲",
  "a night market after 9 pm": "🌙",
  "a late movie and dessert after": "🍿",
  "a rooftop that stays open past midnight": "🌆",
  "a late-night khao tom run": "🍲",
  "a 6 am run in the park": "🏃",
  "a morning market before the heat": "🥬",
  "sunrise by the river": "🌅",
  "breakfast jok at 7 am": "🥣",
  "a weekend morning yoga session": "🧘",
  "giving alms and coffee at dawn": "🙏",
  "a sunrise bike ride by the river": "🚴",
  "a walking food quest": "🗺️",
  "a bike tour": "🚲",
  "kayaking along a khlong": "🛶",
  "a pickup badminton or football game": "🏸",
  "a hands-on cooking class": "👩‍🍳",
  "a dance class": "💃",
  "a Muay Thai taster class": "🥊",
  "a volunteer park clean-up": "🧤",
  "a long lunch where nobody rushes": "🍽️",
  "a gallery you take really slowly": "🖼️",
  "a rooftop seat watching the city": "🏙️",
  "a tasting table": "🥢",
  "a film screening": "🎬",
  "a long talk over Thai tea": "🧡",
  "a picnic with nothing to do but talk": "🧺",
  "an afternoon tea that runs long": "🫖",
  "deciding where to eat when you get hungry": "🤤",
  "following whatever looks interesting": "👀",
  "saying yes to a last-minute invite": "📲",
  "picking a random BTS stop and exploring": "🚝",
  "no itinerary, just vibes": "🎲",
  "hopping on the first boat that comes": "⛴️",
  "letting the group pick on the spot": "🙌",
  "booking the table a week ahead": "📅",
  "a route planned stop by stop": "📍",
  "checking opening hours and reviews first": "🔎",
  "a calendar invite with the whole plan": "🗓️",
  "knowing exactly how you're getting home": "🏠",
  "a shared list of three places to try": "📝",
  "tickets booked before anyone asks": "🎟️",
  "a contemporary art gallery": "🎨",
  "a design and makers market": "🛠️",
  "an indie café with a great playlist": "🎶",
  "a street-art walk": "🖌️",
  "a live indie gig": "🎸",
  "a Bangkok Design Week installation": "💡",
  "a new indie bookshop": "📚",
  "an old-town temple walk": "🛕",
  "a heritage shophouse street": "🏘️",
  "a traditional market": "🧺",
  "a Thai craft workshop": "🪡",
  "a historic canal community": "🛶",
  "a Thai classical music performance": "🎻",
  "a shadow puppet show": "🎭",
  "a walk through a century-old market": "🏮",
};

export const PLACE_ICONS: Record<string, string> = {
  Yaowarat: "🏮",
  "Talat Phlu": "🥟",
  "Khlong Bang Luang": "🛶",
  "Charoenkrung–Talat Noi": "🎨",
  "Little India (Phahurat)": "🧵",
  "Rattanakosin Island": "🛕",
  "Charoen Nakhon Road": "🌉",
  Asiatique: "🎡",
  "Lumphini Park": "🌳",
  "Benjakitti Forest Park": "🌿",
  Ari: "☕",
  Chatuchak: "🛍️",
  Siam: "🏙️",
  "Wat Arun riverside": "🛕",
  "Bang Krachao": "🚲",
  "Thonburi canals": "🛶",
  "Sanam Luang": "🪁",
  "Phra Athit Road": "🌊",
  "Ratchada night market": "🌙",
  "Song Wat Road": "🏘️",
};

export const WHEN_TONES: Record<string, Tone> = {
  "Saturday morning": "morning",
  "After work on Thursday": "evening",
  "Sunday afternoon": "afternoon",
  "A rainy Friday evening": "rain",
  "A long weekend": "afternoon",
  "A cool December evening": "evening",
  "A hot April afternoon": "afternoon",
  "Late on a Saturday night": "night",
};

/** One icon per pole, for templates without a place (quick, skip, scale). */
export const POLE_ICONS: Record<Category, { plus: string; minus: string; tone: Tone }> = {
  energy: { plus: "🎉", minus: "🍵", tone: "evening" },
  explore: { plus: "🧭", minus: "🏠", tone: "afternoon" },
  rhythm: { plus: "🌙", minus: "🌅", tone: "dawn" },
  motion: { plus: "🚲", minus: "🍜", tone: "morning" },
  plan: { plus: "🎲", minus: "🗓️", tone: "afternoon" },
  culture: { plus: "🎨", minus: "🛕", tone: "evening" },
};

export function activityIcon(a: Text, category: Category, pole: Pole): string {
  return ACTIVITY_ICONS[a.en] ?? (pole === 1 ? POLE_ICONS[category].plus : POLE_ICONS[category].minus);
}

/** What the picture above a question shows. Built server-side, rendered by question-art.tsx. */
export type Art = {
  tone: Tone;
  /** Big icon(s) in the scene: the place, or the two options. */
  icons: string[];
  /** Short caption on the postcard, e.g. the place name. */
  caption?: Text;
  /** Seeds the skyline so each question looks a little different. */
  seed: number;
};

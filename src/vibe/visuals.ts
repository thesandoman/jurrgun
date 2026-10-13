/**
 * The small illustrated "postcard" above each quiz question (rendered by
 * src/ui/question-art.tsx): a sky in the scenario's time of day and its icon.
 */
import type { Text } from "./content";

export type Tone = "dawn" | "morning" | "afternoon" | "evening" | "night" | "rain";

/** What the picture above a question shows. Built server-side, rendered by question-art.tsx. */
export type Art = {
  tone: Tone;
  /** Big icon(s) in the scene. */
  icons: string[];
  /** Short caption on the postcard. */
  caption?: Text;
  /** Seeds the skyline so each question looks a little different. */
  seed: number;
};

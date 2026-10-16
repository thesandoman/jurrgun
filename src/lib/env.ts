/**
 * The app's Hono environment: bindings from the platform plus per-request
 * variables set by middleware (`c.var.user`, `c.var.lang`).
 */
import type { DatabaseEnv } from "../db";
import type { LoggerEnv } from "../logger";
import type { StateEnv } from "../state";
import type { StorageEnv } from "../storage";
import type { Account, Profile } from "../schema";
import type { Lang } from "./i18n";

export type Bindings = LoggerEnv & StorageEnv & StateEnv & DatabaseEnv & {
  /** Guards the one-time deployed migration route (src/routes/setup.ts). */
  SETUP_KEY?: string;
  /** Sign in with Google / LINE (src/routes/oauth.tsx). A provider is offered only when both of its values are set. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string;
  /** Web Push (src/lib/webpush.ts). Push stays off until both keys are set as SV Cloud settings. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Contact for push services, a URL or mailto:. Defaults to the live site. */
  VAPID_SUBJECT?: string;
  /** Set in tests: skip calls to outside services (weather). */
  NO_EXTERNAL?: string;
};

export type CurrentUser = {
  account: Account;
  /** Null until onboarding is finished. */
  profile: Profile | null;
  /** Unread notifications, for the bell's badge. */
  unread?: number;
  /** Chats with a message not yet read, for the My people tab and the Chats chip. */
  chatUnread?: number;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: CurrentUser | null;
    lang: Lang;
  };
};

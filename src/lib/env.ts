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
  /**
   * Sign in with Apple (src/services/apple.ts): the Services ID, the team and key ids, and the
   * .p8 key's text, all from the owner's Apple Developer account. Offered only when all four are set.
   */
  APPLE_SERVICES_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Web Push (src/lib/webpush.ts). Push stays off until both keys are set as SV Cloud settings. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Contact for push services, a URL or mailto:. Defaults to the live site. */
  VAPID_SUBJECT?: string;
  /**
   * Phone app (src/routes/app-auth.ts): extra redirect URIs, comma-separated, the
   * sign-in hand-off may return to, beyond APP_REDIRECTS in the code. For testing
   * builds such as Expo Go (exp://...); the store builds belong in the code list.
   */
  APP_REDIRECT_URIS?: string;
  /** Expo push (src/lib/expo-push.ts): only needed if "enhanced push security" is on for the Expo project. */
  EXPO_ACCESS_TOKEN?: string;
  /**
   * Sign in with an email code (src/services/email-code.ts). Off, with every
   * surface hidden, until all four are set. EMAIL_PROVIDER is "resend" or
   * "postmark"; EMAIL_HASH_SALT keys the hash the address is stored as.
   */
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_HASH_SALT?: string;
  /**
   * Optional secret key for the hashes of client IPs and sign-in usernames in
   * identity_login_attempts and identity_login_codes (privacy R10, R11). Falls
   * back to EMAIL_HASH_SALT; with neither set the hashes are still keyed, but
   * with a key in the code, so set one of them on the deployed app.
   */
  IP_HASH_SECRET?: string;
  /** Set in tests: skip calls to outside services (weather, email). */
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
  /** An unread urgent notification about an event today (Bangkok): the bell says "วันนี้ / Today" instead of its dot. */
  urgentToday?: boolean;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: CurrentUser | null;
    lang: Lang;
    /** Per-response CSP nonce (src/lib/security-headers.ts); every inline <Script> carries it. */
    nonce: string;
  };
};

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
};

export type CurrentUser = {
  account: Account;
  /** Null until onboarding is finished. */
  profile: Profile | null;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: CurrentUser | null;
    lang: Lang;
  };
};

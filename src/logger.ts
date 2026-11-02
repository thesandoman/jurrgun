/**
 * Leveled logging for an SV Cloud app.
 *
 * Workers stream every console call to the platform log, which is both noisy and
 * billed, so per-request detail must not run at `info`. Levels below the active
 * one are dropped before the console call, not filtered afterwards.
 *
 * The active level comes from the LOG_LEVEL environment variable, set from the
 * SV Cloud dashboard. Unset means `info` — debug output stays off in production
 * until someone deliberately turns it on.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const DEFAULT_LEVEL: LogLevel = "info";

/** Anything with an optional LOG_LEVEL — your Worker's `c.env` satisfies this. */
export interface LoggerEnv {
  LOG_LEVEL?: string;
}

function resolveLevel(env?: LoggerEnv): LogLevel {
  const raw = env?.LOG_LEVEL?.toLowerCase().trim();
  return (LOG_LEVELS as readonly string[]).includes(raw ?? "") ? (raw as LogLevel) : DEFAULT_LEVEL;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  /** The level actually in effect — handy in tests. */
  readonly level: LogLevel;
}

/**
 * Build a logger for one request. Pass `c.env` so the level follows the
 * deployment's configuration.
 *
 *   const log = createLogger(c.env);
 *   log.debug("cart", { items: cart.length });  // silent in production
 *   log.error("checkout failed", { orderId });  // always emitted
 *
 * Never pass secrets, tokens or whole request bodies as context — log an id.
 */
export function createLogger(env?: LoggerEnv): Logger {
  const level = resolveLevel(env);
  const active = RANK[level];

  const emit =
    (name: Exclude<LogLevel, "silent">, sink: (line: string) => void) =>
    (message: string, context?: Record<string, unknown>) => {
      if (RANK[name] < active) return;
      // One structured line per event: greppable in `wrangler tail`, and it
      // survives the platform's line-splitting better than multi-arg console.
      const payload = context ? ` ${safeStringify(context)}` : "";
      sink(`[${name}] ${message}${payload}`);
    };

  return {
    level,
    debug: emit("debug", console.debug.bind(console)),
    info: emit("info", console.info.bind(console)),
    warn: emit("warn", console.warn.bind(console)),
    error: emit("error", console.error.bind(console)),
  };
}

/** How much of a failed query's SQL to keep. The platform cuts long log lines, and the column list alone can fill one. */
const MAX_SQL_CHARS = 300;

/**
 * A failed query's message is `Failed query: <sql>\nparams: <values>`. Drop the values,
 * which can hold account ids, and shorten the SQL.
 */
function cleanMessage(message: string): string {
  if (!message.startsWith("Failed query:")) return message;
  const sql = message.split("\nparams:")[0];
  return sql.length > MAX_SQL_CHARS ? `${sql.slice(0, MAX_SQL_CHARS)}…` : sql;
}

function serializeError(err: Error): Record<string, unknown> {
  // The cause goes first: it holds the database's own reason, and must survive if the line is cut.
  const result: Record<string, unknown> = {};
  if (err.cause instanceof Error) {
    result.cause = serializeError(err.cause);
  } else if (err.cause !== undefined && err.cause !== null) {
    result.cause = String(err.cause);
  }
  result.name = err.name;
  result.message = cleanMessage(err.message);
  return result;
}

/** Context may hold an Error or a cycle; neither should take the request down. */
function safeStringify(context: Record<string, unknown>): string {
  try {
    return JSON.stringify(context, (_key, value) =>
      value instanceof Error ? serializeError(value) : value,
    );
  } catch {
    return '{"log_error":"context was not serializable"}';
  }
}

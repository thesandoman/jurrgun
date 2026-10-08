/**
 * Stateful objects. A named piece of your app that remembers things.
 *
 * ---
 *
 * WHAT THIS IS FOR. Your database (`db.ts`) is the right place for almost
 * everything: users, orders, posts, anything you query across. A stateful
 * object is for the cases a database is bad at, and there are three:
 *
 *   live connections   a chat room, a shared document, a multiplayer game -
 *                      many people connected at once, all seeing the same
 *                      thing change. Also how a page hears that your data
 *                      changed, instead of asking again and again: the page
 *                      `listen`s, your server `publish`es after it writes.
 *   scheduled tasks    "send this in an hour", "retry tomorrow" - work that
 *                      has to happen later, without anyone visiting your app
 *   a private store    a counter, a queue, a rate limiter - something that
 *                      must be exactly right even when a hundred requests
 *                      touch it at the same instant
 *
 * The last one is the underrated one. Two requests incrementing a row in a
 * normal database can lose an update. Inside one stateful object they cannot:
 * it handles one thing at a time, by design.
 *
 * ---
 *
 * HOW YOU ADDRESS ONE. By a NAME YOU CHOOSE - `"room:42"`, `"cart:" + userId`,
 * `"ratelimit:" + ip`. The same name always reaches the same object, and a
 * name nobody has used yet quietly becomes a new empty one. There is nothing
 * to create and nothing to configure.
 *
 * THE NAME IS A SECURITY DECISION, AND IT IS YOURS. SV Cloud has no idea which
 * of your users may see which object - only you do. So build the name on the
 * server from the session you already checked:
 *
 *     const cart = await getStatefulObject(c.env, `cart:${session.userId}`);   // yes
 *     const cart = await getStatefulObject(c.env, c.req.query('cart'));        // NO
 *
 * The second line lets any visitor read any other visitor's cart by changing
 * one query parameter. This file cannot stop that, because from the platform's
 * side that call looks exactly like a legitimate one.
 *
 * ---
 *
 * DEPLOYED ONLY. There is no local stand-in - a fake one would forget
 * everything on restart and would not survive a second process, which is the
 * opposite of the point. Every function here throws a clear error under
 * `npm run dev`, so build the rest of a feature locally and test the stateful
 * part on the deployed app.
 */

/** One task that has already fired, waiting to be handled. See `takeTasks`. */
export interface FiredTask {
  id: number;
  name: string;
  payload: unknown;
  firedAt: number;
}

interface StatefulStub {
  sizeBytes(token: string): Promise<number>;
  get(token: string, key: string): Promise<unknown>;
  put(token: string, key: string, value: unknown): Promise<void>;
  delete(token: string, key: string): Promise<boolean>;
  list(token: string, prefix?: string): Promise<Record<string, unknown>>;
  scheduleTask(token: string, name: string, runAt: number, payload?: unknown): Promise<void>;
  takeTaskEvents(token: string, limit?: number): Promise<FiredTask[]>;
  cancelTasks(token: string, name: string): Promise<number>;
  broadcast(token: string, data: unknown): Promise<void>;
  fetch(request: Request): Promise<Response>;
}

export interface StateEnv {
  /** Looks a name up. Present when deployed, absent locally. Managed by SV Cloud. */
  STATE_DIRECTORY?: {
    resolve(token: string, name: string): Promise<{ id: string }>;
  };
  /** The objects themselves. Managed by SV Cloud. */
  STATE_OBJECTS?: {
    idFromString(id: string): DurableObjectId;
    get(id: DurableObjectId): StatefulStub;
  };
  /** Your app's access token. Managed by SV Cloud, you never set this by hand. */
  CLOUD_STATE_TOKEN?: string;
  /** Secret for signing and verifying scheduled task webhooks. */
  TASK_WEBHOOK_SECRET?: string;
}

/**
 * What you get back from `getStatefulObject`.
 *
 * Note there is no way to ask this for its id, and no function here takes one.
 * That is deliberate and load-bearing: an id is a direct address, and an app
 * that puts one in a URL or accepts one from a request lets one of its users
 * reach another's object. Names go in, behaviour comes out, and the address
 * never passes through your code at all.
 */
export interface StatefulObject {
  /** Roughly how much this object is holding, in bytes. */
  sizeBytes(): Promise<number>;
  /** Read one stored value. `null` if nothing is stored under `key`. */
  get(key: string): Promise<unknown>;
  /** Store one value. Anything JSON-shaped works. */
  put(key: string, value: unknown): Promise<void>;
  /** Remove one stored value. Returns whether there was one. */
  delete(key: string): Promise<boolean>;
  /** Every stored value, optionally only those whose key starts with `prefix`. */
  list(prefix?: string): Promise<Record<string, unknown>>;
  /**
   * Run something later. `runAt` is a time, not a delay - a `Date`, or
   * milliseconds since 1970.
   *
   *     await job.scheduleTask('send-reminder', Date.now() + 60 * 60 * 1000, {
   *       secret: c.env.TASK_WEBHOOK_SECRET,
   *       data: { orderId }
   *     });
   *
   * You can schedule as many as you like on one object. They survive
   * everything: the object goes to sleep and wakes itself up at the right
   * moment, with nobody visiting your app.
   *
   * When the task fires, it automatically dispatches an authenticated HTTP POST
   * webhook to your app (`/api/tasks/webhook`, or the `path` specified in the
   * payload), signed with HMAC-SHA256 using the provided `secret`. It also
   * waits in a queue until collected with `takeTasks`.
   *
   * THERE IS NO SEPARATE REPEATING TASK, AND THAT IS DELIBERATE. Work that
   * repeats is a task whose handler schedules the next one - the first thing
   * it does, before the work, because a failed webhook is not retried and a
   * reschedule that only runs after successful work ends the chain the first
   * time the work throws:
   *
   *     const job = await getStatefulObject(c.env, 'digest');
   *     let next = task.firedAt + EVERY;            // from firedAt, not Date.now(),
   *     while (next <= Date.now()) next += EVERY;   // or every cycle drifts later
   *     await job.scheduleTask('hourly-digest', next, { secret, data });
   *     try { await doTheWork(); } catch (err) { log(err); }
   *
   * One stable name per chain, started once - `cancelTasks(name)` is the only
   * way to stop one. Delivery is at-least-once, so make the work idempotent.
   */
  scheduleTask(name: string, runAt: Date | number, payload?: unknown): Promise<void>;
  /**
   * Collect tasks that have fired, and clear them.
   *
   * Call this from a route, or from your own repeating task. Anything you take
   * is gone from the queue, so finish handling it before you return.
   */
  takeTasks(limit?: number): Promise<FiredTask[]>;
  /** Cancel every not-yet-fired task with this name. Returns how many. */
  cancelTasks(name: string): Promise<number>;
  /**
   * Turn an incoming request into a live connection, for the browser's
   * `new WebSocket(...)`.
   *
   *     app.get('/ws/:room', async (c) => {
   *       const session = await requireSession(c);              // your check
   *       const room = await getStatefulObject(c.env, `room:${c.req.param('room')}`);
   *       return room.connect(c.req.raw);
   *     });
   *
   * Anything one connection sends is passed on to everybody else connected to
   * the SAME object. Send JSON.
   *
   * Connections cost nothing while nobody is talking - the object sleeps
   * between messages and wakes for each one. This matters: an app that holds a
   * connection open the expensive way can spend a whole month's allowance in
   * under a minute, and using `connect` is what keeps that from happening.
   */
  connect(request: Request): Promise<Response>;
  /**
   * Like `connect`, but the browser can only RECEIVE. Use it for a page that
   * watches data change - an order list, a dashboard, a notification bell -
   * where only your server should ever send anything. Whatever a `listen`
   * connection sends is refused, so one visitor cannot push fake updates to
   * everybody else.
   *
   *     app.get('/live/orders', async (c) => {
   *       const session = await requireSession(c);              // your check
   *       const feed = await getStatefulObject(c.env, `orders:shop:${session.shopId}`);
   *       return feed.listen(c.req.raw);
   *     });
   *
   * A chat room, where people talk to each other, uses `connect`. A feed uses
   * `listen`.
   */
  listen(request: Request): Promise<Response>;
  /**
   * Send a message, from your server, to everybody connected to this object
   * right now. Call it after a write succeeds, so open pages hear about it:
   *
   *     await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, id));
   *     const feed = await getStatefulObject(c.env, `orders:shop:${shopId}`);
   *     await feed.publish({ type: 'orders.changed' }).catch(() => {});
   *
   * EVERYONE connected to the object receives EVERY message, so the object's
   * name decides the audience. On a shared object send a small "this changed"
   * signal and let each page refetch through its own route; on an object named
   * for one user (`user:${userId}`) you may send that user's data itself.
   *
   * Nobody connected is fine - the message simply goes nowhere. It is not
   * stored or replayed, so a page should also refetch when it (re)connects.
   */
  publish(data: unknown): Promise<void>;
}

function requireDeployed(env: StateEnv): {
  directory: NonNullable<StateEnv["STATE_DIRECTORY"]>;
  objects: NonNullable<StateEnv["STATE_OBJECTS"]>;
  token: string;
} {
  if (!env.STATE_DIRECTORY || !env.STATE_OBJECTS) {
    throw new Error(
      "Stateful objects are only available on the deployed app. Run this part against your deployed URL rather than `npm run dev`.",
    );
  }
  if (!env.CLOUD_STATE_TOKEN) {
    throw new Error(
      "CLOUD_STATE_TOKEN is missing. This is managed by SV Cloud - if you are seeing this on the deployed app, reconnect the project from your dashboard.",
    );
  }
  return { directory: env.STATE_DIRECTORY, objects: env.STATE_OBJECTS, token: env.CLOUD_STATE_TOKEN };
}

/**
 * Names are looked up once per name and then remembered for as long as this
 * copy of your app is running, so calling `getStatefulObject` on every request
 * is fine - it is a lookup in memory after the first time.
 */
const resolved = new Map<string, Promise<string>>();

/**
 * Get the object with this name, creating it the first time you use the name.
 *
 * Build `name` on the server from something you have already checked. See this
 * file's header - it is the one decision here that nothing else can make.
 */
export async function getStatefulObject(env: StateEnv, name: string): Promise<StatefulObject> {
  const { directory, objects, token } = requireDeployed(env);
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("getStatefulObject needs a name, for example `room:42`.");
  }

  let lookup = resolved.get(name);
  if (!lookup) {
    lookup = directory.resolve(token, name).then((r) => r.id);
    resolved.set(name, lookup);
    // A failed lookup must not be remembered, or one blip poisons this name
    // for the life of the process.
    lookup.catch(() => resolved.delete(name));
  }

  const stub = objects.get(objects.idFromString(await lookup));

  return {
    sizeBytes: () => stub.sizeBytes(token),
    get: (key) => stub.get(token, key),
    put: (key, value) => stub.put(token, key, value),
    delete: (key) => stub.delete(token, key),
    list: (prefix) => stub.list(token, prefix),
    scheduleTask: (taskName, runAt, payload) =>
      stub.scheduleTask(token, taskName, runAt instanceof Date ? runAt.getTime() : runAt, payload),
    takeTasks: (limit) => stub.takeTaskEvents(token, limit),
    cancelTasks: (taskName) => stub.cancelTasks(token, taskName),
    connect: (request) => openConnection(stub, token, request, false),
    listen: (request) => openConnection(stub, token, request, true),
    publish: (data) => stub.broadcast(token, data),
  };
}

function openConnection(
  stub: StatefulStub,
  token: string,
  request: Request,
  listenOnly: boolean,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set("x-sv-state-token", token);
  // Always set, never inherited from the incoming request, so the app's own
  // choice of `connect` or `listen` is what decides it.
  headers.set("x-sv-state-listen", listenOnly ? "1" : "0");
  return stub.fetch(new Request(request, { headers }));
}

/**
 * Verify that an incoming request is an authentic ScheduledTask webhook
 * signed with HMAC-SHA256.
 *
 * Checks `x-sv-task-signature` header (format: `t=<timestamp>,v1=<hex>`).
 * Enforces a timestamp tolerance window (default 5 minutes) to protect against
 * replay attacks.
 *
 *     app.post('/api/tasks/webhook', async (c) => {
 *       const valid = await verifyTaskWebhook(c.req.raw, c.env.TASK_WEBHOOK_SECRET);
 *       if (!valid) return c.json({ error: 'Unauthorized' }, 401);
 *       const task = await c.req.json();
 *       // ...
 *     });
 */
export const verifyTaskWebhook = async (
  request: Request,
  secret?: string,
  toleranceSeconds = 300,
): Promise<boolean> => {
  if (!secret || typeof secret !== "string" || secret.length === 0) {
    return false;
  }
  const header = request.headers.get("x-sv-task-signature");
  if (!header) return false;

  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = Number(v);
    if (k === "v1") signature = v;
  }

  if (!timestamp || !signature || !Number.isFinite(timestamp)) {
    return false;
  }

  const now = Date.now();
  if (Math.abs(now - timestamp) > toleranceSeconds * 1000) {
    return false;
  }

  const body = await request.clone().text();
  const signable = `${timestamp}.${body}`;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const match = signature.match(/.{1,2}/g);
    if (!match) return false;
    const sigBytes = new Uint8Array(match.map((byte) => parseInt(byte, 16)));

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(signable),
    );
  } catch {
    return false;
  }
};


/**
 * Your file storage. Everything that reads/writes files goes through here.
 *
 * ---
 *
 * How it works, because the two environments differ and that surprises people:
 *
 *   deployed   your app -> the SV Cloud files service -> your files, isolated
 *              from every other app on the platform
 *   locally    a real R2 bucket on your own machine, separate from the
 *              deployed app and safe to wipe
 *
 * Deployed, your app has no bucket credential and never sees one — it holds a
 * token that only unlocks its own files, and the files service does the rest.
 *
 * **This app is not locked to SV Cloud.** It is a plain Worker (a V8 isolate),
 * and every function below falls back to the local `BUCKET` binding
 * (wrangler.toml) whenever the files-service binding is absent — same shape
 * as `db.ts`'s Postgres fallback.
 */

export interface ObjectMetadata {
  key: string;
  size: number;
  uploaded: string;
  httpEtag: string;
  contentType?: string;
}

export interface UploadPartUrl {
  partNumber: number;
  url: string;
}

export interface CompletedUploadPart {
  partNumber: number;
  etag: string;
}

export interface StorageEnv {
  /** The SV Cloud files service. Present when deployed, absent locally. */
  FILES?: {
    get(token: string, key: string): Promise<{ metadata: ObjectMetadata; body: ReadableStream }>;
    head(token: string, key: string): Promise<ObjectMetadata>;
    put(
      token: string,
      key: string,
      data: ReadableStream | ArrayBuffer | string,
      options?: { contentType?: string; contentLength?: number },
    ): Promise<{ metadata: ObjectMetadata; deltaBytes: number }>;
    delete(token: string, key: string | string[]): Promise<{ deleted: string[]; deltaBytes: number }>;
    list(
      token: string,
      options?: { prefix?: string; cursor?: string; limit?: number },
    ): Promise<{ keys: ObjectMetadata[]; cursor?: string; truncated: boolean }>;
    presign(
      token: string,
      options: {
        method: "GET" | "PUT";
        key: string;
        expiresIn?: number;
        contentLength?: number;
        contentType?: string;
      },
    ): Promise<{ url: string; method: string; key: string; expiresIn: number }>;
    createMultipart(
      token: string,
      key: string,
      contentType?: string,
    ): Promise<{ uploadId: string }>;
    presignParts(
      token: string,
      options: {
        key: string;
        uploadId: string;
        partNumbers: number[];
        totalBytes: number;
        partSize: number;
      },
    ): Promise<{ parts: UploadPartUrl[]; expiresIn: number }>;
    completeMultipart(
      token: string,
      key: string,
      uploadId: string,
      parts: CompletedUploadPart[],
    ): Promise<void>;
    abortMultipart(token: string, key: string, uploadId: string): Promise<void>;
    listUploadParts(
      token: string,
      key: string,
      uploadId: string,
    ): Promise<{ parts: CompletedUploadPart[] }>;
  };
  /** Your app's storage access token. Managed by SV Cloud, you never set this by hand. */
  CLOUD_FILES_TOKEN?: string;
  /** Local file storage, for development. wrangler.toml gives you a real local R2 bucket. */
  BUCKET?: R2Bucket;
}

function requireFilesToken(env: StorageEnv): string {
  const token = env.CLOUD_FILES_TOKEN;
  if (!token) {
    throw new Error(
      "CLOUD_FILES_TOKEN is missing. This is managed by SV Cloud — if you are seeing this on the deployed app, reconnect the project from your dashboard.",
    );
  }
  return token;
}

function fromR2Object(object: R2Object, key: string): ObjectMetadata {
  return {
    key,
    size: object.size,
    uploaded: object.uploaded.toISOString(),
    httpEtag: object.httpEtag,
    contentType: object.httpMetadata?.contentType,
  };
}

function requireBucket(env: StorageEnv): R2Bucket {
  if (!env.BUCKET) {
    throw new Error(
      "No local storage available. wrangler.toml should already give you one — check `npm run dev` started cleanly.",
    );
  }
  return env.BUCKET;
}

/** Fetch one file's bytes and metadata. Returns `null` if there is no object at `key`. */
export async function getObject(
  env: StorageEnv,
  key: string,
): Promise<{ metadata: ObjectMetadata; body: ReadableStream } | null> {
  if (env.FILES) {
    try {
      return await env.FILES.get(requireFilesToken(env), key);
    } catch (err) {
      if (err instanceof Error && err.name === "NOT_FOUND") return null;
      throw err;
    }
  }
  const object = await requireBucket(env).get(key);
  if (!object) return null;
  return { metadata: fromR2Object(object, key), body: object.body };
}

/** Metadata only, no body — cheaper than `getObject` when you just need to know a file exists. */
export async function headObject(env: StorageEnv, key: string): Promise<ObjectMetadata | null> {
  if (env.FILES) {
    try {
      return await env.FILES.head(requireFilesToken(env), key);
    } catch (err) {
      if (err instanceof Error && err.name === "NOT_FOUND") return null;
      throw err;
    }
  }
  const object = await requireBucket(env).head(key);
  return object ? fromR2Object(object, key) : null;
}

/** Write a file. `data` may be a stream, an ArrayBuffer, or a string. */
export async function putObject(
  env: StorageEnv,
  key: string,
  data: ReadableStream | ArrayBuffer | string,
  options?: { contentType?: string },
): Promise<ObjectMetadata> {
  if (env.FILES) {
    const { metadata } = await env.FILES.put(requireFilesToken(env), key, data, options);
    return metadata;
  }
  const object = await requireBucket(env).put(key, data, {
    httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
  });
  return fromR2Object(object, key);
}

/** Delete one or more files. Deleting a key that doesn't exist is not an error. */
export async function deleteObject(env: StorageEnv, key: string | string[]): Promise<void> {
  if (env.FILES) {
    await env.FILES.delete(requireFilesToken(env), key);
    return;
  }
  const bucket = requireBucket(env);
  const keys = Array.isArray(key) ? key : [key];
  await bucket.delete(keys);
}

/** List files under an optional prefix. Capped per page — pass the returned `cursor` back in to get the next one. */
export async function listObjects(
  env: StorageEnv,
  options?: { prefix?: string; cursor?: string; limit?: number },
): Promise<{ keys: ObjectMetadata[]; cursor?: string; truncated: boolean }> {
  if (env.FILES) {
    return env.FILES.list(requireFilesToken(env), options);
  }
  const page = await requireBucket(env).list({
    prefix: options?.prefix,
    cursor: options?.cursor,
    limit: options?.limit,
  });
  return {
    keys: page.objects.map((o) => fromR2Object(o, o.key)),
    cursor: page.truncated ? page.cursor : undefined,
    truncated: page.truncated,
  };
}

/* ------------------------------------------------------- serving to a browser */

/**
 * A temporary URL the browser can fetch the file from directly.
 *
 * USE THIS FOR ANYTHING A BROWSER LOADS - every `<img src>`, `<video src>`,
 * audio player and download button. Not as an optimisation: reading a file with
 * `getObject` and re-serving it from your own route is measurably unusable for
 * real files. Bytes read that way cross a service boundary on their way through
 * your app, and measured on the deployed platform that path moves about
 * 40 KB/s - a 7 MB photo takes roughly three minutes, and a browser gives up
 * long before it arrives, leaving you with a blank image and a 200 response.
 *
 * A URL from here has no such problem: the browser talks to storage directly
 * and your app is not in the path at all.
 *
 * `getObject` is still the right call when YOUR CODE needs the bytes - reading
 * a CSV to import it, checking a file's contents, generating a thumbnail. The
 * rule is simple: bytes your app itself consumes, `getObject`; bytes a browser
 * displays, `getObjectUrl`.
 *
 * TWO THINGS TO KNOW ABOUT THE URL. It expires - minutes, not days - so mint it
 * when you render the page rather than storing it in a row. And while it lives,
 * it works for anybody holding it: treat it as a shared link, and do not put one
 * in a public feed for a file that is meant to be private.
 */
export async function getObjectUrl(
  env: StorageEnv,
  key: string,
  options?: { expiresIn?: number },
): Promise<string> {
  const files = env.FILES;
  if (!files) {
    throw new Error(
      "Direct file URLs are only available on the deployed app. Locally, serve the bytes with getObject instead.",
    );
  }
  const { url } = await files.presign(requireFilesToken(env), {
    method: "GET",
    key,
    expiresIn: options?.expiresIn,
  });
  return url;
}

/**
 * A temporary URL the browser can upload ONE file to directly, for files small
 * enough not to need the multipart flow below (under ~100 MB).
 *
 * `contentLength` is signed into the URL, so the browser cannot send more bytes
 * than you allowed. If you pass a `contentType`, the browser must send exactly
 * that same content-type header on its PUT - a mismatch is refused with the
 * identical error as sending too many bytes, which is confusing enough to be
 * worth avoiding by passing `file.type || undefined` on both sides.
 */
export async function putObjectUrl(
  env: StorageEnv,
  key: string,
  contentLength: number,
  options?: { contentType?: string; expiresIn?: number },
): Promise<string> {
  const files = env.FILES;
  if (!files) {
    throw new Error(
      "Direct upload URLs are only available on the deployed app. Locally, use putObject.",
    );
  }
  const { url } = await files.presign(requireFilesToken(env), {
    method: "PUT",
    key,
    contentLength,
    contentType: options?.contentType,
    expiresIn: options?.expiresIn,
  });
  return url;
}

/* ------------------------------------------------- large uploads (>100 MB) */

/**
 * Everything below is for ONE situation: a user of your app needs to send you a
 * file too big to pass through your app in a single request - a video, a raw
 * photo set, a big export.
 *
 * `putObject` above cannot do that, and no amount of cleverness makes it. Your
 * app is a Worker: the whole request has to fit in its memory and its time
 * budget, so roughly 100 MB is the hard edge. These functions sidestep it by
 * never sending the bytes to your app at all. You hand the browser a list of
 * URLs, the browser uploads directly to storage, and your app is only told
 * where to put it and when it is done.
 *
 * The shape of the flow, all of it in your own routes:
 *
 *   1. browser tells you the filename and size
 *   2. you check the user is allowed, pick a key, call `startLargeUpload`
 *   3. you return the part URLs; the browser PUTs each part to its URL
 *   4. the browser sends you back the ETag of each part
 *   5. you call `finishLargeUpload`, and write your database row
 *
 * YOU ARE STILL THE ONE WHO SAYS YES. Nothing here checks whether the person
 * uploading is allowed to - that is your `/api/uploads/start` route's job, and
 * it is the reason this is not simply an open endpoint. Check the session,
 * check any quota of your own, and generate the key yourself.
 *
 * If the sender has NO account with you - a client, a photographer - do not
 * build this. Ask the owner for an upload link instead (AGENTS.md 5.2): it is
 * an already-built version of all of this, with its own budget and expiry.
 *
 * Deployed only. There is no way to hand a browser a direct upload URL from
 * `npm run dev`, so these throw locally; test with `putObject` and a small file.
 */

/** Files at or above this need the large-upload flow. Below it, `putObject` is simpler. */
export const LARGE_UPLOAD_THRESHOLD = 100 * 1024 * 1024;

/**
 * Every part except the last must be EXACTLY this size. That is a storage
 * requirement, not a suggestion - the browser must slice on this boundary or
 * the finished file is rejected.
 */
export const UPLOAD_PART_SIZE = 64 * 1024 * 1024;

/** Part URLs handed out per call. Come back with `moreUploadParts` for the next window. */
export const UPLOAD_PART_WINDOW = 20;

function requireFilesService(env: StorageEnv) {
  if (!env.FILES) {
    throw new Error(
      "Large uploads are only available on the deployed app - there is no way to hand a browser a direct upload URL locally. Use putObject with a smaller file while developing.",
    );
  }
  return env.FILES;
}

export function uploadPartCount(totalBytes: number): number {
  return Math.max(1, Math.ceil(totalBytes / UPLOAD_PART_SIZE));
}

/**
 * Begin a large upload and get the first window of part URLs.
 *
 * Keep the returned `uploadId` - you need it to finish or abandon the upload,
 * and it is the only handle that exists. Storing it on a row alongside the key
 * is the usual answer.
 */
export async function startLargeUpload(
  env: StorageEnv,
  key: string,
  totalBytes: number,
  options?: { contentType?: string },
): Promise<{
  uploadId: string;
  partSize: number;
  partCount: number;
  parts: UploadPartUrl[];
}> {
  const files = requireFilesService(env);
  const token = requireFilesToken(env);
  const { uploadId } = await files.createMultipart(token, key, options?.contentType);
  const partCount = uploadPartCount(totalBytes);
  const { parts } = await files.presignParts(token, {
    key,
    uploadId,
    partNumbers: Array.from(
      { length: Math.min(partCount, UPLOAD_PART_WINDOW) },
      (_, i) => i + 1,
    ),
    totalBytes,
    partSize: UPLOAD_PART_SIZE,
  });
  return { uploadId, partSize: UPLOAD_PART_SIZE, partCount, parts };
}

/** The next window of part URLs. Part URLs expire, which is why they come in windows. */
export async function moreUploadParts(
  env: StorageEnv,
  key: string,
  uploadId: string,
  totalBytes: number,
  afterPart: number,
): Promise<UploadPartUrl[]> {
  const files = requireFilesService(env);
  const partCount = uploadPartCount(totalBytes);
  const partNumbers: number[] = [];
  for (
    let n = Math.max(1, afterPart + 1);
    n <= partCount && partNumbers.length < UPLOAD_PART_WINDOW;
    n++
  ) {
    partNumbers.push(n);
  }
  if (partNumbers.length === 0) return [];
  const { parts } = await files.presignParts(requireFilesToken(env), {
    key,
    uploadId,
    partNumbers,
    totalBytes,
    partSize: UPLOAD_PART_SIZE,
  });
  return parts;
}

/**
 * Which parts have actually arrived. This is what makes an interrupted upload
 * resumable: ask, then hand out URLs for only the ones missing.
 */
export async function uploadedParts(
  env: StorageEnv,
  key: string,
  uploadId: string,
): Promise<CompletedUploadPart[]> {
  const { parts } = await requireFilesService(env).listUploadParts(
    requireFilesToken(env),
    key,
    uploadId,
  );
  return parts;
}

/**
 * Assemble the parts into the finished file.
 *
 * Pass the ETags the browser collected. If you did not collect them - a
 * browser can only read that response header when the storage CORS policy
 * exposes it - pass nothing and the parts already stored are used instead.
 * Slower, always correct.
 */
export async function finishLargeUpload(
  env: StorageEnv,
  key: string,
  uploadId: string,
  parts?: CompletedUploadPart[],
): Promise<ObjectMetadata> {
  const files = requireFilesService(env);
  const token = requireFilesToken(env);
  const manifest = parts?.length ? parts : await uploadedParts(env, key, uploadId);
  await files.completeMultipart(token, key, uploadId, manifest);
  const metadata = await files.head(token, key);
  return metadata;
}

/**
 * Abandon an upload that will never finish.
 *
 * Not optional housekeeping: parts already uploaded are stored and billed, and
 * they do not show up in a listing, so nothing else will ever find them. Call
 * this when a user cancels, and sweep abandoned rows on a schedule.
 */
export async function abortLargeUpload(
  env: StorageEnv,
  key: string,
  uploadId: string,
): Promise<void> {
  await requireFilesService(env).abortMultipart(requireFilesToken(env), key, uploadId);
}

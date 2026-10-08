/**
 * Use a standard S3 client against your app's file storage.
 *
 * ---
 *
 * You do not need this file. `storage.ts` already reads and writes your files
 * with less ceremony, and it is what the rest of this app uses. This exists for
 * one specific situation: you are bringing code that already speaks S3 — from
 * AWS, from another host, from a library that expects an S3 bucket — and you
 * would rather point it here than rewrite it.
 *
 * Install the SDK first, since this template does not ship it:
 *
 *     npm install @aws-sdk/client-s3
 *
 * Then:
 *
 *     import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
 *     import { s3ClientConfig, S3_BUCKET } from "./s3";
 *
 *     const s3 = new S3Client(s3ClientConfig(c.env));
 *     const result = await s3.send(
 *       new GetObjectCommand({ Bucket: S3_BUCKET, Key: "uploads/clip.mp4" }),
 *     );
 *
 * ---
 *
 * Two things about it that are worth knowing before you rely on it.
 *
 * IT DOES NOT GO OVER THE INTERNET. The endpoint below is a name, not an
 * address: nothing resolves it, and the request handler here sends every call
 * down your app's own connection to the storage service instead. That is what
 * makes it safe for your app to hold these credentials as ordinary settings —
 * they open nothing that anybody outside your app can reach. It also means the
 * credentials are useless from your laptop, so this only works in the deployed
 * app. Locally, use `storage.ts`, which falls back to a real local bucket.
 *
 * CHECKSUM CALCULATION IS TURNED OFF BELOW, and it has to stay off. With it on,
 * the SDK wraps your file in an extra layer of framing that the storage service
 * does not unwrap, and your uploads would arrive subtly corrupted. Every request
 * is already signed and already runs over an internal connection.
 */

/** The bucket name to pass to every command. Your app has exactly one. */
export const S3_BUCKET = "files";

export interface S3Env {
  /** Your app's connection to the storage service. Present when deployed. */
  FILES?: { fetch(request: Request): Promise<Response> };
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_ENDPOINT_URL_S3?: string;
  AWS_REGION?: string;
  AWS_S3_BUCKET?: string;
}

/**
 * Sends each request down the app's own connection to the storage service
 * rather than out to the network.
 *
 * This implements the shape the AWS SDK expects of a request handler: given its
 * internal request object, return `{ response }` with a status, headers and a
 * body stream. If a future SDK version changes that shape, this file is the one
 * to fix — everything in `storage.ts` keeps working regardless.
 */
function bindingRequestHandler(env: S3Env) {
  return {
    async handle(request: {
      method: string;
      protocol: string;
      hostname: string;
      port?: number;
      path: string;
      query?: Record<string, string | string[] | null>;
      headers: Record<string, string>;
      body?: unknown;
    }) {
      const url = new URL(
        `${request.protocol}//${request.hostname}${request.port ? `:${request.port}` : ""}${request.path}`,
      );
      for (const [name, value] of Object.entries(request.query ?? {})) {
        if (value === null || value === undefined) {
          url.searchParams.set(name, "");
        } else if (Array.isArray(value)) {
          for (const one of value) url.searchParams.append(name, one);
        } else {
          url.searchParams.set(name, value);
        }
      }

      if (!env.FILES) {
        throw new Error(
          "File storage is only reachable from the deployed app. Locally, use the helpers in storage.ts instead.",
        );
      }

      const response = await env.FILES.fetch(
        new Request(url.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body as BodyInit | undefined,
        }),
      );

      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name] = value;
      });

      return {
        response: {
          statusCode: response.status,
          reason: response.statusText,
          headers,
          body: response.body,
        },
      };
    },
    updateHttpClientConfig() {},
    httpHandlerConfigs() {
      return {};
    },
  };
}

/**
 * Configuration for `new S3Client(...)`.
 *
 * `forcePathStyle` is required: bucket-in-the-hostname addressing has nowhere
 * to go here, since the hostname is not a real one.
 */
export function s3ClientConfig(env: S3Env): Record<string, unknown> {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "Your app's storage credentials are missing. They are managed by SV Cloud — if you are seeing this on the deployed app, reconnect the project from your dashboard.",
    );
  }
  return {
    region: env.AWS_REGION ?? "auto",
    endpoint: env.AWS_ENDPOINT_URL_S3 ?? "https://files.svcloud.internal/s3",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    // See this file's header. Leave both of these alone.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: bindingRequestHandler(env),
  };
}

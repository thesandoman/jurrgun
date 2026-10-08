/**
 * Spatial queries - "is this GPS coordinate inside that area?"
 *
 * ---
 *
 * WHAT THIS IS FOR. One question, mostly: a point against a set of shapes.
 * Which planning zone is this address in, which delivery area covers this pin,
 * did this vehicle leave its territory. The database answers it directly, with
 * an index, so you never fetch polygons into your app and test them in
 * JavaScript - that reads the whole table and gets the edges wrong.
 *
 * Your database is CockroachDB, which has this built in. There is no extension
 * to install and nothing to switch on. `ST_Contains`, `ST_Intersects` and the
 * spatial index all work as they do in PostGIS.
 *
 * ---
 *
 * LONGITUDE COMES FIRST. Every function here takes `{ lng, lat }` as an object
 * for exactly one reason: the underlying SQL is `ST_Point(lng, lat)`, and a
 * positional pair is the mistake everybody makes once. Bangkok is roughly
 * `{ lng: 100.5, lat: 13.75 }`. Swapped, it is in Somalia, and nothing errors -
 * you simply get no matches, which looks like a data problem for an afternoon.
 *
 * SRID 4326 IS THE DEFAULT AND YOU ALMOST CERTAINLY WANT IT. That is plain
 * GPS degrees - what a phone, a map click, and a Google Maps URL all give you.
 * Every shape you compare must be in the same SRID, so store your zones in 4326
 * too and do not mix.
 *
 * USE `geometry`, NOT `geography`. They look interchangeable and are not:
 * **there is no `ST_Contains` for `geography`** (verified against the live
 * cluster - it answers `unknown signature: st_contains(geography, geography)`).
 * Geometry in 4326 is the right choice for "is this point in this zone".
 *
 * The trade is that distances in 4326 come out in DEGREES, not metres, so do
 * not use this for "within 5km" - degrees of longitude shrink as you leave the
 * equator. If you need real distances, cast to geography for that one call:
 * `sql`ST_Distance(${col}::geography, ${pointFrom(p)}::geography)`` returns
 * metres. Containment is unaffected; only measurement is.
 */
import { type SQL, sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/** Plain GPS degrees - the SRID your phone, your map and your users all speak. */
export const WGS84 = 4326;

/** A coordinate. Named fields, never a pair - see this file's header. */
export interface LngLat {
  lng: number;
  lat: number;
}

/**
 * The shape a geometry column holds. `polygon` for one area, `multipolygon` for
 * an area with islands or holes - a city district with an enclave is a
 * multipolygon, and storing it as `polygon` rejects the row on insert.
 */
export type GeometryKind =
  | "point"
  | "linestring"
  | "polygon"
  | "multipoint"
  | "multilinestring"
  | "multipolygon"
  | "geometry";

/**
 * What a geometry column gives you when you SELECT it directly: the database's
 * own binary format, as a hex string. It is not useful in JavaScript and not
 * something to send to a browser.
 *
 * This is a real consequence of `select()` with no column list - a `select
 * * from zones` hands your frontend a page of hex. Ask for `asGeoJson(...)`
 * instead, which is a shape a map library can draw.
 */
export type GeometryHex = string;

/**
 * A geometry column for your Drizzle schema.
 *
 *     export const zones = pgTable('zones', {
 *       id: text('id').primaryKey(),
 *       name: text('name').notNull(),
 *       area: geometry('area', { kind: 'multipolygon' }).notNull(),
 *     }, (t) => [
 *       // Without this every lookup reads every zone. See `containsPoint`.
 *       index('zones_area_idx').using('gist', t.area),
 *     ]);
 *
 * Then `npm run db:generate` and `npm run db:migrate` as with any other column.
 *
 * WHY THIS EXISTS RATHER THAN DRIZZLE'S OWN `geometry`. Drizzle ships one, and
 * it is points only: it writes `geometry(point)` into the migration whatever
 * you configure, drops the SRID, and throws `Unsupported geometry type` when it
 * reads back anything that is not a point. A zone polygon hits both halves of
 * that. This one writes the type you asked for, with its SRID.
 */
export const geometry = customType<{
  data: GeometryHex;
  driverData: string;
  config: { kind?: GeometryKind; srid?: number };
}>({
  dataType(config) {
    const kind = config?.kind ?? "geometry";
    const srid = config?.srid ?? WGS84;
    return `geometry(${kind},${srid})`;
  },
});

/**
 * A point, for comparing against stored shapes.
 *
 * Used on its own when you want the coordinate in a SELECT; `containsPoint`
 * calls it for you in the usual case.
 */
export function pointFrom(at: LngLat, srid: number = WGS84): SQL {
  assertLngLat(at);
  return sql`ST_SetSRID(ST_Point(${at.lng}, ${at.lat}), ${srid})`;
}

/**
 * A shape from GeoJSON - how you INSERT a zone.
 *
 *     await db.insert(zones).values({
 *       id: crypto.randomUUID(),
 *       name: 'Phra Nakhon',
 *       area: geomFromGeoJson(feature.geometry),
 *     });
 *
 * GeoJSON carries no SRID, so one is applied: 4326, matching the coordinates
 * GeoJSON is defined to contain. Pass a different one only if you know your
 * source is not in degrees.
 */
export function geomFromGeoJson(geojson: unknown, srid: number = WGS84): SQL {
  const text = typeof geojson === "string" ? geojson : JSON.stringify(geojson);
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${text}), ${srid})`;
}

/** A shape from WKT (`POLYGON((...))`), the other common export format. */
export function geomFromText(wkt: string, srid: number = WGS84): SQL {
  return sql`ST_GeomFromText(${wkt}, ${srid})`;
}

/**
 * Read a geometry column back as GeoJSON, already parsed - what you send to a
 * map library.
 *
 *     const rows = await db
 *       .select({ name: zones.name, area: asGeoJson(zones.area) })
 *       .from(zones)
 *       .limit(50);
 *
 * Note the explicit column list. Polygons are large; `select()` with no list
 * pulls every zone's full outline and will hit the platform's result-size cap
 * on a real dataset.
 */
export function asGeoJson<T = unknown>(column: SQL | unknown): SQL<T> {
  return sql`ST_AsGeoJSON(${column})`.mapWith(JSON.parse) as SQL<T>;
}

/**
 * Is this coordinate inside this shape? The whole point of the file.
 *
 *     const hits = await db
 *       .select({ id: zones.id, name: zones.name })
 *       .from(zones)
 *       .where(containsPoint(zones.area, { lng: 100.5018, lat: 13.7563 }))
 *       .limit(10);
 *
 * INDEX THE COLUMN or this reads every row - `index('zones_area_idx').using(
 * 'gist', t.area)` in your schema. With it, the database narrows to a handful
 * of candidate shapes and then tests those exactly, which is why the answer is
 * both fast and correct rather than approximate.
 *
 * A point exactly ON a zone's boundary is NOT contained - that is what
 * `ST_Contains` means, and it is the behaviour you want for zones that tile a
 * city, since a shared edge would otherwise match both neighbours. If you would
 * rather the edge counted, use `intersectsPoint`.
 */
export function containsPoint(
  column: SQL | unknown,
  at: LngLat,
  srid: number = WGS84,
): SQL<boolean> {
  return sql<boolean>`ST_Contains(${column}, ${pointFrom(at, srid)})`;
}

/** Like `containsPoint`, but a point on the boundary counts as a match. */
export function intersectsPoint(
  column: SQL | unknown,
  at: LngLat,
  srid: number = WGS84,
): SQL<boolean> {
  return sql<boolean>`ST_Intersects(${column}, ${pointFrom(at, srid)})`;
}

/** Does this stored shape contain that other shape? Both must share an SRID. */
export function contains(column: SQL | unknown, other: SQL): SQL<boolean> {
  return sql<boolean>`ST_Contains(${column}, ${other})`;
}

/** Do these two shapes overlap at all? Index-accelerated, like `contains`. */
export function intersects(column: SQL | unknown, other: SQL): SQL<boolean> {
  return sql<boolean>`ST_Intersects(${column}, ${other})`;
}

/**
 * Coordinates arriving from a request are the usual source of a silent
 * no-match, so they are checked once here rather than in every route.
 *
 * The latitude range is the tell: a value above 90 is almost always a longitude
 * in the latitude slot.
 */
function assertLngLat(at: LngLat): void {
  if (typeof at?.lng !== "number" || Number.isNaN(at.lng)) {
    throw new Error("lng must be a number, in degrees. Bangkok is about lng 100.5, lat 13.75.");
  }
  if (typeof at?.lat !== "number" || Number.isNaN(at.lat)) {
    throw new Error("lat must be a number, in degrees. Bangkok is about lng 100.5, lat 13.75.");
  }
  if (at.lng < -180 || at.lng > 180) {
    throw new Error(`lng ${at.lng} is outside -180..180 degrees.`);
  }
  if (at.lat < -90 || at.lat > 90) {
    throw new Error(
      `lat ${at.lat} is outside -90..90 degrees. If that number is a longitude, the pair is the wrong way round - this takes { lng, lat }.`,
    );
  }
}

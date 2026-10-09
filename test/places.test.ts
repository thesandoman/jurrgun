/** Where events sit on the Discover map: map links, route starts, district areas. */
import { describe, expect, it } from "vitest";
import { DISTRICTS, VISITBANGKOK_ROUTES, values } from "../src/lib/constants";
import { DISTRICT_CENTERS, ROUTE_STARTS, coordsFromMapUrl, eventPlace, inBangkok } from "../src/lib/places";

describe("coordsFromMapUrl", () => {
  it("reads the shapes people paste", () => {
    expect(coordsFromMapUrl("https://www.google.com/maps/place/Lumphini+Park/@13.7314,100.5414,17z")).toEqual({ lat: 13.7314, lng: 100.5414 });
    expect(coordsFromMapUrl("https://www.google.com/maps/place/X/@13.70,100.50,15z/data=!3m1!4b1!4m6!3m5!3d13.7314!4d100.5414")).toEqual({ lat: 13.7314, lng: 100.5414 });
    expect(coordsFromMapUrl("https://maps.google.com/?q=13.7563,100.5018")).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(coordsFromMapUrl("https://www.google.com/maps/dir/?api=1&destination=13.74,100.49")).toEqual({ lat: 13.74, lng: 100.49 });
    expect(coordsFromMapUrl("https://www.openstreetmap.org/?mlat=13.7465&mlon=100.5348#map=17/13.7465/100.5348")).toEqual({ lat: 13.7465, lng: 100.5348 });
    expect(coordsFromMapUrl("https://www.openstreetmap.org/#map=16/13.7465/100.5348")).toEqual({ lat: 13.7465, lng: 100.5348 });
    expect(coordsFromMapUrl("https://maps.apple.com/?ll=13.7465,100.5348&q=Siam")).toEqual({ lat: 13.7465, lng: 100.5348 });
  });
  it("ignores links without coordinates, outside Bangkok, or not URLs", () => {
    expect(coordsFromMapUrl("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(coordsFromMapUrl("https://www.google.com/maps/@18.7883,98.9853,14z")).toBeNull(); // Chiang Mai
    expect(coordsFromMapUrl("not a url")).toBeNull();
    expect(coordsFromMapUrl(null)).toBeNull();
  });
});

describe("eventPlace", () => {
  it("prefers the map link, then the route start, then the district area", () => {
    const link = "https://maps.google.com/?q=13.7314,100.5414";
    expect(eventPlace({ mapUrl: link, district: "pathum_wan", visitBangkokRoute: "yaowarat" })).toMatchObject({ precision: "exact", lat: 13.7314 });
    expect(eventPlace({ mapUrl: null, district: "samphanthawong", visitBangkokRoute: "yaowarat" })).toMatchObject({ precision: "route" });
    expect(eventPlace({ mapUrl: null, district: "phasi_charoen", visitBangkokRoute: "bang_luang" })).toMatchObject({ precision: "area" });
    expect(eventPlace({ mapUrl: null, district: "pathum_wan", visitBangkokRoute: null })).toMatchObject({ precision: "area" });
  });
  it("gives no point rather than a guessed one", () => {
    expect(eventPlace({ mapUrl: null, district: "wang_thonglang", visitBangkokRoute: null })).toBeNull();
    expect(eventPlace({ mapUrl: null, district: "not_a_district", visitBangkokRoute: null })).toBeNull();
  });
});

describe("place tables", () => {
  it("cover every district and route, all inside Bangkok", () => {
    expect(Object.keys(DISTRICT_CENTERS).sort()).toEqual(values(DISTRICTS).sort());
    expect(Object.keys(ROUTE_STARTS).sort()).toEqual(values(VISITBANGKOK_ROUTES).sort());
    for (const p of [...Object.values(DISTRICT_CENTERS), ...Object.values(ROUTE_STARTS)]) if (p) expect(inBangkok(p[0], p[1])).toBe(true);
  });
});

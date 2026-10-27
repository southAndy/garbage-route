import { expect, it, vi } from "vitest";
vi.mock("@/lib/repository", () => ({ findNearby: vi.fn(() => ({ routes: [] })) }));
import { findNearby } from "@/lib/repository";
import { POST } from "./route";

it("uses the confirmed reference point without the device-location rounding", async () => {
  const point = { lat: 24.998765, lng: 121.512345 };
  const response = await POST(new Request("http://localhost/api/v1/reference-nearby", { method: "POST", body: JSON.stringify(point) }));
  expect(response.status).toBe(200);
  expect(findNearby).toHaveBeenCalledWith(point);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("rejects malformed and out-of-region points", async () => {
  const response = await POST(new Request("http://localhost/api/v1/reference-nearby", { method: "POST", body: JSON.stringify({ lat: 0, lng: 0 }) }));
  expect(response.status).toBe(400);
});

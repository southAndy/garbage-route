import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
beforeEach(() => { vi.resetModules(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });
const request = (query: string) => new Request("http://localhost/api/v1/places", { method: "POST", body: JSON.stringify({ query, area: "新北市中和區" }) });
describe("place search endpoint", () => {
  it("rejects invalid input without an external request", async () => {
    const { POST } = await import("./route");
    expect((await POST(request(""))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds the query and reuses results for identical submissions", async () => {
    fetchMock.mockResolvedValue(Response.json({ features: [] }));
    const { POST } = await import("./route");
    expect((await POST(request("景新街293號"))).status).toBe(200);
    expect((await POST(request("景新街293號"))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("q")).toBe("新北市中和區 景新街293號");
    expect(url.searchParams.has("bbox")).toBe(true);
    expect((await POST(request("其他地址"))).status).toBe(429);
  });
  it("returns a recoverable error for upstream failures", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { POST } = await import("./route");
    const response = await POST(request("景新街"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("在地圖選點");
  });
});

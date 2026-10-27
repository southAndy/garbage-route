// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MapAreaSearch from "./map-area-search";
import { track } from "@vercel/analytics";
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.mocked(track).mockReset(); });
it("submits the selected district and focuses only after a successful explicit search", async () => {
  const data = { query: "景新街", count: 12, bounds: [[121.5, 24.99], [121.51, 25]] };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) });
  vi.stubGlobal("fetch", fetchMock);
  const onArea = vi.fn();
  render(<MapAreaSearch city="NTP" district="中和區" initialQuery="景新街293號" disabled={false} onArea={onArea} />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "縮小範圍" }));
  await waitFor(() => expect(onArea).toHaveBeenCalledWith(data));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ city: "NTP", district: "中和區", query: "景新街293號" });
  expect(screen.getByRole("status").textContent).toContain("這不是門牌定位");
  expect(track).toHaveBeenCalledWith("map_area_search_clicked", {});
  expect(track).toHaveBeenCalledWith("map_area_search_result", { status: "success" });
});

it("leaves the map unchanged on no results", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) }));
  const onArea = vi.fn();
  render(<MapAreaSearch city="NTP" district="中和區" initialQuery="不存在" disabled={false} onArea={onArea} />);
  fireEvent.click(screen.getByRole("button", { name: "縮小範圍" }));
  expect((await screen.findByRole("status")).textContent).toContain("沒有符合");
  expect(onArea).not.toHaveBeenCalled();
  expect(track).toHaveBeenCalledWith("map_area_search_result", { status: "empty" });
});

it("ignores a late response after the keyword changes", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
  const onArea = vi.fn();
  render(<MapAreaSearch city="NTP" district="中和區" initialQuery="景新街" disabled={false} onArea={onArea} />);
  fireEvent.click(screen.getByRole("button", { name: "縮小範圍" }));
  fireEvent.change(screen.getByLabelText(/用關鍵字/), { target: { value: "景平路" } });
  finish({ ok: true, json: async () => ({ data: { query: "景新街" } }) });
  await waitFor(() => expect(screen.getByRole("button", { name: "縮小範圍" }).hasAttribute("disabled")).toBe(false));
  expect(onArea).not.toHaveBeenCalled();
  expect(track).not.toHaveBeenCalledWith("map_area_search_result", expect.anything());
});

it("records request failures without sending error messages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("server error with private data")));
  render(<MapAreaSearch city="NTP" district="中和區" initialQuery="景新街" disabled={false} onArea={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "縮小範圍" }));
  await screen.findByRole("status");
  expect(track).toHaveBeenLastCalledWith("map_area_search_result", { status: "error" });
});

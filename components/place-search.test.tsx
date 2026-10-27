// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PlaceSearch from "./place-search";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("searches only on demand and lets the user select a candidate", async () => {
  const candidate = { label: "景新街", lat: 24.99, lng: 121.51, approximate: true };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [candidate] }) });
  vi.stubGlobal("fetch", fetchMock);
  const onPick = vi.fn();
  const { rerender } = render(<PlaceSearch query="景新街293號" area="中和區" onPick={onPick} />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("查地址位置"));
  fireEvent.click(await screen.findByRole("button", { name: /景新街.*概略位置/ }));
  expect(onPick).toHaveBeenCalledWith(candidate);
  rerender(<PlaceSearch query="永平路" area="永和區" onPick={onPick} />);
  expect(screen.queryByText("概略位置，請移動地圖確認門牌")).toBeNull();
});

it("ignores a stale response when the query changes", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
  const props = { area: "中和區", onPick: vi.fn() };
  const { rerender } = render(<PlaceSearch query="景新街" {...props} />);
  fireEvent.click(screen.getByText("查地址位置"));
  rerender(<PlaceSearch query="其他地址" {...props} />);
  resolve({ ok: true, json: async () => ({ data: [{ label: "舊結果", lat: 25, lng: 121.5 }] }) });
  await waitFor(() => expect(screen.getByText("查地址位置").hasAttribute("disabled")).toBe(false));
  expect(screen.queryByText("舊結果")).toBeNull();
});

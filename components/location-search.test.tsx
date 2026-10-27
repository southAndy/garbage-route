// @vitest-environment jsdom
import { createRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LocationSearch from "./location-search";
const items = [
  { city: "NTP", district: "中和區", name: "景新路", query: "景新路" },
  { city: "NTP", district: "板橋區", name: "景新路", query: "景新路" },
];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Harness({ onSelect = vi.fn() }) {
  const [query, setQuery] = useState("");
  return <LocationSearch query={query} onQuery={setQuery} onSelect={onSelect} inputRef={createRef()} />;
}
it("searches without an area and selects the explicit district with the keyboard", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: items }) });
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = vi.fn(); render(<Harness onSelect={onSelect} />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "景新路" } });
  await screen.findByRole("option", { name: "新北市・板橋區・景新路" });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: "景新路" });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "ArrowDown" }); fireEvent.keyDown(input, { key: "Enter" });
  expect(onSelect).toHaveBeenCalledWith(items[1]);
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("ignores late responses for a previous query", async () => {
  let finish!: (response: unknown) => void;
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  vi.stubGlobal("fetch", fetchMock); render(<Harness />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "景新" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "不存在" } });
  finish({ ok: true, json: async () => ({ data: items }) });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("沒有相符"));
  expect(screen.queryByRole("option")).toBeNull();
});

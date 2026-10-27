// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import CollectionEntryLink from "./collection-entry-link";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
let intersect: (entries: Partial<IntersectionObserverEntry>[]) => void;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

const stop = (event: React.MouseEvent) => event.preventDefault();

it("只在至少一半可見時記錄一次曝光，重複點擊保留次數", () => {
  const onClick = vi.fn(stop);
  render(<CollectionEntryLink source="route_list" onClick={onClick}>錯過垃圾車？</CollectionEntryLink>);
  const link = screen.getByRole("link", { name: "錯過垃圾車？" });
  expect(link.getAttribute("href")).toBe("/collection-points");
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.1 }]));
  expect(track).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  expect(track).toHaveBeenCalledTimes(1);
  fireEvent.click(link);
  fireEvent.click(link);
  expect(vi.mocked(track).mock.calls).toEqual([
    ["collection_entry_viewed", { source: "route_list" }],
    ["collection_entry_clicked", { source: "route_list" }],
    ["collection_entry_clicked", { source: "route_list" }],
  ]);
  expect(onClick).toHaveBeenCalledTimes(2);
});

it("點擊早於曝光回呼時補記曝光，追蹤失敗不影響連結，卸載後停止觀察", () => {
  vi.mocked(track).mockImplementation(() => { throw new Error("unavailable"); });
  const onClick = vi.fn(stop);
  const view = render(<CollectionEntryLink source="route_list" onClick={onClick}>入口</CollectionEntryLink>);
  fireEvent.click(screen.getByRole("link"));
  expect(track).toHaveBeenNthCalledWith(1, "collection_entry_viewed", { source: "route_list" });
  expect(track).toHaveBeenNthCalledWith(2, "collection_entry_clicked", { source: "route_list" });
  expect(onClick).toHaveBeenCalledOnce();
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});

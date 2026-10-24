import { afterEach, describe, expect, it } from "vitest";
import { clearListScroll, readListScroll, saveListScroll } from "./list-scroll";

afterEach(clearListScroll);

describe("list scroll store", () => {
  it("依結果集 key 記住與讀回捲動位置，沒有紀錄時為 null", () => {
    saveListScroll("TPE|士林區||list", { panel: 120, list: 1500 });
    expect(readListScroll("TPE|士林區||list")).toEqual({ panel: 120, list: 1500 });
    expect(readListScroll("TPE|士林區|忠孝|list")).toBeNull();
    saveListScroll("TPE|士林區||list", { panel: 0, list: 40 });
    expect(readListScroll("TPE|士林區||list")).toEqual({ panel: 0, list: 40 });
  });
});

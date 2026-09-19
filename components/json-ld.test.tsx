// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import JsonLd from "./json-ld";
import Breadcrumb from "./breadcrumb";
import { siteUrl } from "../lib/site-url";

function parseMarkup(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  return { container, data: JSON.parse(script!.textContent!) };
}

describe("JSON-LD", () => {
  it("保留中文及特殊字元，且惡意內容無法結束 script 或注入 HTML", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: '清運地圖 "測試" & </script><img src=x onerror=alert(1)><script>\u2028\u2029',
      url: "https://example.com/",
    };
    const { container, data: parsed } = parseMarkup(renderToStaticMarkup(<JsonLd data={data} />));
    expect(parsed).toEqual(data);
    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
    expect(container.children).toHaveLength(1);
  });

  it("麵包屑標記與畫面層級一致，並使用完整網址", () => {
    const items = [
      { label: "首頁", href: "/" },
      { label: "新北市", href: "/routes/ntp" },
      { label: "板橋區", href: "/routes/ntp/banqiao" },
      { label: '測試路線 </script><img src=x>' },
    ];
    const { container, data } = parseMarkup(renderToStaticMarkup(<Breadcrumb items={items} />));
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement.map((item: { name: string }) => item.name)).toEqual(
      Array.from(container.querySelectorAll("ol li"), (item) => item.textContent),
    );
    expect(data.itemListElement.map((item: { position: number }) => item.position)).toEqual([1, 2, 3, 4]);
    expect(data.itemListElement[0].item).toBe(`${siteUrl}/`);
    expect(data.itemListElement[2].item).toBe(`${siteUrl}/routes/ntp/banqiao`);
    expect(data.itemListElement[3]).not.toHaveProperty("item");
    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
  });
});

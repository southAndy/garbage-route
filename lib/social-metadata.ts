import type { Metadata } from "next";

export function socialMetadata(title: string, description: string, url: string): Pick<Metadata, "openGraph" | "twitter"> {
  const image = {
    url: "/og-image.png",
    width: 1730,
    height: 909,
    alt: "清運地圖：垃圾車、地圖路線與停靠點插畫",
  };

  return {
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: "清運地圖",
      url,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

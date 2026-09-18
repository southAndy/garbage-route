import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { isIndexable, siteUrl } from "@/lib/site-url";
import "./globals.css";

const sans = Noto_Sans_TC({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });
const serif = Noto_Serif_TC({ subsets: ["latin"], weight: ["700", "900"], display: "swap", variable: "--font-serif" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "清運地圖｜雙北垃圾車表定路線",
    template: "%s｜清運地圖",
  },
  description: "查詢臺北市、新北市垃圾車表定路線、停靠點與時間。",
  robots: isIndexable ? undefined : { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}

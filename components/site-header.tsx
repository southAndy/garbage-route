import Link from "next/link";
import Image from "next/image";
import FeedbackButton from "./feedback-button";

export default function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand" aria-label="清運地圖首頁"><Image src="/favicon.png" alt="" width={40} height={40} unoptimized loading="eager" className="brand-mark" /><span><strong>清運地圖</strong><small>雙北表定垃圾車路線</small></span></Link>
      <div className="header-actions">{children ?? <div className="header-note"><span className="status-dot" />非即時位置<span className="desktop-only">・依官方停靠順序繪製</span></div>}<FeedbackButton /></div>
    </header>
  );
}

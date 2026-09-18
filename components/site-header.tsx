import Link from "next/link";

export default function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand" aria-label="清運地圖首頁"><span className="brand-mark">清</span><span><strong>清運地圖</strong><small>雙北表定垃圾車路線</small></span></Link>
      {children ?? <div className="header-note"><span className="status-dot" />非即時位置<span className="desktop-only">・依官方停靠順序繪製</span></div>}
    </header>
  );
}

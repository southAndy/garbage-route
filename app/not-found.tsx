import Link from "next/link";

export default function NotFound() {
  return <main className="standalone"><p className="eyebrow">404</p><h1>這條路線找不到了</h1><p>路線可能已更新或分享網址不完整。</p><Link className="primary-button" href="/">回到路線地圖</Link></main>;
}

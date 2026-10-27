"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

export type CollectionEntrySource = "route_list";

type Props = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & { source: CollectionEntrySource };

/** Link to the collection-points page that records its exposure and clicks so a click rate can be derived. */
export default function CollectionEntryLink({ source, onClick, ...props }: Props) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const viewed = useRef(false);

  useEffect(() => {
    const link = linkRef.current;
    if (!link || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (viewed.current || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      viewed.current = true;
      try { track("collection_entry_viewed", { source }); } catch { /* Tracking is optional. */ }
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(link);
    return () => observer.disconnect();
  }, [source]);

  function record(event: string) {
    // Navigation must never depend on analytics being available.
    try { track(event, { source }); } catch { /* Tracking is optional. */ }
  }

  return <Link {...props} ref={linkRef} href="/collection-points" onClick={(event) => {
    // A click can arrive before the observer callback; keep the denominator complete.
    if (!viewed.current) {
      viewed.current = true;
      record("collection_entry_viewed");
    }
    record("collection_entry_clicked");
    onClick?.(event);
  }} />;
}

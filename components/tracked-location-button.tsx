"use client";

import { track } from "@vercel/analytics";
import { useEffect, useImperativeHandle, useRef, type ComponentPropsWithRef } from "react";

type Props = ComponentPropsWithRef<"button"> & {
  source: "route_search" | "district_search" | "map" | "map_retry";
};

export default function TrackedLocationButton({ source, ref, onClick, ...props }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const viewed = useRef(false);
  useImperativeHandle(ref, () => buttonRef.current!);

  function record(event: string) {
    // Analytics must never prevent location access if tracking fails.
    try { track(event, { source }); } catch { /* Keep the button functional. */ }
  }

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (viewed.current || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      viewed.current = true;
      try { track("location_button_viewed", { source }); } catch { /* Tracking is optional. */ }
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(button);
    return () => observer.disconnect();
  }, [source]);

  return <button {...props} ref={buttonRef} onClick={(event) => {
    // A click can arrive before the observer callback; keep the denominator complete.
    if (!viewed.current) {
      viewed.current = true;
      record("location_button_viewed");
    }
    record("location_button_clicked");
    onClick?.(event);
  }} />;
}

"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Reads ?q= on the client so statically generated route pages can still honour shared search links.
export default function SearchParamQuery({ onQuery }: { onQuery: (query: string) => void }) {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  useEffect(() => {
    if (query) onQuery(query);
  }, [query, onQuery]);
  return null;
}

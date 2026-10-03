export type FeedbackContext = {
  entry: "general" | "stop" | "empty_search" | "stop_outcome";
  outcome?: "found" | "not_found";
  city?: string;
  district?: string;
  route_id?: string;
  stop_id?: string;
  source_synced_at?: string;
  query?: string;
};

export function feedbackUrls(formUrl: string | undefined, context: FeedbackContext) {
  if (!formUrl) return null;
  try {
    const url = new URL(formUrl);
    const match = url.pathname.match(/^\/(?:r|embed)\/([a-zA-Z0-9]+)\/?$/);
    if (url.protocol !== "https:" || url.host !== "tally.so" || !match || url.username || url.password) return null;
    const share = new URL(`https://tally.so/r/${match[1]}`);
    for (const [key, value] of Object.entries(context)) {
      if (value) share.searchParams.set(key, value);
    }
    const embed = new URL(share);
    embed.pathname = `/embed/${match[1]}`;
    embed.searchParams.set("transparentBackground", "1");
    return { share: share.toString(), embed: embed.toString() };
  } catch {
    return null;
  }
}

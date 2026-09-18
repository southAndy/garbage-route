function resolveSiteUrl() {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) return `https://${vercelProduction}`;
  const vercelPreview = process.env.VERCEL_URL;
  if (vercelPreview) return `https://${vercelPreview}`;
  return "http://localhost:3000";
}

export const siteUrl = resolveSiteUrl();

// Preview and development deployments on Vercel must never be indexed as duplicates of the production site.
export const isIndexable = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";

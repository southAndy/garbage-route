/** Where an ad unit may appear. Each id is also the `slot` value on `ad_slot_viewed` events. */
export type AdSlotId = "route_stops" | "district_list" | "collection_points";

/**
 * `off` renders nothing. `placeholder` draws a fixed-size frame to judge layout locally. `measure`
 * renders an invisible, zero-height sentinel so production can record how many visitors reach each
 * position without showing anything. Both non-off modes send `ad_slot_viewed`.
 */
export type AdsMode = "off" | "placeholder" | "measure";

export function readAdsMode(value: string | undefined): AdsMode {
  const mode = value?.trim().toLowerCase();
  return mode === "placeholder" || mode === "measure" ? mode : "off";
}

/** The literal env reference lets Next.js inline the value into the client bundle. */
export function getAdsMode(): AdsMode {
  return readAdsMode(process.env.NEXT_PUBLIC_ADS_MODE);
}

/** Fixed frame sizes (standard IAB units) so the slot never shifts layout once a real ad loads. */
export const AD_SLOT_SIZES = {
  mobile: { width: 320, height: 100 },
  desktop: { width: 728, height: 90 },
} as const;

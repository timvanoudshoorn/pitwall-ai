/**
 * lapsAndCorners.ts — visual's own supplement to data/tracks.json.
 *
 * data's tracks.json covers LiDAR/reverse-layout/pit-loss/safety-car
 * facts but not lap distance or corner count, which the UI needs (race
 * distance display, track schematic complexity). These are widely-known
 * public figures (circuit length + typical F1 race lap count), not
 * sourced/cited to data's confidence standard — flagged here rather than
 * silently treated as equally authoritative. Message data if a track is
 * missing; screens filter to only tracks present in this map.
 */
export const TRACK_LAPS_CORNERS: Record<string, { lengthKm: number; laps: number; corners: number }> = {
  albert_park: { lengthKm: 5.278, laps: 58, corners: 14 },
  suzuka: { lengthKm: 5.807, laps: 53, corners: 18 },
  bahrain: { lengthKm: 5.412, laps: 57, corners: 15 },
  jeddah: { lengthKm: 6.174, laps: 50, corners: 27 },
  miami: { lengthKm: 5.412, laps: 57, corners: 19 },
  imola: { lengthKm: 4.909, laps: 63, corners: 19 },
  monaco: { lengthKm: 3.337, laps: 78, corners: 19 },
  barcelona: { lengthKm: 4.657, laps: 66, corners: 16 },
  montreal: { lengthKm: 4.361, laps: 70, corners: 14 },
  red_bull_ring: { lengthKm: 4.318, laps: 71, corners: 10 },
  silverstone: { lengthKm: 5.891, laps: 52, corners: 18 },
  spa: { lengthKm: 7.004, laps: 44, corners: 19 },
  hungaroring: { lengthKm: 4.381, laps: 70, corners: 14 },
  zandvoort: { lengthKm: 4.259, laps: 72, corners: 14 },
  monza: { lengthKm: 5.793, laps: 53, corners: 11 },
  baku: { lengthKm: 6.003, laps: 51, corners: 20 },
  singapore: { lengthKm: 4.94, laps: 62, corners: 19 },
  cota: { lengthKm: 5.513, laps: 56, corners: 20 },
  mexico_city: { lengthKm: 4.304, laps: 71, corners: 17 },
  interlagos: { lengthKm: 4.309, laps: 71, corners: 15 },
  las_vegas: { lengthKm: 6.201, laps: 50, corners: 17 },
  lusail: { lengthKm: 5.38, laps: 57, corners: 16 },
  yas_marina: { lengthKm: 5.281, laps: 58, corners: 16 },
};

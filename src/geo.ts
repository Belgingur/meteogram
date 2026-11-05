/**
 * Great-circle distance in km (equirectangular approximation).
 *
 * Accurate to a fraction of a percent over the few hundred km that matter for
 * "which station is nearest", and far cheaper than haversine. Replaces a fixed
 * 0.2 weight on the longitude term — a cos²(lat) approximation hard-coded for
 * Iceland (cos²64° ≈ 0.19). Nearer the equator the true factor approaches 1, so
 * longitude counted for a fraction of what it should and the "nearest" ordering
 * came out scrambled for every domain outside the North Atlantic.
 */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = Math.PI / 180;
  const meanLat = ((aLat + bLat) / 2) * toRad;
  const dLat = (bLat - aLat) * toRad;
  let dLon = (bLon - aLon) * toRad;
  // Take the short way round the antimeridian.
  if (dLon > Math.PI) dLon -= 2 * Math.PI;
  if (dLon < -Math.PI) dLon += 2 * Math.PI;
  const x = dLon * Math.cos(meanLat);
  return Math.hypot(x, dLat) * 6371;
}

// Intégration OpenCV optionnelle: chargement paresseux sans await au top-level.
// Le service reste fonctionnel si opencv4nodejs n’est pas disponible.
let cvPromise: Promise<any> | null = null;
function getCV(): Promise<any | null> {
  if (!cvPromise) {
    cvPromise = import('opencv4nodejs')
      .then((mod: any) => mod?.default ?? mod)
      .catch(() => null);
  }
  return cvPromise;
}

export async function opencvBlurMetric(buffer: Buffer): Promise<number | null> {
  const cv = await getCV();
  if (!cv) return null;
  try {
    const mat = cv.imdecode(buffer);
    const gray = mat.bgrToGray();
    const lap = gray.laplace(3);
    const meanStd = lap.meanStdDev();
    const variance = Math.pow(meanStd.stddev.at(0, 0), 2);
    return variance;
  } catch {
    return null;
  }
}
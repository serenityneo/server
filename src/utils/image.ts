import sharp from 'sharp';

export type ImageStats = {
  width: number;
  height: number;
  brightness: number; // mean luminance
  contrast: number; // stdev of luminance
  blur: number; // Laplacian variance
  backgroundStdDev: number; // stdev across background mask (simple approx)
  rMean: number; // mean red
  gMean: number; // mean green
  bMean: number; // mean blue
  rgbBalanceDelta: number; // max(|r-g|, |g-b|, |r-b|)
};

export async function computeImageStats(buffer: Uint8Array): Promise<ImageStats> {
  // Compute grayscale metrics
  const grayImg = sharp(buffer as any).removeAlpha().greyscale();
  const meta = await grayImg.metadata();
  const { width = 0, height = 0 } = meta;
  const grayData = await grayImg.raw().toBuffer({ resolveWithObject: true });
  const grayPixels = new Uint8Array((grayData as any).data); // 1 channel grayscale
  const n = grayPixels.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += grayPixels[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = grayPixels[i] - mean;
    varSum += d * d;
  }
  const stdev = Math.sqrt(varSum / n);

  // Simple blur metric using Laplacian variance approximation
  const blur = await estimateBlurVariance(buffer);

  // Background uniformity: estimate stdev on border pixels
  const borderMaskStdev = computeBorderStdev(grayPixels, width, height);

  // Compute RGB channel means for balance assessment
  const rgbImg = sharp(buffer as any).removeAlpha();
  const { data, info } = await rgbImg.raw().toBuffer({ resolveWithObject: true });
  const channels = (info as any).channels || 3;
  const arr = new Uint8Array((data as any));
  let rSum = 0, gSum = 0, bSum = 0;
  // If image has 3 channels (RGB), compute channel-wise means
  if (channels >= 3) {
    for (let i = 0; i < arr.length; i += channels) {
      rSum += arr[i];
      gSum += arr[i + 1];
      bSum += arr[i + 2];
    }
  }
  const pxCount = Math.floor(arr.length / channels) || 1;
  const rMean = channels >= 3 ? rSum / pxCount : mean;
  const gMean = channels >= 3 ? gSum / pxCount : mean;
  const bMean = channels >= 3 ? bSum / pxCount : mean;
  const rgbBalanceDelta = Math.max(Math.abs(rMean - gMean), Math.abs(gMean - bMean), Math.abs(rMean - bMean));

  return {
    width,
    height,
    brightness: mean,
    contrast: stdev,
    blur,
    backgroundStdDev: borderMaskStdev,
    rMean,
    gMean,
    bMean,
    rgbBalanceDelta
  };
}

async function estimateBlurVariance(buffer: Uint8Array): Promise<number> {
  const img = sharp(buffer as any).removeAlpha().greyscale();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info as any;
  const buf = new Uint8Array((data as any));
  const lap = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  let sum = 0;
  let sumSq = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const v = laplacian(buf, width, idx, lap);
      sum += v;
      sumSq += v * v;
    }
  }
  const n = (width - 2) * (height - 2);
  const mean = sum / n;
  const var_ = sumSq / n - mean * mean;
  return var_;
}

function laplacian(data: Uint8Array, width: number, idx: number, k: number[]) {
  // 3x3 convolution centered at idx
  const y = Math.floor(idx / width);
  const x = idx % width;
  let acc = 0;
  let ki = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ii = (y + dy) * width + (x + dx);
      acc += data[ii] * k[ki++];
    }
  }
  return acc;
}

function computeBorderStdev(pixels: Uint8Array, width: number, height: number) {
  const sample: number[] = [];
  for (let x = 0; x < width; x++) {
    sample.push(pixels[x]); // top
    sample.push(pixels[(height - 1) * width + x]); // bottom
  }
  for (let y = 0; y < height; y++) {
    sample.push(pixels[y * width]); // left
    sample.push(pixels[y * width + (width - 1)]); // right
  }
  const n = sample.length;
  const mean = sample.reduce((a, b) => a + b, 0) / n;
  const var_ = sample.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return Math.sqrt(var_);
}
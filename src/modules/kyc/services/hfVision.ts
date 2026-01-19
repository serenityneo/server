export type HfVisionResult = {
  ok: boolean;
  messages: string[];
  stats?: { topLabel?: string; topScore?: number; model?: string };
};

const DEFAULT_MODEL = process.env.HF_VISION_MODEL || 'microsoft/dit-base-finetuned-rvlcdip';

/**
 * Calls Hugging Face Inference API for image classification on a document model.
 * Returns whether the image appears to be a real document and basic stats.
 * Fails gracefully if token or API is unavailable.
 */
export async function scoreDocumentRealness(buffer: Buffer): Promise<HfVisionResult> {
  const token = process.env.HUGGING_FACE_API_TOKEN;
  if (!token) {
    return { ok: true, messages: ['hf vision skipped: missing token'], stats: { model: DEFAULT_MODEL } };
  }
  const gf: typeof globalThis.fetch | undefined = (globalThis as any).fetch;
  if (!gf) {
    return { ok: true, messages: ['hf vision skipped: fetch unavailable'], stats: { model: DEFAULT_MODEL } };
  }
  try {
    // Utiliser Uint8Array (ArrayBufferView) pour respecter BodyInit sans conflit SharedArrayBuffer
    const body = new Uint8Array(buffer);
    const resp = await gf(`https://api-inference.huggingface.co/models/${DEFAULT_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      },
      body
    });
    if (!resp.ok) {
      return { ok: true, messages: [`hf vision error: ${resp.status}`], stats: { model: DEFAULT_MODEL } };
    }
    const data = await resp.json();
    // Expected array of {label, score}
    const arr = Array.isArray(data) ? data : [];
    const top = arr[0] || {};
    const label: string | undefined = top.label;
    const score: number | undefined = top.score;
    const ok = typeof score === 'number' ? score >= 0.6 : true;
    const messages: string[] = [];
    if (!ok) messages.push('Image semble non-document selon modèle HF');
    return { ok, messages, stats: { topLabel: label, topScore: score, model: DEFAULT_MODEL } };
  } catch (e: any) {
    return { ok: true, messages: ['hf vision exception: ' + (e?.message || 'unknown')], stats: { model: DEFAULT_MODEL } };
  }
}

const OBJ_DETECTION_MODEL = process.env.HF_OBJ_DETECTION_MODEL || 'facebook/detr-resnet-50';

export type DetectedObject = {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
};

export async function detectObjects(buffer: Buffer): Promise<{ ok: boolean; objects: DetectedObject[]; messages: string[] }> {
  const token = process.env.HUGGING_FACE_API_TOKEN;
  if (!token) {
    return { ok: true, objects: [], messages: ['hf obj detection skipped: missing token'] };
  }
  const gf: typeof globalThis.fetch | undefined = (globalThis as any).fetch;
  if (!gf) {
    return { ok: true, objects: [], messages: ['hf obj detection skipped: fetch unavailable'] };
  }

  try {
    const body = new Uint8Array(buffer);
    const resp = await gf(`https://api-inference.huggingface.co/models/${OBJ_DETECTION_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      },
      body
    });

    if (!resp.ok) {
      return { ok: false, objects: [], messages: [`hf obj detection error: ${resp.status}`] };
    }

    const data = await resp.json();
    const objects = Array.isArray(data) ? data : [];
    return { ok: true, objects, messages: [] };
  } catch (e: any) {
    return { ok: false, objects: [], messages: ['hf obj detection exception: ' + (e?.message || 'unknown')] };
  }
}
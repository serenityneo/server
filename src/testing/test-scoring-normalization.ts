import { computeScore, finalizeStatus, ValidationReport } from '../modules/kyc/services/scoring';

function expect(cond: boolean, msg: string) {
  if (!cond) {
    console.error('Test failed:', msg);
    process.exitCode = 1;
  }
}

async function testPartialChecksNormalized() {
  const report: ValidationReport = {
    photo: { ok: true, messages: [] },
    face: { ok: false, messages: ['Détection faciale temporairement indisponible'] },
    score: 0,
    status: 'failed'
  } as any;
  const score = computeScore(report);
  const status = finalizeStatus({ ...report, score });
  console.log('[testPartialChecksNormalized]', { score, status });
  expect(score >= 60, 'Score should be normalized to at least 60 with partial face');
  expect(status !== 'failed', 'Status should not be failed for partial checks');
}

async function run() {
  await testPartialChecksNormalized();
  if (process.exitCode && process.exitCode !== 0) {
    console.error('Some tests failed.');
    process.exit(process.exitCode);
  } else {
    console.log('Scoring normalization tests passed.');
  }
}

run();
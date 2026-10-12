const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { SilenceDetector } = require('../engine/silenceDetector');

test('SilenceDetector: Probing and detecting silence on real video file (tutorial.mp4)', async (t) => {
  const tutorialPath = 'C:\\Program Files\\Recut\\tutorial.mp4';
  
  if (!fs.existsSync(tutorialPath)) {
    t.skip('Local tutorial.mp4 not present in this environment, skipping hardware test');
    return;
  }

  const detector = new SilenceDetector();

  const probe = await detector.probeMedia(tutorialPath);
  assert.equal(probe.hasVideo, true);
  assert.equal(probe.hasAudio, true);
  assert.equal(probe.sampleRate, 48000);
  assert.ok(probe.duration > 300);

  const result = await detector.process(tutorialPath, {
    thresholdDb: -30,
    minSilenceDuration: 0.5,
    paddingLeft: 0.15,
    paddingRight: 0.15
  });

  assert.ok(result.silences.length > 0);
  assert.ok(result.retained.length > 0);
  assert.ok(result.cuts.length > 0);
  assert.ok(result.stats.cutDuration > 0);
  assert.ok(result.stats.finalDuration < result.stats.originalDuration);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { TimelineModel } = require('../engine/timelineModel');

test('TimelineModel: Edge cases - beginning, middle, and end silences', () => {
  const model = new TimelineModel({ totalDuration: 10, fps: 30 });

  // Silence at start (0 to 2s), middle (4 to 6s), end (8 to 10s)
  const silences = [
    { start: 0, end: 2, duration: 2 },
    { start: 4, end: 6, duration: 2 },
    { start: 8, end: 10, duration: 2 }
  ];

  // Zero padding, min silence 0.5s
  const retained = model.calculateRetainedIntervals(silences, {
    minSilenceDuration: 0.5,
    minAudibleDuration: 0.1,
    paddingLeft: 0,
    paddingRight: 0
  });

  // Expected audible speech: [2, 4] and [6, 8]
  assert.equal(retained.length, 2);
  assert.equal(retained[0].startFrame, 60); // 2s * 30fps
  assert.equal(retained[0].endFrame, 120);  // 4s * 30fps
  assert.equal(retained[1].startFrame, 180); // 6s * 30fps
  assert.equal(retained[1].endFrame, 240);  // 8s * 30fps
});

test('TimelineModel: Short silence below minSilenceDuration is kept', () => {
  const model = new TimelineModel({ totalDuration: 10, fps: 30 });

  // 0.2s pause in the middle
  const silences = [
    { start: 4.8, end: 5.0, duration: 0.2 }
  ];

  const retained = model.calculateRetainedIntervals(silences, {
    minSilenceDuration: 0.5, // 0.2s is below 0.5s, should be ignored
    minAudibleDuration: 0.1,
    paddingLeft: 0,
    paddingRight: 0
  });

  assert.equal(retained.length, 1);
  assert.equal(retained[0].startFrame, 0);
  assert.equal(retained[0].endFrame, 300); // 10s * 30fps
});

test('TimelineModel: Padding expansion and merging overlapping boundaries', () => {
  const model = new TimelineModel({ totalDuration: 10, fps: 30 });

  // Two speech segments: [2, 3] and [3.2, 4.5] (separated by 0.2s silence)
  // Which means silence intervals: [0, 2], [3, 3.2] (below minSilence 0.5s), [4.5, 10]
  const silences = [
    { start: 0, end: 2, duration: 2 },
    { start: 3, end: 3.2, duration: 0.2 },
    { start: 4.5, end: 10, duration: 5.5 }
  ];

  const retained = model.calculateRetainedIntervals(silences, {
    minSilenceDuration: 0.1,
    minAudibleDuration: 0.1,
    paddingLeft: 0.15,
    paddingRight: 0.15
  });

  // Padding will expand [2, 3] -> [1.85, 3.15]
  // And [3.2, 4.5] -> [3.05, 4.65]
  // Since 3.05 <= 3.15, they MUST merge into [1.85, 4.65]!
  assert.equal(retained.length, 1);
  assert.equal(retained[0].startFrame, Math.floor(1.85 * 30)); // 55
  assert.equal(retained[0].endFrame, Math.ceil(4.65 * 30));    // 140
});

test('TimelineModel: Cuts calculation matches inverted retained intervals', () => {
  const model = new TimelineModel({ totalDuration: 10, fps: 30 });
  const retained = [
    { start: 2, end: 4, startFrame: 60, endFrame: 120, duration: 2, durationFrames: 60 },
    { start: 6, end: 8, startFrame: 180, endFrame: 240, duration: 2, durationFrames: 60 }
  ];

  const cuts = model.calculateCutIntervals(retained);
  assert.equal(cuts.length, 3);
  assert.equal(cuts[0].start, 0);
  assert.equal(cuts[0].end, 2);
  assert.equal(cuts[1].start, 4);
  assert.equal(cuts[1].end, 6);
  assert.equal(cuts[2].start, 8);
  assert.equal(cuts[2].end, 10);
});

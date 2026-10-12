const test = require('node:test');
const assert = require('node:assert/strict');
const { FCP7XMLGenerator } = require('../engine/xmlGenerator');

test('FCP7XMLGenerator: Generates valid XMEML schema structure in ripple-delete mode', () => {
  const xml = FCP7XMLGenerator.generate({
    mediaPath: 'C:\\Videos\\my_podcast.mp4',
    sequenceName: 'Test Cut Sequence',
    retainedIntervals: [
      { startFrame: 30, endFrame: 120, durationFrames: 90 },
      { startFrame: 180, endFrame: 300, durationFrames: 120 }
    ],
    fps: 30,
    sampleRate: 48000,
    width: 1920,
    height: 1080,
    hasVideo: true,
    hasAudio: true,
    silenceTreatment: 'ripple-delete'
  });

  assert.ok(xml.includes('<!DOCTYPE xmeml>'));
  assert.ok(xml.includes('<xmeml version="5">'));
  assert.ok(xml.includes('<sequence explodedTracks="true">'));
  assert.ok(xml.includes('<name>Test Cut Sequence</name>'));
  assert.ok(xml.includes('<duration>210</duration>')); // 90 + 120 frames rippled
  assert.ok(xml.includes('<clipitem id="clipitem-1-v">'));
  assert.ok(xml.includes('<clipitem id="clipitem-1-a1">'));
  assert.ok(xml.includes('<clipitem id="clipitem-1-a2">'));
  assert.ok(xml.includes('<pathurl>file://localhost/C:/Videos/my_podcast.mp4</pathurl>'));
  assert.ok(xml.includes('<timebase>30</timebase>'));
  // In ripple delete, clip 2 starts where clip 1 ended (timeline start 90)
  assert.ok(xml.includes('<start>90</start>'));
  assert.ok(xml.includes('<end>210</end>'));
  // Linking tags
  assert.ok(xml.includes('<linkclipref>clipitem-1-v</linkclipref>'));
  assert.ok(xml.includes('<linkclipref>clipitem-1-a1</linkclipref>'));
});

test('FCP7XMLGenerator: Generates razor cuts around silences in cut-around mode without gaps', () => {
  const xml = FCP7XMLGenerator.generate({
    mediaPath: 'C:\\Videos\\my_podcast.mp4',
    sequenceName: 'Slashed Sequence',
    retainedIntervals: [
      { startFrame: 30, endFrame: 120, durationFrames: 90 },
      { startFrame: 180, endFrame: 300, durationFrames: 120 }
    ],
    fps: 30,
    sampleRate: 48000,
    width: 1920,
    height: 1080,
    hasVideo: true,
    hasAudio: true,
    mediaDurationFrames: 300,
    silenceTreatment: 'cut-around'
  });

  assert.ok(xml.includes('<duration>300</duration>')); // Matches total sequence duration
  
  // Segment 1: Leading silence from frame 0 to 30
  assert.ok(xml.includes('<name>my_podcast.mp4 [Silence]</name>'));
  assert.ok(xml.includes('<start>0</start>'));
  assert.ok(xml.includes('<end>30</end>'));
  assert.ok(xml.includes('<label2>Rose</label2>'));

  // Segment 2: Speech from frame 30 to 120
  assert.ok(xml.includes('<name>my_podcast.mp4 [Speech]</name>'));
  assert.ok(xml.includes('<start>30</start>'));
  assert.ok(xml.includes('<end>120</end>'));
  assert.ok(xml.includes('<label2>Iris</label2>'));

  // Segment 3: Middle silence cut from frame 120 to 180
  assert.ok(xml.includes('<start>120</start>'));
  assert.ok(xml.includes('<end>180</end>'));

  // Segment 4: Speech cut from frame 180 to 300
  assert.ok(xml.includes('<start>180</start>'));
  assert.ok(xml.includes('<end>300</end>'));
});

test('FCP7XMLGenerator: Generates disabled silence clips in cut-around-muted mode', () => {
  const xml = FCP7XMLGenerator.generate({
    mediaPath: 'C:\\Videos\\my_podcast.mp4',
    retainedIntervals: [
      { startFrame: 30, endFrame: 120, durationFrames: 90 }
    ],
    fps: 30,
    sampleRate: 48000,
    mediaDurationFrames: 150,
    silenceTreatment: 'cut-around-muted'
  });

  // Silence segments have <enabled>FALSE</enabled>
  assert.ok(xml.includes('<enabled>FALSE</enabled>'));
  // Speech segments have <enabled>TRUE</enabled>
  assert.ok(xml.includes('<enabled>TRUE</enabled>'));
});

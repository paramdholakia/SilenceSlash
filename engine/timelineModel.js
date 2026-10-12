/**
 * Timeline Model & Silence Cutting Rules
 * 
 * Implements interval filtering, padding expansion, overlap merging,
 * and frame-boundary quantization for A/V synchronization.
 */

class TimelineModel {
  /**
   * @param {Object} options
   * @param {number} options.totalDuration - Total duration of the media in seconds
   * @param {number} [options.fps=30] - Video frame rate (e.g. 23.976, 25, 29.97, 30, 60)
   * @param {number} [options.sampleRate=48000] - Audio sample rate in Hz
   */
  constructor(options = {}) {
    this.totalDuration = options.totalDuration || 0;
    this.fps = options.fps || 30;
    this.sampleRate = options.sampleRate || 48000;
  }

  /**
   * Given raw detected silence intervals, convert them to speech (audible) intervals,
   * apply padding, minimum duration rules, and merge overlapping intervals.
   * 
   * @param {Array<{start: number, end: number}>} silenceIntervals - In seconds
   * @param {Object} config
   * @param {number} [config.minSilenceDuration=0.5] - Silences shorter than this are ignored (kept)
   * @param {number} [config.minAudibleDuration=0.1] - Speeches shorter than this are discarded
   * @param {number} [config.paddingLeft=0.15] - Margin before speech (seconds)
   * @param {number} [config.paddingRight=0.15] - Margin after speech (seconds)
   * @returns {Array<{start: number, end: number, startFrame: number, endFrame: number, duration: number, durationFrames: number}>}
   */
  calculateRetainedIntervals(silenceIntervals = [], config = {}) {
    const minSilence = config.minSilenceDuration !== undefined ? config.minSilenceDuration : 0.5;
    const minAudible = config.minAudibleDuration !== undefined ? config.minAudibleDuration : 0.1;
    const padLeft = config.paddingLeft !== undefined ? config.paddingLeft : 0.15;
    const padRight = config.paddingRight !== undefined ? config.paddingRight : 0.15;

    // 1. Filter out silences shorter than minSilence
    const significantSilences = silenceIntervals
      .filter(s => (s.end - s.start) >= minSilence)
      .map(s => ({
        start: Math.max(0, Math.min(this.totalDuration, s.start)),
        end: Math.max(0, Math.min(this.totalDuration, s.end))
      }))
      .sort((a, b) => a.start - b.start);

    // Merge overlapping or adjacent silences if any
    const mergedSilences = [];
    for (const sil of significantSilences) {
      if (mergedSilences.length === 0) {
        mergedSilences.push({ ...sil });
      } else {
        const prev = mergedSilences[mergedSilences.length - 1];
        if (sil.start <= prev.end) {
          prev.end = Math.max(prev.end, sil.end);
        } else {
          mergedSilences.push({ ...sil });
        }
      }
    }

    // 2. Derive speech (audible) intervals as the inverse of silences
    const rawSpeech = [];
    let curTime = 0;

    for (const sil of mergedSilences) {
      if (sil.start > curTime) {
        rawSpeech.push({ start: curTime, end: sil.start });
      }
      curTime = Math.max(curTime, sil.end);
    }
    if (curTime < this.totalDuration) {
      rawSpeech.push({ start: curTime, end: this.totalDuration });
    }

    // 3. Filter raw speech by minAudibleDuration
    const filteredSpeech = rawSpeech.filter(sp => (sp.end - sp.start) >= minAudible);

    // 4. Apply padding (padLeft expands start earlier, padRight expands end later)
    const paddedSpeech = filteredSpeech.map(sp => ({
      start: Math.max(0, sp.start - padLeft),
      end: Math.min(this.totalDuration, sp.end + padRight)
    }));

    // 5. Merge any overlapping or contiguous padded speech intervals
    const mergedSpeech = [];
    for (const sp of paddedSpeech) {
      if (mergedSpeech.length === 0) {
        mergedSpeech.push({ ...sp });
      } else {
        const prev = mergedSpeech[mergedSpeech.length - 1];
        if (sp.start <= prev.end) {
          prev.end = Math.max(prev.end, sp.end);
        } else {
          mergedSpeech.push({ ...sp });
        }
      }
    }

    // 6. Quantize intervals to video frame boundaries
    return mergedSpeech.map(sp => {
      const startFrame = Math.floor(sp.start * this.fps);
      const endFrame = Math.min(
        Math.ceil(this.totalDuration * this.fps),
        Math.ceil(sp.end * this.fps)
      );
      const durationFrames = Math.max(1, endFrame - startFrame);

      return {
        start: Number((startFrame / this.fps).toFixed(4)),
        end: Number((endFrame / this.fps).toFixed(4)),
        startFrame,
        endFrame,
        duration: Number((durationFrames / this.fps).toFixed(4)),
        durationFrames
      };
    });
  }

  /**
   * Calculate cut (removed) intervals from retained intervals.
   * Useful for UI visualization of red/removed regions.
   * 
   * @param {Array<{start: number, end: number}>} retainedIntervals
   * @returns {Array<{start: number, end: number, duration: number}>}
   */
  calculateCutIntervals(retainedIntervals = []) {
    const cuts = [];
    let cur = 0;

    for (const ret of retainedIntervals) {
      if (ret.start > cur) {
        cuts.push({
          start: Number(cur.toFixed(4)),
          end: Number(ret.start.toFixed(4)),
          duration: Number((ret.start - cur).toFixed(4))
        });
      }
      cur = Math.max(cur, ret.end);
    }

    if (cur < this.totalDuration) {
      cuts.push({
        start: Number(cur.toFixed(4)),
        end: Number(this.totalDuration.toFixed(4)),
        duration: Number((this.totalDuration - cur).toFixed(4))
      });
    }

    return cuts;
  }

  /**
   * Generates a contiguous chain of all segments (both speech and silence)
   * covering the media from frame 0 to total media duration.
   * Essential for 'cut-around' mode to create razor cuts around silences while keeping all media.
   * 
   * @param {Array<{startFrame: number, endFrame: number, durationFrames: number}>} retainedIntervals
   * @param {number} [totalMediaFrames]
   * @returns {Array<{type: 'speech'|'silence', startFrame: number, endFrame: number, durationFrames: number, start: number, end: number, duration: number}>}
   */
  calculateCutAroundSegments(retainedIntervals = [], totalMediaFrames = null) {
    const totalFrames = totalMediaFrames !== null ? totalMediaFrames : Math.round(this.totalDuration * this.fps);
    const segments = [];
    let curFrame = 0;

    for (const ret of retainedIntervals) {
      if (ret.startFrame > curFrame) {
        const silDur = ret.startFrame - curFrame;
        segments.push({
          type: 'silence',
          startFrame: curFrame,
          endFrame: ret.startFrame,
          durationFrames: silDur,
          start: Number((curFrame / this.fps).toFixed(4)),
          end: Number((ret.startFrame / this.fps).toFixed(4)),
          duration: Number((silDur / this.fps).toFixed(4))
        });
      }
      segments.push({
        type: 'speech',
        startFrame: ret.startFrame,
        endFrame: ret.endFrame,
        durationFrames: ret.durationFrames,
        start: Number((ret.startFrame / this.fps).toFixed(4)),
        end: Number((ret.endFrame / this.fps).toFixed(4)),
        duration: Number((ret.durationFrames / this.fps).toFixed(4))
      });
      curFrame = Math.max(curFrame, ret.endFrame);
    }

    if (curFrame < totalFrames) {
      const silDur = totalFrames - curFrame;
      segments.push({
        type: 'silence',
        startFrame: curFrame,
        endFrame: totalFrames,
        durationFrames: silDur,
        start: Number((curFrame / this.fps).toFixed(4)),
        end: Number((totalFrames / this.fps).toFixed(4)),
        duration: Number((silDur / this.fps).toFixed(4))
      });
    }

    return segments;
  }
}

module.exports = { TimelineModel };

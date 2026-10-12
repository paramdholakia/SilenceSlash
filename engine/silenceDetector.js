const { spawn } = require('child_process');
const { TimelineModel } = require('./timelineModel');

/**
 * Executes FFmpeg silencedetect on a media file and yields parsed silence intervals.
 */
class SilenceDetector {
  /**
   * @param {Object} options
   * @param {string} [options.ffmpegPath='ffmpeg']
   * @param {string} [options.ffprobePath='ffprobe']
   */
  constructor(options = {}) {
    this.ffmpegPath = options.ffmpegPath || 'ffmpeg';
    this.ffprobePath = options.ffprobePath || 'ffprobe';
  }

  /**
   * Probe media for duration, video streams, audio streams, and frame rate.
   * @param {string} filePath
   * @returns {Promise<{duration: number, fps: number, sampleRate: number, hasVideo: boolean, hasAudio: boolean}>}
   */
  async probeMedia(filePath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'stream=codec_type,r_frame_rate,sample_rate:format=duration',
        '-of', 'json',
        filePath
      ];

      const child = spawn(this.ffprobePath, args);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });

      child.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`ffprobe failed with exit code ${code}: ${stderr}`));
        }

        try {
          const parsed = JSON.parse(stdout);
          let duration = parseFloat(parsed.format?.duration || 0);
          let fps = 30;
          let sampleRate = 48000;
          let hasVideo = false;
          let hasAudio = false;

          if (parsed.streams && Array.isArray(parsed.streams)) {
            for (const st of parsed.streams) {
              if (st.codec_type === 'video') {
                hasVideo = true;
                if (st.r_frame_rate) {
                  const parts = st.r_frame_rate.split('/');
                  if (parts.length === 2 && Number(parts[1]) > 0) {
                    fps = Number(parts[0]) / Number(parts[1]);
                  }
                }
              } else if (st.codec_type === 'audio') {
                hasAudio = true;
                if (st.sample_rate) {
                  sampleRate = parseInt(st.sample_rate, 10);
                }
              }
            }
          }

          resolve({ duration, fps: Number(fps.toFixed(3)), sampleRate, hasVideo, hasAudio });
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe json: ${err.message}`));
        }
      });
    });
  }

  /**
   * Detect silence intervals using FFmpeg's silencedetect audio filter.
   * 
   * @param {string} filePath
   * @param {Object} [params]
   * @param {number} [params.noiseThreshold=-30] - in dBFS (e.g. -35)
   * @param {number} [params.minSilenceDuration=0.5] - in seconds
   * @returns {Promise<Array<{start: number, end: number, duration: number}>>}
   */
  async detectSilence(filePath, params = {}) {
    const thresholdDb = params.noiseThreshold !== undefined ? params.noiseThreshold : -30;
    const minSilenceSec = params.minSilenceDuration !== undefined ? params.minSilenceDuration : 0.5;

    return new Promise((resolve, reject) => {
      const filter = `silencedetect=noise=${thresholdDb}dB:d=${minSilenceSec}`;
      const args = [
        '-i', filePath,
        '-vn',
        '-af', filter,
        '-f', 'null',
        '-'
      ];

      const child = spawn(this.ffmpegPath, args);
      let stderr = '';

      child.stderr.on('data', d => {
        stderr += d.toString();
      });

      child.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`ffmpeg silencedetect failed (${code}): ${stderr}`));
        }

        const silenceIntervals = [];
        const lines = stderr.split('\n');

        let currentStart = null;

        for (const line of lines) {
          const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
          if (startMatch) {
            currentStart = parseFloat(startMatch[1]);
          }

          const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
          if (endMatch) {
            const end = parseFloat(endMatch[1]);
            const duration = parseFloat(endMatch[2]);
            const start = currentStart !== null ? currentStart : Math.max(0, end - duration);
            silenceIntervals.push({ start, end, duration });
            currentStart = null;
          }
        }

        // If a silence started and didn't close before the end of the file
        if (currentStart !== null && params.totalDuration) {
          silenceIntervals.push({
            start: currentStart,
            end: params.totalDuration,
            duration: params.totalDuration - currentStart
          });
        }

        resolve(silenceIntervals);
      });
    });
  }

  /**
   * Analyze media file and compute retained timeline intervals.
   * 
   * @param {string} filePath
   * @param {Object} [options]
   * @param {number} [options.thresholdDb=-30]
   * @param {number} [options.minSilenceDuration=0.5]
   * @param {number} [options.minAudibleDuration=0.1]
   * @param {number} [options.paddingLeft=0.15]
   * @param {number} [options.paddingRight=0.15]
   */
  async process(filePath, options = {}) {
    const probe = await this.probeMedia(filePath);
    if (!probe.hasAudio) {
      throw new Error(`Media file does not contain an audio stream: ${filePath}`);
    }

    const silences = await this.detectSilence(filePath, {
      noiseThreshold: options.thresholdDb !== undefined ? options.thresholdDb : -30,
      minSilenceDuration: options.minSilenceDuration !== undefined ? options.minSilenceDuration : 0.5,
      totalDuration: probe.duration
    });

    const timeline = new TimelineModel({
      totalDuration: probe.duration,
      fps: probe.fps,
      sampleRate: probe.sampleRate
    });

    const retained = timeline.calculateRetainedIntervals(silences, {
      minSilenceDuration: options.minSilenceDuration !== undefined ? options.minSilenceDuration : 0.5,
      minAudibleDuration: options.minAudibleDuration !== undefined ? options.minAudibleDuration : 0.1,
      paddingLeft: options.paddingLeft !== undefined ? options.paddingLeft : 0.15,
      paddingRight: options.paddingRight !== undefined ? options.paddingRight : 0.15
    });

    const cuts = timeline.calculateCutIntervals(retained);

    const originalDuration = probe.duration;
    const finalDuration = retained.reduce((acc, cur) => acc + cur.duration, 0);
    const cutDuration = originalDuration - finalDuration;
    const cutPercentage = originalDuration > 0 ? ((cutDuration / originalDuration) * 100).toFixed(1) : '0';

    return {
      media: probe,
      silences,
      retained,
      cuts,
      stats: {
        originalDuration: Number(originalDuration.toFixed(3)),
        finalDuration: Number(finalDuration.toFixed(3)),
        cutDuration: Number(cutDuration.toFixed(3)),
        cutPercentage: Number(cutPercentage),
        totalCuts: cuts.length
      }
    };
  }
}

module.exports = { SilenceDetector };

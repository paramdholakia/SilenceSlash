/**
 * SilenceSlash - UXP & CEP Panel Controller
 * Robust Implementation for Adobe Premiere Pro 2023 / V12 - V25+
 */

// Application state
const state = {
  fileName: '',
  filePath: '',
  duration: 0,
  fps: 30,
  sampleRate: 48000,
  retainedIntervals: [],
  cutIntervals: [],
  audioSamples: null,
  stats: {}
};

// Safe DOM element retrieval
const $ = (id) => document.getElementById(id);

const dropzone = $('dropzone');
const filePicker = $('filePicker');
const fileCard = $('fileCard');
const fileNameEl = $('fileName');
const fileDuration = $('fileDuration');
const fileFps = $('fileFps');
const fileSampleRate = $('fileSampleRate');
const btnRemoveFile = $('btnRemoveFile');

const btnLoadFromTimeline = $('btnLoadFromTimeline');
const btnAutoTune = $('btnAutoTune');

const thresholdSlider = $('thresholdSlider');
const thresholdVal = $('thresholdVal');
const minSilenceSlider = $('minSilenceSlider');
const minSilenceVal = $('minSilenceVal');
const paddingSlider = $('paddingSlider');
const paddingVal = $('paddingVal');
const treatmentSelect = $('treatmentSelect');

const btnAnalyze = $('btnAnalyze');
const timelineCard = $('timelineCard');
const timelineCanvas = $('timelineCanvas');
const statOriginal = $('statOriginal');
const statTrimmed = $('statTrimmed');
const statSaved = $('statSaved');
const exportRow = $('exportRow');
const btnExportXml = $('btnExportXml');
const statusBox = $('statusBox');
const xmlPathBox = $('xmlPathBox');
const xmlPathText = $('xmlPathText');
const btnOpenExplorer = $('btnOpenExplorer');
const btnCopyPath = $('btnCopyPath');

let lastSavedXmlPath = null;
let csInterface = null;

// Initialize CSInterface safely
try {
  if (typeof CSInterface !== 'undefined') {
    csInterface = new CSInterface();
  }
} catch(e) {
  console.warn('CSInterface init warning:', e);
}

function showStatus(msg, type = 'info') {
  if (!statusBox) return;
  statusBox.textContent = msg;
  statusBox.className = `status-msg status-${type}`;
  statusBox.style.display = 'block';
}

// Live control listeners
if (thresholdSlider) {
  thresholdSlider.addEventListener('input', (e) => {
    if (thresholdVal) thresholdVal.textContent = `${e.target.value} dBFS`;
    if (state.duration > 0) debounceReanalyze();
  });
}

if (minSilenceSlider) {
  minSilenceSlider.addEventListener('input', (e) => {
    if (minSilenceVal) minSilenceVal.textContent = `${e.target.value} ms`;
    if (state.duration > 0) debounceReanalyze();
  });
}

if (paddingSlider) {
  paddingSlider.addEventListener('input', (e) => {
    if (paddingVal) paddingVal.textContent = `${e.target.value} ms`;
    if (state.duration > 0) debounceReanalyze();
  });
}

if (treatmentSelect) {
  treatmentSelect.addEventListener('change', () => {
    if (state.duration > 0) renderTimeline();
  });
}

let debounceTimer = null;
function debounceReanalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runSilenceDetection();
  }, 120);
}

// File drop & select handling
if (dropzone && filePicker) {
  dropzone.addEventListener('click', () => filePicker.click());
  filePicker.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadMediaFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      loadMediaFile(e.dataTransfer.files[0]);
    }
  });
}

if (btnRemoveFile) {
  btnRemoveFile.addEventListener('click', () => {
    state.filePath = '';
    state.duration = 0;
    state.audioSamples = null;
    if (fileCard) fileCard.style.display = 'none';
    if (dropzone) dropzone.style.display = 'flex';
    if (btnAnalyze) btnAnalyze.disabled = true;
    if (timelineCard) timelineCard.style.display = 'none';
    if (exportRow) exportRow.style.display = 'none';
    if (statusBox) statusBox.style.display = 'none';
    if (xmlPathBox) xmlPathBox.style.display = 'none';
  });
}

// 1. "Grab Active Premiere Clip" Handler
if (btnLoadFromTimeline) {
  btnLoadFromTimeline.addEventListener('click', () => {
    showStatus('Scanning Premiere Pro timeline and project items...', 'info');

    if (!csInterface) {
      showStatus('Adobe CEP environment not detected.', 'error');
      return;
    }

    csInterface.evalScript('SilenceSlashHost.getActiveSequenceMedia()', (res) => {
      if (!res || res === 'ERROR_NO_PROJECT') {
        showStatus('Please open or create a project in Premiere Pro first.', 'error');
        return;
      }
      if (res === 'NO_CLIPS_FOUND' || res === 'undefined') {
        showStatus('No media clip found on timeline or in Project panel. Please import or select a clip.', 'error');
        return;
      }

      loadMediaFromDiskPath(res);
    });
  });
}

// 2. Load media from local file path or browser File object
function loadMediaFile(file) {
  const diskPath = file.path || '';
  if (diskPath) {
    loadMediaFromDiskPath(diskPath);
  } else {
    // Standard browser fallback
    loadMediaFromBlob(file, file.name);
  }
}

function loadMediaFromDiskPath(fullPath) {
  showStatus(`Processing media: ${fullPath}`, 'info');

  try {
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(fullPath)) {
      showStatus(`File does not exist: ${fullPath}`, 'error');
      return;
    }

    state.filePath = fullPath;
    state.fileName = path.basename(fullPath);

    if (fileNameEl) fileNameEl.textContent = state.fileName;
    if (dropzone) dropzone.style.display = 'none';
    if (fileCard) fileCard.style.display = 'block';

    // Fast FFmpeg / Node probing
    extractMediaInfoAndAudio(fullPath);
  } catch(err) {
    // If require('fs') fails, read via HTML5 File
    showStatus(`Direct access error: ${err.message}`, 'error');
  }
}

/**
 * Extracts duration and audio waveform using Node.js child_process (ffmpeg) or Web Audio fallback
 */
function extractMediaInfoAndAudio(mediaPath) {
  showStatus('Probing media and decoding audio...', 'info');

  let hasNode = false;
  try {
    hasNode = !!require('child_process');
  } catch(e) {}

  if (hasNode) {
    const { execFile } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    // Fast probe with ffprobe / ffmpeg
    const probeArgs = [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,r_frame_rate,sample_rate:format=duration',
      '-of', 'json',
      mediaPath
    ];

    execFile('ffprobe', probeArgs, (probeErr, stdout) => {
      let dur = 0;
      let fps = 30;
      let sampleRate = 48000;

      if (!probeErr && stdout) {
        try {
          const parsed = JSON.parse(stdout);
          dur = parseFloat(parsed.format?.duration || 0);
          if (parsed.streams) {
            for (const s of parsed.streams) {
              if (s.codec_type === 'video' && s.r_frame_rate) {
                const parts = s.r_frame_rate.split('/');
                if (parts.length === 2 && Number(parts[1]) > 0) {
                  fps = Number(parts[0]) / Number(parts[1]);
                }
              }
              if (s.codec_type === 'audio' && s.sample_rate) {
                sampleRate = parseInt(s.sample_rate, 10);
              }
            }
          }
        } catch(e) {}
      }

      // Extract low-rate PCM raw audio for instant RMS analysis: 8kHz mono float32
      const tempPcm = path.join(os.tmpdir(), `silenceslash_${Date.now()}.raw`);
      const ffmpegArgs = [
        '-i', mediaPath,
        '-vn',
        '-ac', '1',
        '-ar', '8000',
        '-f', 'f32le',
        '-y',
        tempPcm
      ];

      execFile('ffmpeg', ffmpegArgs, (ffErr) => {
        if (!ffErr && fs.existsSync(tempPcm)) {
          const rawBuf = fs.readFileSync(tempPcm);
          try { fs.unlinkSync(tempPcm); } catch(e) {}

          const floatCount = Math.floor(rawBuf.length / 4);
          const floats = new Float32Array(rawBuf.buffer, rawBuf.byteOffset, floatCount);

          if (dur <= 0) dur = floatCount / 8000;

          state.duration = dur;
          state.fps = fps;
          state.sampleRate = sampleRate;
          state.audioSamples = floats;
          state.samplesRate = 8000;

          updateMediaCardUI();
          autoDetectAndRun();
          return;
        }

        // If FFmpeg fails, fallback to Web Audio decoding
        fallbackWebAudio(mediaPath);
      });
    });
  } else {
    fallbackWebAudio(mediaPath);
  }
}

function fallbackWebAudio(mediaPath) {
  try {
    const fs = require('fs');
    const buf = fs.readFileSync(mediaPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    decodeArrayBuffer(ab);
  } catch(e) {
    showStatus(`Cannot load audio: ${e.message}`, 'error');
  }
}

function loadMediaFromBlob(file, name) {
  state.filePath = file.path || name;
  state.fileName = name;
  if (fileNameEl) fileNameEl.textContent = name;
  if (dropzone) dropzone.style.display = 'none';
  if (fileCard) fileCard.style.display = 'block';

  showStatus('Decoding media in browser...', 'info');
  file.arrayBuffer().then(ab => decodeArrayBuffer(ab)).catch(err => {
    showStatus(`Failed to read file: ${err.message}`, 'error');
  });
}

async function decodeArrayBuffer(arrayBuffer) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    state.duration = decoded.duration;
    state.sampleRate = decoded.sampleRate;
    state.fps = 30;
    state.audioSamples = decoded.getChannelData(0);
    state.samplesRate = decoded.sampleRate;

    updateMediaCardUI();
    autoDetectAndRun();
  } catch(err) {
    showStatus(`Audio decoding error: ${err.message}`, 'error');
  }
}

function updateMediaCardUI() {
  const mins = Math.floor(state.duration / 60);
  const secs = (state.duration % 60).toFixed(1);
  if (fileDuration) fileDuration.textContent = `Duration: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
  if (fileSampleRate) fileSampleRate.textContent = `Rate: ${(state.sampleRate / 1000).toFixed(0)}kHz`;
  if (fileFps) fileFps.textContent = `FPS: ${Math.round(state.fps)}`;
  if (btnAnalyze) btnAnalyze.disabled = false;
}

// 3. Auto-Tuning Button
if (btnAutoTune) {
  btnAutoTune.addEventListener('click', () => {
    if (!state.audioSamples || state.duration <= 0) {
      showStatus('Please load or select a media clip first.', 'info');
      return;
    }
    autoDetectAndRun();
  });
}

function autoDetectAndRun() {
  if (!state.audioSamples || state.duration <= 0) return;

  const samples = state.audioSamples;
  const sRate = state.samplesRate || 8000;
  const win = Math.floor(sRate * 0.05); // 50ms window
  const count = samples.length;

  const dbList = [];
  for (let i = 0; i < count; i += win) {
    const end = Math.min(i + win, count);
    let sq = 0;
    for (let j = i; j < end; j++) {
      sq += samples[j] * samples[j];
    }
    const rms = Math.sqrt(sq / (end - i));
    const db = rms > 0.00001 ? 20 * Math.log10(rms) : -90;
    dbList.push(db);
  }

  dbList.sort((a, b) => a - b);
  const p15 = dbList[Math.floor(dbList.length * 0.15)] || -60;
  const p85 = dbList[Math.floor(dbList.length * 0.85)] || -15;

  let optimalThreshold = Math.round(p15 + (p85 - p15) * 0.35);
  optimalThreshold = Math.max(-55, Math.min(-15, optimalThreshold));

  let optimalSilenceMs = 450;
  if (state.duration > 180) optimalSilenceMs = 500;
  else if (state.duration < 30) optimalSilenceMs = 350;

  if (thresholdSlider) thresholdSlider.value = optimalThreshold;
  if (thresholdVal) thresholdVal.textContent = `${optimalThreshold} dBFS`;

  if (minSilenceSlider) minSilenceSlider.value = optimalSilenceMs;
  if (minSilenceVal) minSilenceVal.textContent = `${optimalSilenceMs} ms`;

  if (paddingSlider) paddingSlider.value = 175;
  if (paddingVal) paddingVal.textContent = `175 ms`;

  showStatus(`Auto-tuned: Threshold ${optimalThreshold} dBFS | Min Silence ${optimalSilenceMs}ms`, 'success');
  runSilenceDetection();
}

// 4. "Slash Silence" Button
if (btnAnalyze) {
  btnAnalyze.addEventListener('click', () => {
    runSilenceDetection();
  });
}

function runSilenceDetection() {
  if (!state.audioSamples || state.duration <= 0) return;

  const thresholdDb = parseFloat(thresholdSlider ? thresholdSlider.value : -30);
  const minSilenceSec = parseFloat(minSilenceSlider ? minSilenceSlider.value : 500) / 1000;
  const paddingSec = parseFloat(paddingSlider ? paddingSlider.value : 175) / 1000;

  const rmsThreshold = Math.pow(10, thresholdDb / 20);
  const samples = state.audioSamples;
  const sRate = state.samplesRate || 8000;
  const total = samples.length;
  const win = Math.floor(sRate * 0.02); // 20ms

  const silences = [];
  let inSilence = false;
  let silStart = 0;

  for (let i = 0; i < total; i += win) {
    const end = Math.min(i + win, total);
    let sq = 0;
    for (let j = i; j < end; j++) {
      sq += samples[j] * samples[j];
    }
    const rms = Math.sqrt(sq / (end - i));
    const curSec = i / sRate;

    if (rms < rmsThreshold) {
      if (!inSilence) {
        inSilence = true;
        silStart = curSec;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        const dur = curSec - silStart;
        if (dur >= minSilenceSec) {
          silences.push({ start: silStart, end: curSec, duration: dur });
        }
      }
    }
  }

  if (inSilence) {
    const dur = state.duration - silStart;
    if (dur >= minSilenceSec) {
      silences.push({ start: silStart, end: state.duration, duration: dur });
    }
  }

  // Invert silences to get retained speech
  const rawSpeech = [];
  let cur = 0;
  for (const s of silences) {
    if (s.start > cur) rawSpeech.push({ start: cur, end: s.start });
    cur = Math.max(cur, s.end);
  }
  if (cur < state.duration) rawSpeech.push({ start: cur, end: state.duration });

  // Apply padding
  const padded = rawSpeech.map(sp => ({
    start: Math.max(0, sp.start - paddingSec),
    end: Math.min(state.duration, sp.end + paddingSec)
  }));

  // Merge overlaps
  const merged = [];
  for (const sp of padded) {
    if (merged.length === 0) merged.push({ ...sp });
    else {
      const prev = merged[merged.length - 1];
      if (sp.start <= prev.end) {
        prev.end = Math.max(prev.end, sp.end);
      } else {
        merged.push({ ...sp });
      }
    }
  }

  // Frame quantization
  const fps = state.fps || 30;
  const retained = merged.map(sp => {
    const startFrame = Math.floor(sp.start * fps);
    const endFrame = Math.ceil(sp.end * fps);
    const durationFrames = Math.max(1, endFrame - startFrame);
    return {
      start: startFrame / fps,
      end: endFrame / fps,
      startFrame,
      endFrame,
      duration: durationFrames / fps,
      durationFrames
    };
  });

  state.retainedIntervals = retained;

  // Calculate cuts
  const cuts = [];
  let cutCur = 0;
  for (const ret of retained) {
    if (ret.start > cutCur) cuts.push({ start: cutCur, end: ret.start, duration: ret.start - cutCur });
    cutCur = Math.max(cutCur, ret.end);
  }
  if (cutCur < state.duration) {
    cuts.push({ start: cutCur, end: state.duration, duration: state.duration - cutCur });
  }
  state.cutIntervals = cuts;

  const totalRet = retained.reduce((a, b) => a + b.duration, 0);
  const totalSaved = Math.max(0, state.duration - totalRet);
  const pct = state.duration > 0 ? ((totalSaved / state.duration) * 100).toFixed(1) : 0;

  if (statOriginal) statOriginal.textContent = `${state.duration.toFixed(1)}s`;
  if (statTrimmed) statTrimmed.textContent = `${totalRet.toFixed(1)}s`;
  if (statSaved) statSaved.textContent = `${pct}% (${totalSaved.toFixed(1)}s)`;

  if (timelineCard) timelineCard.style.display = 'block';
  if (exportRow) exportRow.style.display = 'flex';
  if (btnExportXml) btnExportXml.disabled = false;

  renderTimeline();
}

function renderTimeline() {
  if (!timelineCanvas) return;
  const canvas = timelineCanvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const dur = state.duration;
  if (dur <= 0) return;

  // 1. Dark base background
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, w, h);

  // 2. Silence region tint (subtle red/rose)
  ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
  ctx.fillRect(0, 0, w, h);

  // 3. Speech retained blocks (emerald green)
  ctx.fillStyle = '#10b981';
  for (const r of state.retainedIntervals) {
    const x = (r.start / dur) * w;
    const rw = Math.max(1, (r.duration / dur) * w);
    ctx.fillRect(x, 0, rw, h);
  }

  // 4. Waveform visualization overlay
  if (state.audioSamples && state.audioSamples.length > 0) {
    const samples = state.audioSamples;
    const totalSamples = samples.length;
    const step = Math.max(1, Math.floor(totalSamples / w));
    const centerY = h / 2;

    for (let px = 0; px < w; px++) {
      const sampleIdx = Math.floor((px / w) * totalSamples);
      let peak = 0;
      for (let s = 0; s < step && (sampleIdx + s) < totalSamples; s++) {
        const val = Math.abs(samples[sampleIdx + s]);
        if (val > peak) peak = val;
      }

      const barHeight = Math.max(2, peak * (h - 6));
      const curSec = (px / w) * dur;
      const isAudible = state.retainedIntervals.some(r => curSec >= r.start && curSec <= r.end);

      ctx.fillStyle = isAudible ? 'rgba(255, 255, 255, 0.75)' : 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(px, centerY - barHeight / 2, 1, barHeight);
    }
  }

  // 5. Razor Cut Markers (crisp 1px vertical line at every start and end)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  for (const r of state.retainedIntervals) {
    const xStart = Math.round((r.start / dur) * w);
    const xEnd = Math.round((r.end / dur) * w);
    ctx.fillRect(xStart, 0, 1, h);
    ctx.fillRect(xEnd, 0, 1, h);
  }
}

// Responsive timeline redraw on container resize
if (typeof ResizeObserver !== 'undefined' && timelineCanvas && timelineCanvas.parentElement) {
  const ro = new ResizeObserver(() => {
    if (state.duration > 0) renderTimeline();
  });
  ro.observe(timelineCanvas.parentElement);
}

window.addEventListener('resize', () => {
  if (state.duration > 0) renderTimeline();
});

// 5. Build Final Cut Pro 7 / Premiere Pro XML
function buildXmlString() {
  const fileName = state.fileName;
  
  // RFC URL encoding for spaces and special characters
  let fileUrl = '';
  try {
    const { pathToFileURL } = require('url');
    fileUrl = pathToFileURL(state.filePath).href.replace('file:///', 'file://localhost/');
  } catch(e) {
    const norm = state.filePath.replace(/\\/g, '/');
    fileUrl = `file://localhost/${encodeURI(norm)}`;
  }

  const fps = state.fps || 30;
  const timebase = Math.round(fps);
  const ntsc = (Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - 23.976) < 0.05 || Math.abs(fps - 59.94) < 0.05) ? 'TRUE' : 'FALSE';
  const treatment = treatmentSelect ? treatmentSelect.value : 'ripple-delete';

  const isCutAround = (treatment === 'cut-around' || treatment === 'cut-around-muted');
  const isRipple = (treatment === 'ripple-delete');
  const isMutedSilence = (treatment === 'cut-around-muted');

  const highestOut = state.retainedIntervals.reduce((m, x) => Math.max(m, x.endFrame), 0);
  const totalFileFrames = Math.max(Math.ceil((state.duration || 0) * fps), highestOut);

  let timelineItems = [];

  if (isCutAround) {
    // Build contiguous chain of speech and silence segments
    let curFrame = 0;
    for (const ret of state.retainedIntervals) {
      if (ret.startFrame > curFrame) {
        timelineItems.push({
          type: 'silence',
          name: `${fileName} [Silence]`,
          startFrame: curFrame,
          endFrame: ret.startFrame,
          durationFrames: ret.startFrame - curFrame,
          timelineStart: curFrame,
          timelineEnd: ret.startFrame,
          enabled: isMutedSilence ? 'FALSE' : 'TRUE',
          label: 'Rose'
        });
      }
      timelineItems.push({
        type: 'speech',
        name: `${fileName} [Speech]`,
        startFrame: ret.startFrame,
        endFrame: ret.endFrame,
        durationFrames: ret.durationFrames,
        timelineStart: ret.startFrame,
        timelineEnd: ret.endFrame,
        enabled: 'TRUE',
        label: 'Iris'
      });
      curFrame = Math.max(curFrame, ret.endFrame);
    }
    if (curFrame < totalFileFrames) {
      timelineItems.push({
        type: 'silence',
        name: `${fileName} [Silence]`,
        startFrame: curFrame,
        endFrame: totalFileFrames,
        durationFrames: totalFileFrames - curFrame,
        timelineStart: curFrame,
        timelineEnd: totalFileFrames,
        enabled: isMutedSilence ? 'FALSE' : 'TRUE',
        label: 'Rose'
      });
    }
  } else if (isRipple) {
    let curTimeline = 0;
    for (const ret of state.retainedIntervals) {
      timelineItems.push({
        type: 'speech',
        name: fileName,
        startFrame: ret.startFrame,
        endFrame: ret.endFrame,
        durationFrames: ret.durationFrames,
        timelineStart: curTimeline,
        timelineEnd: curTimeline + ret.durationFrames,
        enabled: 'TRUE',
        label: 'Iris'
      });
      curTimeline += ret.durationFrames;
    }
  } else {
    // delete-without-ripple
    for (const ret of state.retainedIntervals) {
      timelineItems.push({
        type: 'speech',
        name: fileName,
        startFrame: ret.startFrame,
        endFrame: ret.endFrame,
        durationFrames: ret.durationFrames,
        timelineStart: ret.startFrame,
        timelineEnd: ret.endFrame,
        enabled: 'TRUE',
        label: 'Iris'
      });
    }
  }

  let seqDurationFrames = 0;
  if (timelineItems.length > 0) {
    const last = timelineItems[timelineItems.length - 1];
    seqDurationFrames = last.timelineEnd;
  }

  const vClips = [];
  const aClips1 = [];
  const aClips2 = [];

  timelineItems.forEach((item, idx) => {
    const clipIdx = idx + 1;
    const id = `clipitem-${clipIdx}`;
    const inFrame = item.startFrame;
    const outFrame = item.endFrame;
    const durFrames = item.durationFrames;
    const timelineStart = item.timelineStart;
    const timelineEnd = item.timelineEnd;
    const isFirst = (idx === 0);

    const fileXml = isFirst ? `
            <file id="file-1">
              <name>${escapeXml(fileName)}</name>
              <pathurl>${fileUrl}</pathurl>
              <rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>
              <duration>${totalFileFrames}</duration>
              <media>
                <video>
                  <samplecharacteristics>
                    <width>1920</width><height>1080</height>
                    <pixelaspectratio>square</pixelaspectratio>
                  </samplecharacteristics>
                </video>
                <audio>
                  <samplecharacteristics><depth>16</depth><samplerate>${state.sampleRate || 48000}</samplerate></samplecharacteristics>
                  <channelcount>2</channelcount>
                </audio>
              </media>
            </file>` : `<file id="file-1" />`;

    const linkXml = `
            <link>
              <linkclipref>${id}-v</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${clipIdx}</clipindex>
              <groupindex>1</groupindex>
            </link>
            <link>
              <linkclipref>${id}-a1</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${clipIdx}</clipindex>
              <groupindex>1</groupindex>
            </link>
            <link>
              <linkclipref>${id}-a2</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>2</trackindex>
              <clipindex>${clipIdx}</clipindex>
              <groupindex>1</groupindex>
            </link>`;

    vClips.push(`
      <clipitem id="${id}-v">
        <name>${escapeXml(item.name)}</name>
        <enabled>${item.enabled}</enabled>
        <duration>${durFrames}</duration>
        <rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>
        <start>${timelineStart}</start><end>${timelineEnd}</end>
        <in>${inFrame}</in><out>${outFrame}</out>
        ${fileXml}
        <labels>
          <label2>${item.label}</label2>
        </labels>
        ${linkXml}
      </clipitem>`);

    aClips1.push(`
      <clipitem id="${id}-a1">
        <name>${escapeXml(item.name)}</name>
        <enabled>${item.enabled}</enabled>
        <duration>${durFrames}</duration>
        <rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>
        <start>${timelineStart}</start><end>${timelineEnd}</end>
        <in>${inFrame}</in><out>${outFrame}</out>
        <file id="file-1" />
        <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
        <labels>
          <label2>${item.label}</label2>
        </labels>
        ${linkXml}
      </clipitem>`);

    aClips2.push(`
      <clipitem id="${id}-a2">
        <name>${escapeXml(item.name)}</name>
        <enabled>${item.enabled}</enabled>
        <duration>${durFrames}</duration>
        <rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>
        <start>${timelineStart}</start><end>${timelineEnd}</end>
        <in>${inFrame}</in><out>${outFrame}</out>
        <file id="file-1" />
        <sourcetrack><mediatype>audio</mediatype><trackindex>2</trackindex></sourcetrack>
        <labels>
          <label2>${item.label}</label2>
        </labels>
        ${linkXml}
      </clipitem>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence explodedTracks="true">
    <name>${escapeXml(fileName)} (SilenceSlash Cuts)</name>
    <duration>${seqDurationFrames}</duration>
    <rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width><height>1080</height>
            <pixelaspectratio>square</pixelaspectratio>
            <rate><timebase>${timebase}</timebase><ntsc>${ntsc}</ntsc></rate>
          </samplecharacteristics>
        </format>
        <track>${vClips.join('')}</track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics><depth>16</depth><samplerate>${state.sampleRate || 48000}</samplerate></samplecharacteristics>
        </format>
        <track>${aClips1.join('')}</track>
        <track>${aClips2.join('')}</track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 6. "Create Slashed Sequence" Button
if (btnExportXml) {
  btnExportXml.addEventListener('click', () => {
    if (!state.retainedIntervals || state.retainedIntervals.length === 0) {
      showStatus('No cuts to export. Run silence detection first.', 'error');
      return;
    }

    const xml = buildXmlString();

    if (csInterface) {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      csInterface.evalScript('SilenceSlashHost.getProjectDir()', (projectDir) => {
        let saveDir = projectDir;
        if (!saveDir || saveDir === 'undefined' || !fs.existsSync(saveDir)) {
          if (state.filePath && fs.existsSync(path.dirname(state.filePath))) {
            saveDir = path.dirname(state.filePath);
          } else {
            saveDir = path.join(os.homedir(), 'Desktop');
          }
        }

        const safeName = state.fileName.replace(/\.[^/.]+$/, '');
        const targetXml = path.join(saveDir, `${safeName}_silenceslash.xml`);

        fs.writeFileSync(targetXml, xml, 'utf8');
        lastSavedXmlPath = targetXml;

        if (xmlPathBox) xmlPathBox.style.display = 'block';
        if (xmlPathText) xmlPathText.textContent = targetXml;

        showStatus('XML written! Importing into Premiere Pro...', 'info');

        const escaped = targetXml.replace(/\\/g, '\\\\');
        csInterface.evalScript(`SilenceSlashHost.importXml("${escaped}")`, (res) => {
          if (res && res.indexOf('ERROR') !== -1) {
            showStatus(res, 'error');
          } else {
            showStatus('Success! Slashed sequence opened in Premiere Pro.', 'success');
          }
        });
      });
      return;
    }

    // Browser fallback
    const blob = new Blob([xml], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.fileName.replace(/\.[^/.]+$/, '')}_silenceslash.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showStatus('Downloaded XML to Downloads folder.', 'success');
  });
}

// 7. "Open in File Explorer" Button
if (btnOpenExplorer) {
  btnOpenExplorer.addEventListener('click', () => {
    if (!lastSavedXmlPath) {
      showStatus('No XML file has been created yet.', 'info');
      return;
    }

    try {
      const { exec } = require('child_process');
      const isWin = process.platform === 'win32';
      if (isWin) {
        exec(`explorer.exe /select,"${lastSavedXmlPath}"`);
      } else {
        exec(`open -R "${lastSavedXmlPath}"`);
      }
      showStatus('Opened in File Explorer.', 'success');
      return;
    } catch(e) {}

    if (csInterface) {
      const escaped = lastSavedXmlPath.replace(/\\/g, '\\\\');
      csInterface.evalScript(`SilenceSlashHost.openInExplorer("${escaped}")`);
      showStatus('Opened folder.', 'success');
    }
  });
}

// 8. "Copy Path" Button
if (btnCopyPath) {
  btnCopyPath.addEventListener('click', () => {
    if (!lastSavedXmlPath) return;
    navigator.clipboard.writeText(lastSavedXmlPath).then(() => {
      showStatus('Path copied to clipboard!', 'success');
    }).catch(() => {
      showStatus(`Path: ${lastSavedXmlPath}`, 'info');
    });
  });
}

// 9. External Link Opener (Buy me a Tea, Ko-fi, GitHub)
document.querySelectorAll('.external-link').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const url = el.getAttribute('data-url') || el.getAttribute('href');
    if (!url || url === '#') return;

    if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) {
      window.cep.util.openURLInDefaultBrowser(url);
    } else if (csInterface && typeof csInterface.openURLInDefaultBrowser === 'function') {
      csInterface.openURLInDefaultBrowser(url);
    } else {
      try {
        const { exec } = require('child_process');
        const startCmd = process.platform === 'win32'
          ? `start "" "${url}"`
          : (process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
        exec(startCmd);
      } catch (err) {
        window.open(url, '_blank');
      }
    }
  });
});


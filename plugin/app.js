/**
 * SilenceSlash - UXP & CEP Panel Controller
 * Compatible with Adobe Premiere Pro V12 - V25+
 */

// Application state
const state = {
  file: null,
  filePath: null,
  audioBuffer: null,
  duration: 0,
  fps: 30,
  sampleRate: 48000,
  retainedIntervals: [],
  cutIntervals: [],
  stats: {}
};

// DOM Elements
const dropzone = document.getElementById('dropzone');
const filePicker = document.getElementById('filePicker');
const fileCard = document.getElementById('fileCard');
const fileName = document.getElementById('fileName');
const fileDuration = document.getElementById('fileDuration');
const fileFps = document.getElementById('fileFps');
const fileSampleRate = document.getElementById('fileSampleRate');
const btnRemoveFile = document.getElementById('btnRemoveFile');

const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdVal = document.getElementById('thresholdVal');
const minSilenceSlider = document.getElementById('minSilenceSlider');
const minSilenceVal = document.getElementById('minSilenceVal');
const paddingSlider = document.getElementById('paddingSlider');
const paddingVal = document.getElementById('paddingVal');
const treatmentSelect = document.getElementById('treatmentSelect');

const btnAnalyze = document.getElementById('btnAnalyze');
const timelineCard = document.getElementById('timelineCard');
const timelineCanvas = document.getElementById('timelineCanvas');
const statOriginal = document.getElementById('statOriginal');
const statTrimmed = document.getElementById('statTrimmed');
const statSaved = document.getElementById('statSaved');
const exportRow = document.getElementById('exportRow');
const btnExportXml = document.getElementById('btnExportXml');
const statusBox = document.getElementById('statusBox');

// Utility: show status message
function showStatus(msg, type = 'info') {
  statusBox.textContent = msg;
  statusBox.className = `status-msg status-${type}`;
  statusBox.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => {
      statusBox.style.display = 'none';
    }, 5000);
  }
}

// Slider live listeners
thresholdSlider.addEventListener('input', (e) => {
  thresholdVal.textContent = `${e.target.value} dBFS`;
  if (state.audioBuffer) debouncedReanalyze();
});

minSilenceSlider.addEventListener('input', (e) => {
  minSilenceVal.textContent = `${e.target.value} ms`;
  if (state.audioBuffer) debouncedReanalyze();
});

paddingSlider.addEventListener('input', (e) => {
  paddingVal.textContent = `${e.target.value} ms`;
  if (state.audioBuffer) debouncedReanalyze();
});

if (treatmentSelect) {
  treatmentSelect.addEventListener('change', () => {
    if (state.audioBuffer) renderTimeline();
  });
}

let debounceTimer = null;
function debouncedReanalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    analyzeAudio();
  }, 150);
}

// File drop & select handling
dropzone.addEventListener('click', () => filePicker.click());
filePicker.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    handleFileSelected(e.dataTransfer.files[0]);
  }
});

btnRemoveFile.addEventListener('click', () => {
  state.file = null;
  state.audioBuffer = null;
  fileCard.style.display = 'none';
  dropzone.style.display = 'block';
  btnAnalyze.disabled = true;
  timelineCard.style.display = 'none';
  exportRow.style.display = 'none';
  statusBox.style.display = 'none';
});

async function handleFileSelected(file) {
  state.file = file;
  state.filePath = file.path || file.name;
  fileName.textContent = file.name;
  dropzone.style.display = 'none';
  fileCard.style.display = 'block';
  btnAnalyze.disabled = true;

  showStatus('Loading and decoding audio data...', 'info');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    state.audioBuffer = decodedBuffer;
    state.duration = decodedBuffer.duration;
    state.sampleRate = decodedBuffer.sampleRate;
    state.fps = 30; // standard default, or derived if available

    const mins = Math.floor(state.duration / 60);
    const secs = (state.duration % 60).toFixed(1);
    fileDuration.textContent = `Duration: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
    fileSampleRate.textContent = `Rate: ${(state.sampleRate / 1000).toFixed(0)}kHz`;
    fileFps.textContent = `FPS: ${state.fps}`;

    btnAnalyze.disabled = false;
    showStatus('Audio loaded successfully. Click Slash Silence or adjust sliders.', 'success');
    analyzeAudio();
  } catch (err) {
    showStatus(`Failed to decode audio: ${err.message}`, 'error');
  }
}

btnAnalyze.addEventListener('click', () => analyzeAudio());

/**
 * Fast RMS-based audio silence detection
 */
function analyzeAudio() {
  if (!state.audioBuffer) return;

  const thresholdDb = parseFloat(thresholdSlider.value);
  const minSilenceSec = parseFloat(minSilenceSlider.value) / 1000;
  const paddingSec = parseFloat(paddingSlider.value) / 1000;

  // Convert dB to linear RMS threshold: threshold = 10^(dB/20)
  const rmsThreshold = Math.pow(10, thresholdDb / 20);

  const channelData = state.audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const sampleRate = state.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms analysis window

  const silences = [];
  let inSilence = false;
  let silenceStartSec = 0;

  for (let i = 0; i < totalSamples; i += windowSize) {
    const chunkEnd = Math.min(i + windowSize, totalSamples);
    let sumSquares = 0;
    for (let j = i; j < chunkEnd; j++) {
      sumSquares += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sumSquares / (chunkEnd - i));
    const currentTimeSec = i / sampleRate;

    if (rms < rmsThreshold) {
      if (!inSilence) {
        inSilence = true;
        silenceStartSec = currentTimeSec;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        const dur = currentTimeSec - silenceStartSec;
        if (dur >= minSilenceSec) {
          silences.push({ start: silenceStartSec, end: currentTimeSec, duration: dur });
        }
      }
    }
  }

  if (inSilence) {
    const dur = state.duration - silenceStartSec;
    if (dur >= minSilenceSec) {
      silences.push({ start: silenceStartSec, end: state.duration, duration: dur });
    }
  }

  // Derive retained speech intervals
  const rawSpeech = [];
  let cur = 0;
  for (const sil of silences) {
    if (sil.start > cur) {
      rawSpeech.push({ start: cur, end: sil.start });
    }
    cur = Math.max(cur, sil.end);
  }
  if (cur < state.duration) {
    rawSpeech.push({ start: cur, end: state.duration });
  }

  // Apply padding
  const padded = rawSpeech.map(sp => ({
    start: Math.max(0, sp.start - paddingSec),
    end: Math.min(state.duration, sp.end + paddingSec)
  }));

  // Merge overlapping intervals
  const merged = [];
  for (const sp of padded) {
    if (merged.length === 0) {
      merged.push({ ...sp });
    } else {
      const prev = merged[merged.length - 1];
      if (sp.start <= prev.end) {
        prev.end = Math.max(prev.end, sp.end);
      } else {
        merged.push({ ...sp });
      }
    }
  }

  // Quantize to frames
  const fps = state.fps;
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
    if (ret.start > cutCur) {
      cuts.push({ start: cutCur, end: ret.start, duration: ret.start - cutCur });
    }
    cutCur = Math.max(cutCur, ret.end);
  }
  if (cutCur < state.duration) {
    cuts.push({ start: cutCur, end: state.duration, duration: state.duration - cutCur });
  }
  state.cutIntervals = cuts;

  const totalRetainedSec = retained.reduce((a, b) => a + b.duration, 0);
  const totalSavedSec = Math.max(0, state.duration - totalRetainedSec);
  const percentSaved = state.duration > 0 ? ((totalSavedSec / state.duration) * 100).toFixed(1) : 0;

  state.stats = {
    original: state.duration,
    retained: totalRetainedSec,
    saved: totalSavedSec,
    percent: percentSaved
  };

  statOriginal.textContent = `${state.duration.toFixed(1)}s`;
  statTrimmed.textContent = `${totalRetainedSec.toFixed(1)}s`;
  statSaved.textContent = `${percentSaved}% (${totalSavedSec.toFixed(1)}s)`;

  timelineCard.style.display = 'block';
  exportRow.style.display = 'flex';

  renderTimeline();
}

/**
 * Render visual keep (green) vs cut (red) timeline canvas
 */
function renderTimeline() {
  const canvas = timelineCanvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const dur = state.duration;

  if (dur <= 0) return;

  // Fill background with cut red
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(0, 0, w, h);

  // Draw retained intervals in bright green
  ctx.fillStyle = '#22c55e';
  for (const ret of state.retainedIntervals) {
    const x = (ret.start / dur) * w;
    const itemW = Math.max(1, (ret.duration / dur) * w);
    ctx.fillRect(x, 0, itemW, h);
  }

  // Draw border lines between cuts
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (const ret of state.retainedIntervals) {
    const x1 = (ret.start / dur) * w;
    const x2 = (ret.end / dur) * w;
    ctx.fillRect(x1, 0, 1, h);
    ctx.fillRect(x2, 0, 1, h);
  }
}

/**
 * Generate FCP7 / Premiere Pro XML
 */
function buildXmlString() {
  const fileName = state.file.name;
  const fileUrl = `file://localhost/${(state.filePath || fileName).replace(/\\/g, '/')}`;
  const fps = state.fps;
  const treatment = treatmentSelect ? treatmentSelect.value : 'ripple-delete';
  const isRippleDelete = (treatment === 'ripple-delete');

  let totalFrames = 0;
  if (isRippleDelete) {
    totalFrames = state.retainedIntervals.reduce((a, b) => a + b.durationFrames, 0);
  } else {
    const last = state.retainedIntervals[state.retainedIntervals.length - 1];
    totalFrames = last ? last.endFrame : 0;
  }

  let currentTimelineFrame = 0;
  const videoClips = [];
  const audioClips1 = [];
  const audioClips2 = [];

  state.retainedIntervals.forEach((interval, idx) => {
    const clipId = `clipitem-${idx + 1}`;
    const start = isRippleDelete ? currentTimelineFrame : interval.startFrame;
    const end = isRippleDelete ? currentTimelineFrame + interval.durationFrames : interval.endFrame;

    videoClips.push(`
      <clipitem id="${clipId}-v">
        <name>${escapeXml(fileName)}</name>
        <duration>${totalFrames}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${start}</start>
        <end>${end}</end>
        <in>${interval.startFrame}</in>
        <out>${interval.endFrame}</out>
        <file id="file-1"/>
      </clipitem>`);

    audioClips1.push(`
      <clipitem id="${clipId}-a1">
        <name>${escapeXml(fileName)}</name>
        <duration>${totalFrames}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${start}</start>
        <end>${end}</end>
        <in>${interval.startFrame}</in>
        <out>${interval.endFrame}</out>
        <file id="file-1"/>
        <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
      </clipitem>`);

    audioClips2.push(`
      <clipitem id="${clipId}-a2">
        <name>${escapeXml(fileName)}</name>
        <duration>${totalFrames}</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${start}</start>
        <end>${end}</end>
        <in>${interval.startFrame}</in>
        <out>${interval.endFrame}</out>
        <file id="file-1"/>
        <sourcetrack><mediatype>audio</mediatype><trackindex>2</trackindex></sourcetrack>
      </clipitem>`);

    if (isRippleDelete) {
      currentTimelineFrame = end;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${escapeXml(fileName)} (SilenceSlash Cuts)</name>
    <duration>${totalFrames}</duration>
    <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          </samplecharacteristics>
        </format>
        <track>${videoClips.join('')}</track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics><depth>16</depth><samplerate>${state.sampleRate}</samplerate></samplecharacteristics>
        </format>
        <track>${audioClips1.join('')}</track>
        <track>${audioClips2.join('')}</track>
      </audio>
    </media>
  </sequence>
  <file id="file-1">
    <name>${escapeXml(fileName)}</name>
    <pathurl>${fileUrl}</pathurl>
    <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
    <duration>${totalFrames}</duration>
    <media>
      <video>
        <samplecharacteristics><width>1920</width><height>1080</height></samplecharacteristics>
      </video>
      <audio>
        <samplecharacteristics><depth>16</depth><samplerate>${state.sampleRate}</samplerate></samplecharacteristics>
        <channelcount>2</channelcount>
      </audio>
    </media>
  </file>
</xmeml>`;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Export XML / Apply Edits button listener
btnExportXml.addEventListener('click', async () => {
  const xmlContent = buildXmlString();

  // 1. CEP Environment (CSInterface - Premiere Pro CS6 through CC 2025+)
  if (window.__adobe_cep__) {
    try {
      const csInterface = new CSInterface();
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const tempPath = path.join(os.tmpdir(), `${state.file.name.replace(/\.[^/.]+$/, '')}_silenceslash.xml`);
      fs.writeFileSync(tempPath, xmlContent, 'utf8');

      // Call ExtendScript to import directly into Premiere Pro active project
      csInterface.evalScript(`SilenceSlashHost.importXml("${tempPath.replace(/\\/g, '\\\\')}")`, (res) => {
        if (res && res.indexOf('ERROR') !== -1) {
          showStatus(res, 'error');
        } else {
          showStatus('Successfully imported slashed sequence into Premiere Pro!', 'success');
        }
      });
      return;
    } catch (err) {
      console.warn('CEP import failed, falling back:', err);
    }
  }

  // 2. UXP Environment (Premiere Pro V15 - V25+)
  if (window.require) {
    try {
      const uxp = window.require('uxp');
      const fs = uxp.storage.localFileSystem;
      const file = await fs.getFileForSaving(`${state.file.name.replace(/\.[^/.]+$/, '')}_silenceslash.xml`, {
        types: ['xml']
      });
      if (file) {
        await file.write(xmlContent);
        showStatus(`XML saved to ${file.name}. Importing into Premiere Pro...`, 'success');

        if (window.app && window.app.project && window.app.project.importFiles) {
          window.app.project.importFiles([file.nativePath]);
        }
        return;
      }
    } catch (err) {
      console.warn('UXP native save skipped, falling back to browser download:', err);
    }
  }

  // 3. Browser download fallback
  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.file.name.replace(/\.[^/.]+$/, '')}_silenceslash.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showStatus('Premiere Pro XML downloaded! Import via File > Import in Premiere Pro.', 'success');
});

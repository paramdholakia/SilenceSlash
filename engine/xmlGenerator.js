const path = require('path');
const { pathToFileURL } = require('url');

/**
 * FCP7XMLGenerator
 * 
 * Generates Adobe Premiere Pro & Final Cut Pro XMEML Interchange sequences (version 5).
 * Formatted with explodedTracks="true", file-encoded URL spaces, pixelaspectratio,
 * and media-accurate duration/in/out frame bounds for 100% Premiere Pro importer compatibility.
 * 
 * Supports:
 * - 'ripple-delete': speech clips only, packed contiguously without gaps
 * - 'cut-around': both speech and silence clips kept on timeline with razor cuts, silence clips labeled Rose
 * - 'cut-around-muted': both speech and silence clips on timeline with razor cuts, silence clips disabled/muted
 * - 'delete-without-ripple': speech clips placed at original positions, leaving empty gaps
 */
class FCP7XMLGenerator {
  /**
   * Converts a local file path to an RFC-compliant file://localhost/ URL with encoded spaces.
   * @param {string} filePath
   * @returns {string}
   */
  static pathToFileUrl(filePath) {
    if (!filePath) return '';
    const norm = filePath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(norm)) {
      return `file://localhost/${encodeURI(norm)}`;
    }
    const clean = norm.startsWith('/') ? norm : `/${norm}`;
    return `file://localhost${encodeURI(clean)}`;
  }

  /**
   * Escape special XML characters.
   */
  static escapeXml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate XMEML v5 string compatible with all Adobe Premiere Pro releases.
   */
  static generate(params) {
    const {
      mediaPath,
      sequenceName = 'SilenceSlash Sequence',
      retainedIntervals = [],
      fps = 30,
      sampleRate = 48000,
      width = 1920,
      height = 1080,
      hasVideo = true,
      hasAudio = true,
      mediaDurationFrames = null,
      silenceTreatment = 'ripple-delete'
    } = params;

    const normalizedPath = mediaPath ? mediaPath.replace(/\\/g, '/') : '';
    const fileName = path.basename(normalizedPath);
    const fileUrl = this.pathToFileUrl(mediaPath);
    const timebase = Math.round(fps);
    const ntsc = (Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - 23.976) < 0.05 || Math.abs(fps - 59.94) < 0.05) ? 'TRUE' : 'FALSE';

    // Media file duration in frames (must be >= highest outFrame)
    const highestOutFrame = retainedIntervals.reduce((max, item) => Math.max(max, item.endFrame), 0);
    const totalFileFrames = mediaDurationFrames ? Math.max(mediaDurationFrames, highestOutFrame) : highestOutFrame;

    // Build timeline items according to chosen treatment
    const isCutAround = (silenceTreatment === 'cut-around' || silenceTreatment === 'cut-around-muted');
    const isRippleDelete = (silenceTreatment === 'ripple-delete');
    const isMutedSilence = (silenceTreatment === 'cut-around-muted');

    let timelineItems = [];

    if (isCutAround) {
      // Build contiguous chain of speech and silence segments
      let curFrame = 0;
      for (const ret of retainedIntervals) {
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
    } else if (isRippleDelete) {
      let curTimeline = 0;
      for (const ret of retainedIntervals) {
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
      for (const ret of retainedIntervals) {
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

    // Determine sequence duration in frames
    let sequenceDurationFrames = 0;
    if (timelineItems.length > 0) {
      const last = timelineItems[timelineItems.length - 1];
      sequenceDurationFrames = last.timelineEnd;
    }

    const videoClipItems = [];
    const audioClipItems1 = [];
    const audioClipItems2 = [];

    timelineItems.forEach((item, index) => {
      const clipIdx = index + 1;
      const clipId = `clipitem-${clipIdx}`;
      const inFrame = item.startFrame;
      const outFrame = item.endFrame;
      const durFrames = item.durationFrames;
      const timelineStart = item.timelineStart;
      const timelineEnd = item.timelineEnd;

      // Primary file definition embedded inside clipitem 1
      const isFirstItem = (index === 0);
      const fileXml = isFirstItem ? `
            <file id="file-1">
              <name>${this.escapeXml(fileName)}</name>
              <pathurl>${fileUrl}</pathurl>
              <rate>
                <timebase>${timebase}</timebase>
                <ntsc>${ntsc}</ntsc>
              </rate>
              <duration>${totalFileFrames}</duration>
              <media>
                ${hasVideo ? `<video>
                  <samplecharacteristics>
                    <width>${width}</width>
                    <height>${height}</height>
                    <pixelaspectratio>square</pixelaspectratio>
                  </samplecharacteristics>
                </video>` : ''}
                ${hasAudio ? `<audio>
                  <samplecharacteristics>
                    <depth>16</depth>
                    <samplerate>${sampleRate}</samplerate>
                  </samplecharacteristics>
                  <channelcount>2</channelcount>
                </audio>` : ''}
              </media>
            </file>` : `<file id="file-1" />`;

      // Track linking tags
      const linkXml = `
            <link>
              <linkclipref>${clipId}-v</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${clipIdx}</clipindex>
              <groupindex>1</groupindex>
            </link>
            <link>
              <linkclipref>${clipId}-a1</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${clipIdx}</clipindex>
              <groupindex>1</groupindex>
            </link>
            <link>
              <linkclipref>${clipId}-a2</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>2</trackindex>
              <clipindex>${clipIdx}</clipindex>
              <groupindex>1</groupindex>
            </link>`;

      if (hasVideo) {
        videoClipItems.push(`
          <clipitem id="${clipId}-v">
            <name>${this.escapeXml(item.name)}</name>
            <enabled>${item.enabled}</enabled>
            <duration>${durFrames}</duration>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
            </rate>
            <start>${timelineStart}</start>
            <end>${timelineEnd}</end>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            ${fileXml}
            <labels>
              <label2>${item.label}</label2>
            </labels>
            ${hasAudio ? linkXml : ''}
          </clipitem>`);
      }

      if (hasAudio) {
        audioClipItems1.push(`
          <clipitem id="${clipId}-a1">
            <name>${this.escapeXml(item.name)}</name>
            <enabled>${item.enabled}</enabled>
            <duration>${durFrames}</duration>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
            </rate>
            <start>${timelineStart}</start>
            <end>${timelineEnd}</end>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            ${(!hasVideo && isFirstItem) ? fileXml : '<file id="file-1" />'}
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels>
              <label2>${item.label}</label2>
            </labels>
            ${linkXml}
          </clipitem>`);

        audioClipItems2.push(`
          <clipitem id="${clipId}-a2">
            <name>${this.escapeXml(item.name)}</name>
            <enabled>${item.enabled}</enabled>
            <duration>${durFrames}</duration>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
            </rate>
            <start>${timelineStart}</start>
            <end>${timelineEnd}</end>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            <file id="file-1" />
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>2</trackindex>
            </sourcetrack>
            <labels>
              <label2>${item.label}</label2>
            </labels>
            ${linkXml}
          </clipitem>`);
      }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence explodedTracks="true">
    <name>${this.escapeXml(sequenceName)}</name>
    <duration>${sequenceDurationFrames}</duration>
    <rate>
      <timebase>${timebase}</timebase>
      <ntsc>${ntsc}</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <pixelaspectratio>square</pixelaspectratio>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
          ${videoClipItems.join('')}
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>${sampleRate}</samplerate>
          </samplecharacteristics>
        </format>
        <track>
          ${audioClipItems1.join('')}
        </track>
        <track>
          ${audioClipItems2.join('')}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
  }
}

module.exports = { FCP7XMLGenerator };

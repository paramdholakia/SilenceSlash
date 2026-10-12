#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { SilenceDetector, FCP7XMLGenerator } = require('./index');

function printUsage() {
  console.log(`
SilenceSlash CLI
Automatic Silence Removal & Adobe Premiere Pro Timeline Slasher

Usage:
  node engine/cli.js <input-media-file> [options]

Options:
  -o, --output <path>            Output .xml file path (Default: [input]_silenceslash.xml)
  --threshold <dB>               Silence threshold in dBFS (Default: -30)
  --min-silence <seconds>        Minimum silence duration to remove (Default: 0.5)
  --min-audible <seconds>        Minimum audible duration to keep (Default: 0.1)
  --padding <seconds>            Padding applied before and after speech (Default: 0.15)
  --padding-left <seconds>       Padding before speech (overrides --padding)
  --padding-right <seconds>      Padding after speech (overrides --padding)
  --silence-treatment <mode>     ripple-delete (default) or cut-around (leave gaps)
  --fps <number>                 Frame rate override (Default: probed from media)
  --json                         Output analysis result as JSON to stdout
  -h, --help                     Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  let inputFile = null;
  let outputFile = null;
  let threshold = -30;
  let minSilence = 0.5;
  let minAudible = 0.1;
  let padding = 0.15;
  let paddingLeft = null;
  let paddingRight = null;
  let silenceTreatment = 'ripple-delete';
  let fpsOverride = null;
  let outputJson = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      outputFile = args[++i];
    } else if (arg === '--threshold') {
      threshold = parseFloat(args[++i]);
    } else if (arg === '--min-silence') {
      minSilence = parseFloat(args[++i]);
    } else if (arg === '--min-audible') {
      minAudible = parseFloat(args[++i]);
    } else if (arg === '--padding') {
      padding = parseFloat(args[++i]);
    } else if (arg === '--padding-left') {
      paddingLeft = parseFloat(args[++i]);
    } else if (arg === '--padding-right') {
      paddingRight = parseFloat(args[++i]);
    } else if (arg === '--silence-treatment') {
      silenceTreatment = args[++i];
    } else if (arg === '--fps') {
      fpsOverride = parseFloat(args[++i]);
    } else if (arg === '--json') {
      outputJson = true;
    } else if (!arg.startsWith('-') && !inputFile) {
      inputFile = arg;
    }
  }

  if (!inputFile) {
    console.error('Error: No input media file specified.');
    process.exit(1);
  }

  const absInputPath = path.resolve(inputFile);
  if (!fs.existsSync(absInputPath)) {
    console.error(`Error: File does not exist: ${absInputPath}`);
    process.exit(1);
  }

  if (!outputFile) {
    const ext = path.extname(absInputPath);
    const base = path.basename(absInputPath, ext);
    outputFile = path.join(path.dirname(absInputPath), `${base}_silenceslash.xml`);
  }
  const absOutputPath = path.resolve(outputFile);

  const finalPadLeft = paddingLeft !== null ? paddingLeft : padding;
  const finalPadRight = paddingRight !== null ? paddingRight : padding;

  console.log(`Analyzing: ${absInputPath}`);
  console.log(`Config: Threshold = ${threshold} dBFS, Min Silence = ${minSilence}s, Padding = [L: ${finalPadLeft}s, R: ${finalPadRight}s], Mode = ${silenceTreatment}`);

  const detector = new SilenceDetector();
  try {
    const result = await detector.process(absInputPath, {
      thresholdDb: threshold,
      minSilenceDuration: minSilence,
      minAudibleDuration: minAudible,
      paddingLeft: finalPadLeft,
      paddingRight: finalPadRight
    });

    if (fpsOverride) {
      result.media.fps = fpsOverride;
    }

    console.log(`\nResults:`);
    console.log(`- Original Duration:  ${result.stats.originalDuration}s`);
    console.log(`- Final Duration:     ${result.stats.finalDuration}s`);
    console.log(`- Silence Removed:    ${result.stats.cutDuration}s (${result.stats.cutPercentage}%)`);
    console.log(`- Retained Intervals: ${result.retained.length}`);
    console.log(`- Cut Intervals:       ${result.stats.totalCuts}`);

    const xml = FCP7XMLGenerator.generate({
      mediaPath: absInputPath,
      sequenceName: `${path.basename(absInputPath, path.extname(absInputPath))} (SilenceSlash Cuts)`,
      retainedIntervals: result.retained,
      fps: result.media.fps,
      sampleRate: result.media.sampleRate,
      hasVideo: result.media.hasVideo,
      hasAudio: result.media.hasAudio,
      silenceTreatment
    });

    fs.writeFileSync(absOutputPath, xml, 'utf8');
    console.log(`\nSuccessfully exported Premiere Pro XML to: ${absOutputPath}`);

    if (outputJson) {
      console.log('\n--- JSON RESULT ---');
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`Analysis failed: ${err.message}`);
    process.exit(1);
  }
}

main();

<p align="center">
  <img src="images/silenceslash.svg" width="128" height="128" alt="SilenceSlash Logo" />
</p>

# SilenceSlash

> Automated silence detection and cutting for Adobe Premiere Pro.  
> Made with love by Param Dholakia.

[![CI](https://github.com/paramdholakia/SilenceSlash/actions/workflows/ci.yml/badge.svg)](https://github.com/paramdholakia/SilenceSlash/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: v18+](https://img.shields.io/badge/node-v18+-green.svg)](https://nodejs.org/)
[![Adobe Premiere Pro](https://img.shields.io/badge/Adobe%20Premiere%20Pro-CS6%20--%202025+-purple.svg)](https://helpx.adobe.com/premiere-pro/user-guide.html)

SilenceSlash is an open-source Adobe Premiere Pro extension and CLI tool that automatically detects silence from video and audio, creating frame-accurate cuts and trimmed sequences in seconds.

Built entirely from the ground up as a clean-room, open-source tool with zero proprietary dependencies.

---

## Key Features

- **In-App Premiere Pro Workflow**:
  - **Grab Active Premiere Clip**: Ingests the media clip directly from your active sequence or Project panel selection with a single click.
  - **Automatic Sequence Opening**: Generates and immediately opens the slashed sequence in your Timeline panel without nesting or manual dragging.
- **Auto Detect Mode**:
  - Automatically samples audio dynamic range to calculate the optimal silence threshold (dBFS) and minimum duration for any recording.
- **4 Timeline Cutting Modes**:
  1. **Ripple Delete (Default)**: Slashes silences and ripples all speech segments contiguously into a tight, edited sequence.
  2. **Cut Around (Keep All Media)**: Places razor cuts around all silences while preserving the original timeline duration. Silence segments are color-coded (Rose label) for instant review and selective deletion.
  3. **Cut Around & Mute**: Razor cuts around silences and automatically disables the silent clips so they are muted on playback.
  4. **Delete Without Ripple**: Removes silence intervals and leaves empty gaps in the timeline at their original timecode.
- **Frame-Accurate A/V Synchronization & Linking**:
  - Frame quantization ensures cuts align with video frame boundaries.
  - Explicit XMEML link tags lock video and audio tracks together so they never drift out of sync.
- **Interactive Waveform Visualizer**:
  - High-DPI, dynamically resizable waveform preview showing green retained speech regions, red silence regions, and razor-cut markers.
  - Adapts fluidly whether docked in a narrow side pane or stretched across a wide bottom dock.
- **Standalone CLI Engine**:
  - Headless batch processing with FFmpeg for video editors, automated pipelines, and cloud render workflows.
- **Non-Destructive**: Original source footage is never modified; SilenceSlash creates new sequences or XML interchange files.

---

## Repository Structure

```
SilenceSlash/
├── cep/                          # Premiere Pro CEP Panel Extension (CS6 - CC 2025+)
│   ├── CSXS/manifest.xml         # CEP extension manifest
│   ├── jsx/host.jsx              # ExtendScript Premiere Pro DOM interface
│   ├── index.html                # Dark-themed responsive UI
│   ├── styles.css                # Premiere CC dark design system
│   ├── app.js                    # Panel controller & audio analyzer
│   ├── images/                   # Extension icons & logos
│   └── CSInterface.js            # Official Adobe CEP library
├── plugin/                       # Premiere Pro UXP Extension (V15+)
│   ├── manifest.json
│   ├── index.html
│   └── app.js
├── engine/                       # Core Node.js & FFmpeg Engine
│   ├── index.js                  # Engine entrypoint
│   ├── timelineModel.js          # Speech inversion, padding & quantization
│   ├── silenceDetector.js        # FFmpeg silencedetect & probe runner
│   ├── xmlGenerator.js           # Premiere Pro / FCP7 XMEML v5 generator
│   └── cli.js                    # Standalone Command-Line Interface
├── images/                       # Project logos (PNG & SVG)
│   ├── Logo.png
│   └── silenceslash.svg
├── scripts/                      # Release and packaging utilities
│   └── package.js                # Zips distribution bundle
├── tests/                        # Automated unit & integration test suite
│   ├── timelineModel.test.js
│   ├── xmlGenerator.test.js
│   └── detector.integration.test.js
├── docs/                         # Technical research & architecture specs
│   └── research.md
├── CONTRIBUTING.md               # Open source contribution guidelines
├── THIRD_PARTY_LICENSES.md       # Third-party license inventory
├── LICENSE                       # MIT License
└── package.json
```

---

## Quick Start & Installation

### Option A: Install in Adobe Premiere Pro

1. Download the latest release zip from Releases (or clone the repository).
2. Copy the `cep/` folder to your Adobe CEP extensions folder, renaming the directory to `SilenceSlash`:
   - **Windows**:
     `%APPDATA%\Adobe\CEP\extensions\SilenceSlash`
     *(Press Win+R, paste the path above, and press Enter)*
   - **macOS**:
     `~/Library/Application Support/Adobe/CEP/extensions/SilenceSlash`
3. If running unsigned extensions for the first time, enable CEP Developer Mode:
   - **Windows (PowerShell)**:
     ```powershell
     Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.9" -Name "PlayerDebugMode" -Value "1" -Force
     Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.10" -Name "PlayerDebugMode" -Value "1" -Force
     Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.11" -Name "PlayerDebugMode" -Value "1" -Force
     ```
   - **macOS (Terminal)**:
     ```bash
     defaults write com.adobe.CSXS.9 PlayerDebugMode 1
     defaults write com.adobe.CSXS.10 PlayerDebugMode 1
     defaults write com.adobe.CSXS.11 PlayerDebugMode 1
     ```
4. Restart Adobe Premiere Pro, and open **Window > Extensions > SilenceSlash**.

---

### Option B: Standalone CLI

SilenceSlash can be run directly from any terminal or automated batch script:

#### Requirements
- Node.js (v18+)
- FFmpeg on your system PATH

#### Basic CLI Command
```bash
node engine/cli.js "path/to/video.mp4" -o "output.xml"
```

#### CLI Options
```text
Usage: silenceslash [options] <media-file>

Options:
  -o, --output <path>            Output .xml file path (Default: [input]_silenceslash.xml)
  --threshold <dB>               Silence threshold in dBFS (Default: -30)
  --min-silence <seconds>        Minimum silence duration to remove (Default: 0.5)
  --min-audible <seconds>        Minimum audible duration to keep (Default: 0.1)
  --padding <seconds>            Padding applied before and after speech (Default: 0.15)
  --padding-left <seconds>       Padding before speech (overrides --padding)
  --padding-right <seconds>      Padding after speech (overrides --padding)
  --silence-treatment <mode>     ripple-delete (default), cut-around, cut-around-muted, delete-without-ripple
  --fps <number>                 Frame rate override (Default: probed from media)
  --json                         Output analysis result as JSON to stdout
  -h, --help                     Display help
```

---

## Testing

Run the automated test suite with Node's native test runner:

```bash
npm test
```

Build a standalone distribution zip bundle:

```bash
npm run package
```

---

## Contributing

We welcome community contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on environment setup, testing, and clean-room policy.

## License

SilenceSlash is licensed under the [MIT License](LICENSE).

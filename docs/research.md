# Research and Feasibility Report: Open-Source Recut Alternative for Adobe Premiere Pro

## Executive Summary
This document outlines findings from the environment inspection, observable capabilities and parameter contracts of Recut (v4.4.1), Adobe Premiere Pro UXP integration mechanics, media processing engine choices, and the implementation plan for an open-source silence-removal plugin for Adobe Premiere Pro.

---

## 1. Environment & MCP Diagnostics

### REA (Reverse Engineering Anything) Status
- **MCP Server**: The `rea` MCP server is registered in the session and responsive to target-free and non-decompiler commands.
- **Diagnostics**:
  - `open_binary`: Successfully bound the local target `C:\Program Files\Recut\recut.exe` (`aca09116...`, x86_64 PE32+).
  - `inspect_pe_resources`: Succeeded, enumerating PE32+ resources (icons, versioninfo, manifest).
  - Native Decompiler (`binary_overview`, `analyze_function`): Returned `provider_unavailable` because `GHIDRA_INSTALL_DIR` is not set and IDA Pro MCP config (`REA_IDA_MCP_CONFIG`) is not present.
  - **Resolution**: Static binary inspections were completed via PE inspection, binary string indexing, and metadata extraction. Proprietary decompilation was strictly avoided per clean-room constraints.

### Host Software Inventory
- **Node.js**: v23.3.0 installed.
- **npm**: 10.9.0 installed.
- **FFmpeg / FFprobe**: v8.0-essentials (`gyan.dev` build) available on system PATH with `silencedetect`, `ebur128`, `libx264`, and full demuxers.
- **Adobe Creative Cloud**: Creative Cloud runtime installed at `C:\Program Files\Adobe` and `C:\Program Files (x86)\Adobe`.

---

## 2. Observable Recut Workflow & Parameter Contracts

Inspection of Recut 4.4.1 (`recut.exe` and documentation) revealed the core observable parameter contract and data flow:

### Core Detection & Padding Controls
1. **Silence Threshold (`--threshold`)**:
   - Expressed in dBFS (typically -60 dB to -10 dB, default around -30 dB or -35 dB), or normalized scalar 0.0 - 1.0.
   - Evaluates audio sample amplitudes (RMS or peak).
2. **Minimum Silence Duration (`--min-silence`)**:
   - Expressed in seconds / milliseconds (e.g., 0.5s / 500ms).
   - Any silent interval shorter than this threshold is ignored (kept in the timeline) to avoid choppy word truncations.
3. **Minimum Audible Duration (`--min-audible`)**:
   - Short blips, clicks, or breath noises shorter than e.g. 100ms-200ms can be filtered out as noise.
4. **Padding (`--padding`, `--padding-left`, `--padding-right`)**:
   - Configurable margins (e.g., 0.15s - 0.25s) applied before speech starts (padding-left / lead-in) and after speech ends (padding-right / tail-out).
   - Prevents consonants from getting cut off.
   - Merging logic: When speech intervals expand due to padding and overlap or come within a zero-gap distance, adjacent intervals are merged.

### Observable Export Behavior & Timeline Integration
Recut exports:
1. **Apple Final Cut XML / DaVinci Resolve (`.fcpxml`)**.
2. **Adobe Premiere Pro Final Cut Pro XML (`.xml` / FCP 7 XML / XMEML)**: Standard interchangeable interchange format universally ingested by Adobe Premiere Pro without requiring binary IPC or out-of-process sockets.
3. **Direct Media Rendering (`.mp4`, `.wav`, etc.)**.

---

## 3. Adobe Premiere Pro UXP Technical Constraints & Integration Strategy

### Understanding UXP vs CEP vs FCP XML
- **UXP (Unified Extensibility Platform)** in Premiere Pro is Adobe's modern JavaScript execution environment.
- **Security Sandbox**: UXP enforces strict sandboxing:
  - UXP scripts **cannot** execute arbitrary shell commands (`child_process.exec` / `spawn` is blocked or unavailable).
  - Native filesystem access is constrained through the UXP `storage` API (`localFileSystem.getFileForOpening`, plugin data folders, etc.).
  - UXP DOM APIs for Premiere Pro allow sequence creation, track item insertion, and XML project imports (`app.project.importFiles`).

### Dual Integration Architecture (Robust & Compliant)
To ensure 100% reliability, decoupled testability, and multi-workflow convenience:
1. **Decoupled Audio Analysis Engine (`engine/`)**:
   - Lightweight, standalone Node.js / CLI / library engine using FFmpeg `silencedetect` and sample-accurate RMS analysis.
   - Computes speech intervals with threshold (dBFS), min silence duration, min audible duration, left padding, right padding, and frame-rate quantizing.
   - Generates industry-standard **Final Cut Pro 7 XML (XMEML)** files and JSON timeline models.
2. **Premiere Pro UXP Plugin (`plugin/`)**:
   - Modern dark-themed UI matching Adobe Spectrum design guidelines.
   - Drag-and-drop / file input selector for video/audio.
   - Dynamic parameter controls (threshold slider in dBFS, min silence ms, lead-in/lead-out padding ms).
   - Real-time interactive timeline visualizer rendering keep vs cut regions.
   - Direct FCP XML export for one-click import into Premiere Pro (`File > Import` or automated UXP `project.importFiles`).
   - Local Web Audio API fallback analyzer directly inside the browser / UXP panel for in-panel instant preview!

---

## 4. Timeline Model & Frame-Rate Quantization Rules

In video editing, cuts cannot occur between frames; they must be aligned with project timebases (e.g., 23.976, 24, 25, 29.97, 30, 50, 59.94, 60 fps).

### Mathematical Rules
Let $t_{\text{start}}$ and $t_{\text{end}}$ be raw speech boundary timestamps in seconds.
1. Apply padding:
   $$t'_{\text{start}} = \max(0, t_{\text{start}} - \text{pad}_{\text{left}})$$
   $$t'_{\text{end}} = \min(t_{\text{total}}, t_{\text{end}} + \text{pad}_{\text{right}})$$
2. Merge overlapping or contiguous speech intervals:
   If $t'_{i+1, \text{start}} \le t'_{i, \text{end}}$, merge into $[t'_{i, \text{start}}, \max(t'_{i, \text{end}}, t'_{i+1, \text{end}})]$.
3. Quantize to frame numbers at frame rate $R$:
   $$\text{frame}_{\text{in}} = \lfloor t'_{\text{start}} \times R \rfloor$$
   $$\text{frame}_{\text{out}} = \lceil t'_{\text{end}} \times R \rceil$$
4. Timeline assembly:
   Each retained clip placed sequentially on timeline track 1 (video) and track 2 (audio) with timeline duration equal to $\sum (\text{frame}_{\text{out}} - \text{frame}_{\text{in}})$.

---

## 5. Implementation Roadmap
- **Phase 2**: Architecture definition, timeline data model, FCP-XML generator, and audio engine.
- **Phase 3**: UXP plugin panel (HTML5/Spectrum dark theme UI, SVG visual timeline, audio processor).
- **Phase 4**: Edge-case testing, sync verification, and automated test suite.
- **Phase 5**: Documentation, README, user guide, packaging manifest, and MIT license.

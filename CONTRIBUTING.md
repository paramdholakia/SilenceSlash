# Contributing Guidelines

Thank you for your interest in contributing to the Open-Source Recut Alternative for Adobe Premiere Pro!

## Clean-Room Engineering Policy
To protect the open-source integrity of this project:
- **Do not contribute proprietary code, reverse-engineered binaries, or proprietary internal algorithms from commercial software.**
- All contributions must be original works authored by you or derived from permissive open-source licenses compatible with MIT.
- Audio detection algorithms should adhere to standard digital signal processing (DSP) methodologies, Web Audio API, or standard FFmpeg audio filters.

## Development Setup

1. **Prerequisites**:
   - Node.js (v18+ or v20+)
   - FFmpeg (optional, required for the CLI engine)
   - Adobe Premiere Pro (v22.0+ or v23+/v24+ with UXP Developer Tool)

2. **Run Tests**:
   ```bash
   npm test
   ```

3. **Run CLI**:
   ```bash
   node engine/cli.js "path/to/video.mp4" --threshold -30 --padding 0.15
   ```

## Submitting Pull Requests
1. Ensure all unit and integration tests pass (`npm test`).
2. Adhere to clear code style and include test coverage for new features.
3. Open a Pull Request detailing the problem and proposed solution.

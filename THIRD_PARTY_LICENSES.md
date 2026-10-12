# Third-Party Licenses and Dependencies

This project relies on standard open-source tools, specifications, and libraries. Below is an inventory of third-party components and their licenses.

## 1. Runtime Dependencies & Specifications

| Component | Purpose | License | Source |
| :--- | :--- | :--- | :--- |
| **Node.js Built-in Modules** (`child_process`, `fs`, `path`, `node:test`, `node:assert`) | CLI execution, process management, test suite runner | MIT / Node.js License | [nodejs.org](https://nodejs.org/) |
| **Web Audio API** (`AudioContext`, `decodeAudioData`) | In-panel client-side audio decoding and RMS silence detection | W3C Software and Document Notice and License | [W3C Spec](https://www.w3.org/TR/webaudio/) |
| **Final Cut Pro 7 XML / XMEML Interchange Format** | Interchange schema for Adobe Premiere Pro timeline import | Public Domain / Open Interchange Specification | Apple / Adobe Documentation |
| **Adobe UXP (Unified Extensibility Platform)** | Host plugin container and DOM integration APIs | Adobe Developer Terms & Conditions | [Adobe Developer](https://developer.adobe.com/premiere-pro/uxp/) |

## 2. External Tools

| Tool | Purpose | License |
| :--- | :--- | :--- |
| **FFmpeg & FFprobe** | Optional CLI media probing and `silencedetect` audio filtering | LGPL v2.1+ / GPL v2+ (depending on build flags). Distributed externally by end users. |

---
*Clean-Room Statement*: No proprietary source code, headers, binary assets, or trade secrets from Recut were copied or embedded into this repository. All models, parsers, and interfaces were implemented independently based on standard signal processing mathematics, public documentation, and open interchange standards.

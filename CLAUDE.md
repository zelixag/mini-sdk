# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **XmovAvatar (有灵离线数字人 JS-SDK)** - an offline digital human/avatar SDK that provides real-time digital human rendering and interaction capabilities. It supports both **Web browsers** and **WeChat Mini Programs**.

**Key sections in this file:** Development commands, architecture overview (Web SDK in `src/`, Mini Program SDK in `miniprogram-sdk/`), directory structure, key architectural decisions (protobuf, WebSocket, WebGL rendering), build system (microbundle, Vite, Rollup), branch strategy.

## Development Commands

```bash
# Install dependencies (root + app)
pnpm install
cd app/ && pnpm install

# Development
pnpm sdk      # Watch SDK with hot reload
pnpm app      # Run demo app (http://localhost:5173)

# Build
pnpm build    # Build and publish SDK
pnpm lite     # Build Lite version
pnpm proto    # Generate protobuf files
```

## Architecture

### Two SDK Variants

| Directory | Description |
|-----------|-------------|
| `src/` | Web SDK (browser) |
| `miniprogram-sdk/` | WeChat Mini Program SDK |

### Web SDK Structure (`src/`)

```
src/
├── baseRender/       # Rendering layer (AudioRenderer, AvatarRenderer, UIRenderer)
├── control/          # RenderScheduler, DataCacheQueue, TTS audio
├── modules/          # ResourceManager, TrackRenderer, network, cache
├── types/            # TypeScript definitions
├── utils/            # GL, Math, audio, request, DataInterface
├── view/             # DebugOverlay
├── worker/           # Video decoding Web Worker
└── proto/            # Protobuf schemas (face_data.proto)
```

### Mini Program SDK Structure (`miniprogram-sdk/src/`)

```
miniprogram-sdk/src/
├── adapters/         # Platform adapters (Canvas, Audio, WebSocket)
├── baseRender/       # AvatarRendererMP (reimplemented)
├── control/          # RenderSchedulerMP, DataCacheQueueMP, LipSyncControllerMP
├── core/             # Lipsync and face frame alignment
├── decoders/         # Face/body data decoders
├── modules/          # ResourceManagerMP, face-signal-adapter
├── utils/            # GLDeviceMP, GLPipelineMP, DataInterfaceMP (reimplemented)
└── types/            # Type definitions (reuses Web SDK types)
```

### Key Architectural Decisions

1. **Two SDK Implementations**: Web and Mini Program SDKs share types and protobuf but have separate rendering pipelines due to platform API differences (Canvas/WebGL, Workers, DOM).

2. **Protobuf Data Protocol**: Face/body data uses Protocol Buffers (`src/proto/face_data.proto`) for efficient serialization.

3. **WebSocket Communication**: Real-time communication uses TTSA (Text-to-Speech Audio) WebSocket protocol via Socket.IO.

4. **WebGL Rendering Pipeline**: Both SDKs use WebGL for avatar rendering, but Mini Program version (`GLPipelineMP`) is reimplemented due to Canvas API differences.

## Build System

- **SDK**: Uses `microbundle` for bundling (outputs: CJS, ESM, UMD)
- **Demo App**: Uses Vite + Vue 3 (in `app/` directory)
- **Mini Program**: Uses Rollup with custom plugins for polyfilling and code replacement

## Branch Strategy

- `feature/*` - Development branches
- `develop` - Alpha releases
- `release` - Pre-release (beta)
- `master` - Production release

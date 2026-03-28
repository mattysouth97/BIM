---
created: "2026-03-28T00:12:15.857Z"
title: Production hardening for v2.0 release
area: general
files: []
---

## Problem

The app has grown from a simple building ledger viewer to a full BIM authoring environment across 10 phases. Many features were built rapidly with subagents and lack production-grade polish:

- No error boundaries around R3F Canvas or API calls
- No loading skeletons for heavy 3D operations (layer generation, building rebuild)
- Mobile responsiveness untested — config panel, layer panel, energy cards may overlap
- Performance: 14-layer system + procedural building + annotations may cause frame drops on lower-end hardware
- No graceful degradation when WebGL context is lost
- No user feedback on authoring operations (wall drawn, component placed, annotation created)
- Zustand stores (7+) not tested for edge cases (empty state, rapid updates)

## Solution

Dedicated production hardening phase before v2.0 ships:
- Add React ErrorBoundary around Canvas and key panels
- Add Suspense fallbacks with skeleton UI for lazy components
- Test and fix mobile layout (responsive breakpoints for panels)
- Profile and optimize: InstancedMesh counts, layer dispose/regenerate cycles
- Add toast notifications for authoring actions (using sonner — already in project)
- WebGL context loss handler with recovery
- Consider this as a separate milestone or phase before v2.0 feature work

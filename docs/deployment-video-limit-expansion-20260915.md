# Video Tool Limit Expansion Deployment — 2026-09-15

- Release ID: `video-limits-20260915-9589094`
- Released at: `2026-09-15T13:20:48+08:00`
- Source commit: `9589094 feat: expand local video input limits`
- Rollback snapshot: `/opt/nikai-ai-backups/releases/release-20260915-132033-video-limits.tgz`

## Published behavior

- Video to GIF accepts source files up to 500MB and retains its existing GIF frame-work limit.
- Video crop accepts files up to 500MB, 30 minutes, and a 3840px longest edge.
- Video mask accepts files up to 500MB, 30 minutes, and a 3840px longest edge.
- Crop and mask exports time out after 30 minutes.

## Verification evidence

- Local suite: 134 tests passed, 0 failed.
- Production release suite: 113 tests passed, 0 failed.
- Published SHA-256 comparison: all 14 files matched.
- Services: `nikai-ai.service` active; `nginx` active.
- Readiness: database ready, API status `ok`.
- Origin routes returned HTTP 200:
  - `/utilities/video-to-gif`
  - `/utilities/video-crop`
  - `/utilities/video-mask`
  - `/video-input-limits.js`
- Browser QA: desktop and 375px mobile layouts showed the new limits, loaded versioned modules without console errors, and had no horizontal overflow.

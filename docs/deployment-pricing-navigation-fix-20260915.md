# Pricing Navigation Fix Deployment — 2026-09-15

- Release ID: `pricing-navigation-20260915-4719001`
- Released at: `2026-09-15T15:08:49+08:00`
- Source commit: `4719001 fix: restore pricing page navigation`
- Rollback snapshot: `/opt/nikai-ai-backups/releases/release-20260915-150834-pricing-navi.tgz`

The video pricing page now includes the shared site header, highlights the current pricing navigation item, and exposes a direct “返回泥壳AI工具站” action. The responsive navigation breakpoint now matches the breakpoint that hides the desktop navigation, eliminating the 1101–1280px gap where neither navigation nor menu button was visible.

Verification: 134 local tests passed; 114 production tests passed; all 5 release hashes matched; application and Nginx were active; desktop navigation, 1280px menu expansion, homepage return action, console output, and horizontal page fit passed browser QA.

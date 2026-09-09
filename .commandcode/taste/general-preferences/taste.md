# General Preferences
- Communicates in Chinese (简体中文). Confidence: 0.95
- Provides detailed bug reports with exact error URLs, HTTP status codes, and expected behavior descriptions. Confidence: 0.8
- Asks "why" questions about bugs to understand root causes, not just requesting patches. Confidence: 0.8
- Expects new UI features to strictly follow the project's existing design system (e.g. M3E spec) and reuse existing components (SegmentedButton, IconButton, etc.) rather than custom/ad-hoc styling. Will call out ugly or off-pattern implementations. Confidence: 0.9
- Prefers agents to study similar existing pages/components before implementing new UI, referencing established patterns as the source of truth. Confidence: 0.85
- Expects Material Symbols icon names to be validated against what the project actually uses; do not guess icon names that may render incorrectly (e.g. as circles or unexpected glyphs). Use grep on existing codebase to find working icon names first. Confidence: 0.85
- Sensitive to subtle visual glitches and flashes (FOUC) — e.g. a brief flash of all categories before the filtered view appears when switching tabs, and text rendering before styles load on first entry to a page. Considers these worth fixing even when they do not affect functionality and the flash is brief, and wants the root cause diagnosed (including distinguishing dev vs. production/preview behavior) rather than the flash tolerated. Confidence: 0.85

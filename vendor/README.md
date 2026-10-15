# Mention publishing SDK artifacts

These unpublished packages are built from Mention branch `codex/confirmed-publishing-sdk`, commit `506febbca`, with `bun run build:publishing` and `bun pm pack` from each package. `manifest.json` records their source and SHA-256 digests. The lockfile also pins SHA-512. CI verifies both.

Replace these dependencies with published versions once the Mention source changes have been reviewed and released. The source of truth remains Mention's `packages/contracts` and `packages/sdk`; Schedio contains no patched copy of either implementation.

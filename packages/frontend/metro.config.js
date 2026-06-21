// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;

// Include monorepo root so Metro can resolve hoisted dependencies in root node_modules/
config.watchFolders = [monorepoRoot];

const blockPath = (dir) => {
  const resolved = path.resolve(dir);
  return new RegExp(`${resolved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*`);
};

config.resolver = {
  ...config.resolver,
  blockList: [
    blockPath(path.join(monorepoRoot, 'packages/backend')),
    blockPath(path.join(monorepoRoot, 'packages/shared-types/src')),
    /\.expo\/.*/,
    /\.metro\/.*/,
    /node_modules\/\.cache\/.*/,
    /\.tsbuildinfo$/,
  ],
  extraNodeModules: {
    '@schedio/shared-types': path.join(monorepoRoot, 'packages/shared-types'),
  },
  // Resolve from frontend node_modules first, then monorepo root (for hoisted deps)
  nodeModulesPaths: [
    path.join(projectRoot, 'node_modules'),
    path.join(monorepoRoot, 'node_modules'),
  ],
  // Enable symlinks for npm workspace resolution
  unstable_enableSymlinks: true,
  // Enable package.json "exports" field resolution (required by @oxyhq/bloom subpath exports)
  unstable_enablePackageExports: true,
  // Bloom imports `.woff2`/`.woff` font files directly from JS on web
  assetExts: [...config.resolver.assetExts, 'wasm', 'woff2', 'woff'],
};

module.exports = withNativeWind(config, {
  input: './styles/global.css',
  inlineRem: 16,
});

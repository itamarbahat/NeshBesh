const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v12+ uses package.json "exports" field which Metro needs
// this flag to resolve correctly (firebase/database, firebase/app, etc.)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;

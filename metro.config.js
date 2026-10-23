const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite 的 Web 端依赖 wa-sqlite.wasm，需要让 Metro 把 wasm 识别为资产
config.resolver.assetExts.push('wasm');

module.exports = config;

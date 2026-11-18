// The Indian brand list ships as a SQLite file (src/data/india-drugs.db).
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.resolver.assetExts.push('db')

module.exports = config

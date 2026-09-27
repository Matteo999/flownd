// Configurazione Metro di Expo con il supporto Sentry (debug ID per le source map).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);

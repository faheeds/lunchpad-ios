/**
 * Jest config for the iOS app. Uses jest-expo's preset so RN modules,
 * Expo modules, and the Metro babel pipeline all work out of the box.
 *
 * `transformIgnorePatterns` is the usual RN/Expo escape hatch — node_modules
 * are not transformed by default, but a long tail of RN/Expo packages ship
 * ESM and MUST be transformed by babel-jest. The pattern below is the one
 * jest-expo's own docs recommend.
 *
 * DEV owns this file (test runner infra). QA owns every test *case* file
 * under __tests__/ or *.test.ts(x) — dev never authors tests.
 */
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|@react-native-community|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@sentry/.*|@tanstack/.*|native-base|react-native-svg|zustand)",
  ],
};

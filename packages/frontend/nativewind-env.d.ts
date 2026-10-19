/// <reference types="nativewind/types" />

// A bare `import '../styles/global.css'` is checked since TypeScript 6 (side-effect
// imports must resolve). Metro and NativeWind compile the stylesheet; this only
// tells tsc the specifier is a module. Expo's generated, gitignored expo-env.d.ts
// declares the same, but tsc in a clean checkout runs without it.
declare module '*.css';

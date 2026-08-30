module.exports = {
  default: {
    // tsx rather than apps/api's @swc-node/register: this workspace's
    // tsconfig targets the bundler (module: esnext, moduleResolution:
    // bundler, jsx: react-jsx) because Next owns the build, and a CommonJS
    // require hook driven by that config cannot load these step files.
    // tsx transpiles TS to CJS on its own terms and ignores the module
    // setting, so the app keeps the tsconfig Next needs and the BDD suite
    // still runs.
    requireModule: ['tsx/cjs'],
    require: ['features/support/**/*.ts', 'features/step-definitions/**/*.ts'],
    format: ['progress-bar'],
    paths: ['features/**/*.feature'],
    // Playwright launch + first paint of a Leaflet map is comfortably over
    // Cucumber's 5s default on a cold Next dev server.
    timeout: 30000,
  },
};

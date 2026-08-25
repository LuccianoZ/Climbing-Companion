module.exports = {
  default: {
    requireModule: ['@swc-node/register'],
    // Explicit order matters: env.ts sets NODE_ENV=test before world.ts
    // imports the Nest AppModule (whose ConfigModule.forRoot() reads it),
    // and hooks.ts depends on world.ts's AuthWorld already existing.
    require: [
      'features/support/env.ts',
      'features/support/world.ts',
      'features/support/hooks.ts',
      'features/step-definitions/**/*.ts',
    ],
    format: ['progress-bar'],
    paths: ['features/**/*.feature'],
  },
};

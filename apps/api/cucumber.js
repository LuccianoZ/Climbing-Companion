module.exports = {
  default: {
    requireModule: ['@swc-node/register'],
    require: ['features/step-definitions/**/*.ts'],
    format: ['progress-bar'],
    paths: ['features/**/*.feature'],
  },
};
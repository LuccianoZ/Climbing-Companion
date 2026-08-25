module.exports = {
  apps: [
    {
      name: 'climbing-web',
      cwd: './apps/web',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      name: 'climbing-api',
      cwd: './apps/api',
      script: './dist/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        ENABLE_TEST_BYPASS_HEADERS: 'false',
        DATABASE_URL: 'postgres://climb:climbing_dev_password@127.0.0.1:5432/climbing_companion',
      },
    },
  ],
};

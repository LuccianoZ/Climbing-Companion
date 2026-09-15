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
        // @nestjs/config does not override vars already in process.env, so this
        // wins over apps/api/.env when the API runs under pm2. Switch this line
        // (and `pm2 restart climbing-api --update-env`) to change databases.
        // DATABASE_URL: 'postgres://climb:climbing_dev_password@127.0.0.1:5432/climbing_companion',      // dev data
        DATABASE_URL: 'postgres://climb:climbing_dev_password@127.0.0.1:5432/climbing_companion_demo', // demo data
      },
    },
  ],
};

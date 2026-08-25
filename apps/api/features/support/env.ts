// Must be required (by cucumber.js's explicit ordering) before anything that
// imports the Nest AppModule, so ConfigModule.forRoot() resolves its
// envFilePath to .env.test instead of .env.
process.env.NODE_ENV = 'test';

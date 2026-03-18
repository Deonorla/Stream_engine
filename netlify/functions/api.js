const serverless = require('serverless-http');
const createApp = require('../../server/index.js');

const app = createApp();

module.exports.handler = serverless(app);

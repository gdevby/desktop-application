const http = require('http');
const https = require('https');
const Cattr = require('@cattr/node');
const keychain = require('../utils/keychain');

const CONNECT_TIMEOUT_MS = 10_000;
const READ_TIMEOUT_MS = 30_000;

/**
 * HTTP(S) agent with connect and read socket timeouts
 * @param {Function} AgentClass http.Agent or https.Agent
 * @returns {http.Agent|https.Agent}
 */
function createAgentWithTimeouts(AgentClass) {

  const agent = new AgentClass({ keepAlive: true });
  const originalCreateConnection = agent.createConnection.bind(agent);

  agent.createConnection = (options, callback) => {

    const socket = originalCreateConnection(options, callback);

    if (socket) {

      socket.setTimeout(READ_TIMEOUT_MS);
      socket.on('timeout', () => socket.destroy(new Error('Read timeout')));

      const connectTimer = setTimeout(() => {
        socket.destroy(new Error('Connect timeout'));
      }, CONNECT_TIMEOUT_MS);
      socket.once('connect', () => clearTimeout(connectTimer));
      socket.once('error', () => clearTimeout(connectTimer));

    }

    return socket;

  };

  return agent;

}

const api = new Cattr();

api.axiosConfiguration.httpAgent = createAgentWithTimeouts(http.Agent);
api.axiosConfiguration.httpsAgent = createAgentWithTimeouts(https.Agent);
api.axiosConfiguration.timeout = READ_TIMEOUT_MS;

api.tokenProvider = {

  get: keychain.getSavedToken,
  set: keychain.saveToken,

};

api.credentialsProvider = {

  get: keychain.getSavedCredentials,
  set: keychain.saveCredentials,

};

module.exports = api;

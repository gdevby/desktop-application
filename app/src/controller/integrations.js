const api = require('../base/api');
const Log = require('../utils/log');

const log = new Log('Integrations');

/**
 * Returns integration warnings for the current user
 * @returns {Promise<Array<{integration: string, code: string, message: string|null}>>}
 */
module.exports.getGitlabWarnings = async () => {

  try {

    const settings = await api.integrations.gitlab.userSettings();

    if (!settings?.enabled) {
      return [];
    }

    if (settings.auth_error) {
      return [{
        integration: 'gitlab',
        code: settings.auth_error.code,
        message: settings.auth_error.message,
      }];
    }

    if (!settings.api_key) {
      return [{
        integration: 'gitlab',
        code: 'token_not_configured',
        message: null,
      }];
    }

    return [];

  } catch (error) {

    if (error instanceof api.ApiError) {

      if (error.statusCode === 404 || error.statusCode === 403) {
        return [];
      }

      if (error.statusCode >= 500 || error.statusCode === 422) {
        return [{
          integration: 'gitlab',
          code: 'server_error',
          message: error.message,
        }];
      }

    }

    if (error instanceof api.NetworkError) {
      return [];
    }

    log.debug('Unable to fetch GitLab integration status', error);
    return [];

  }

};

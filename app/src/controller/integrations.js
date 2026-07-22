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

    if (!settings?.enabled || !settings?.auth_error) {
      return [];
    }

    return [{
      integration: 'gitlab',
      code: settings.auth_error.code,
      message: settings.auth_error.message,
    }];

  } catch (error) {

    if (error instanceof api.ApiError) {

      if (error.statusCode === 404 || error.statusCode === 403) {
        return [];
      }

      if (error.statusCode >= 500 || error.statusCode === 422) {
        return [{
          integration: 'gitlab',
          code: 'token_invalid',
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

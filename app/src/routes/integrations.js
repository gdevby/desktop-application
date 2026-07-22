const Logger = require('../utils/log');
const Integrations = require('../controller/integrations');

const log = new Logger('Router:Integrations');
log.debug('Loaded');

module.exports = router => {

  router.serve('integrations/gitlab-warnings', async request => {

    try {

      const warnings = await Integrations.getGitlabWarnings();

      log.debug('GitLab integration warnings fetched', { count: warnings.length });

      return request.send(200, { warnings });

    } catch (error) {

      log.error('Unable to fetch GitLab integration warnings', error);

      return request.send(200, { warnings: [] });

    }

  });

};

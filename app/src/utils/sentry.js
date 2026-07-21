/**
 * Sentry reporter
 */

const Sentry = require('@sentry/electron/main');

const config = require('../base/config');

module.exports.isEnabled = Boolean(config.sentry.enabled);

// Initializes Sentry with configuration
if (module.exports.isEnabled) {

  Sentry.init({
    dsn: config.sentry.dsn,
    release: config.sentry.release,
    beforeSend(event) {

      if (module.exports.isEnabled)
        return event;

      return null;

    },
  });

}

// Exporting Sentry object
module.exports.Sentry = Sentry;

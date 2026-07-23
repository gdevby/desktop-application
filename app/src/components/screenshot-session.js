const authentication = require('../base/authentication');
const Screenshot = require('../utils/screenshot');
const Log = require('../utils/log');

const log = new Log('ScreenshotSession');

authentication.events.on('user-fetched', async user => {

  try {

    await Screenshot.startSessionForUser(user);

  } catch (err) {

    log.error('Failed to start screenshot session after user fetch', err);

  }

});

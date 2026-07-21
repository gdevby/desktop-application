const { EventEmitter } = require('events');
const Log = require('../utils/log');

const log = new Log('ActiveWindow');

const activeWinPromise = (async () => {

  // active-win is only used for application monitoring on Windows.
  // On Linux and macOS its native bindings are not needed and loading them
  // causes unnecessary startup errors.
  if (process.platform !== 'win32') {

    log.debug('Active window tracking is not supported on this platform');
    return null;

  }

  try {

    const { activeWindow, activeWindowSync } = await import('active-win');
    return { activeWindow, activeWindowSync };

  } catch (err) {

    log.error('active-win module is not available', err);
    return null;

  }

})();

/**
 * Polling interval
 * @type {number} Delay between polls in milliseconds
 */
const ACTIVE_WINDOW_POLLING_INTERVAL = 5000;

class ActiveWindow extends EventEmitter {

  constructor() {

    super();

    /**
     * Interval ID of polling timer
     * @type {Number|null}
     */
    this.pollingTimerId = null;

    /**
     * Current application parameters
     * @type {Object}
     */
    this.currentApplication = {
      executable: null,
      title: null,
      url: null,
    };

  }

  /**
   * Timer status
   * @type {boolean}
   */
  get active() {

    return this.pollingTimerId !== null;

  }

  /**
   * Starts active window polling
   * @returns {boolean} True if successfully started, False otherwise
   */
  start() {

    if (this.active)
      return false;

    this.pollingTimerId = setInterval(async () => {

      try {

        const activeWin = await activeWinPromise;
        if (!activeWin) return;

        const window = await activeWin.activeWindow();

        // Detect changes
        if (
          window && window.owner
          && (window.owner.path !== this.currentApplication.executable
          || window.title !== this.currentApplication.title
          || window.url !== this.currentApplication.url)
        )
          this.applyNewWindow(window);

      } catch (err) {

        log.error('Error occured during active window poll', err);

      }

    }, ACTIVE_WINDOW_POLLING_INTERVAL);
    return true;

  }

  /**
   * Stops the active window polling
   */
  stop() {

    if (!this.pollingTimerId)
      return;

    clearInterval(this.pollingTimerId);
    this.pollingTimerId = null;

  }

  /**
   * Update current window
   * @private
   * @param {Object} window New window definition
   */
  applyNewWindow(window) {

    this.currentApplication.executable = window.owner.path;
    this.currentApplication.title = window.title;
    this.currentApplication.url = window.url;
    this.emit('updated', this.currentApplication);

  }

}

module.exports = new ActiveWindow();

const { captureScreens, CaptureSession } = require('./screen-capture');
const Log = require('./log');
const { UIError } = require('./errors');
const EMPTY_IMAGE = require('../constants/empty-screenshot');

const log = new Log('Screenshot');

let activeSession = null;

/**
 * Start a persistent screen-capture session.
 *
 * On Wayland this keeps a single PipeWire stream alive, so the permission
 * dialog is shown only once for the whole tracking session.
 * @return {Promise<void>}
 */
const startSession = async () => {
  // Persistent session is enabled on Linux (Wayland and X11) to reduce
  // xdg-desktop-portal dialogs. Other platforms keep using the one-shot
  // captureScreens() fallback to avoid untested regressions.
  if (process.platform !== 'linux')
    return;

  if (activeSession) {
    await stopSession();
  }
  const session = new CaptureSession();
  await session.start();
  activeSession = session;
};

/**
 * Stop the persistent screen-capture session and release all resources.
 * @return {Promise<void>}
 */
const stopSession = async () => {
  if (activeSession) {
    try {
      await activeSession.stop();
    } catch (err) {
      log.error('Error stopping screenshot session', err);
    }
    activeSession = null;
  }
};

/**
 * Mockup for screenshot capture function
 * @returns {Buffer} White pseudo-screenshot
 */
const makeScreenshotMockup = () => new Promise(resolve => {

  if (process.env.AT_MOCK_SCR_DELAY !== 'yes') {

    resolve(EMPTY_IMAGE);
    return;

  }

  const delay = (Math.random() * Math.random() * 5000);
  log.debug(`Delaying capture for ${Math.round(delay)}ms`);
  setTimeout(() => resolve(EMPTY_IMAGE), delay);

});

/**
 * Makes screenshot
 * @async
 * @returns {Promise<Buffer>} Captured screenshot
 */
const makeScreenshot = async () => {

  const timeStart = Date.now();
  let screenshot;

  if (activeSession && activeSession.active) {
    try {
      screenshot = await activeSession.capture();
    } catch (err) {
      log.error('Session capture failed, falling back to one-shot capture', err);
      try {
        await activeSession.stop();
      } catch (stopErr) {
        log.error('Error stopping failed session', stopErr);
      }
      activeSession = null;
      screenshot = await captureScreens();
    }
  } else {
    screenshot = await captureScreens();
  }

  if (!screenshot)
    throw new UIError(500, 'No screenshots were captured', 'ESCR502');

  log.debug(`Captured in ${(Date.now() - timeStart)}ms`);
  return screenshot;

};

if (process.env.AT_MOCK_SCR === 'yes') {
  module.exports = { makeScreenshot: makeScreenshotMockup, startSession: async () => {}, stopSession: async () => {} };
} else {
  module.exports = { makeScreenshot, startSession, stopSession };
}

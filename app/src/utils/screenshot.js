const { captureScreens, CaptureSession } = require('./screen-capture');
const Log = require('./log');
const { UIError } = require('./errors');
const EMPTY_IMAGE = require('../constants/empty-screenshot');
const { isWayland } = require('./platform');
const ScreenshotsState = require('../constants/ScreenshotsState');
const { Project } = require('../models').db.models;

const log = new Log('Screenshot');

let activeSession = null;
let pendingStart = null;

/**
 * @param {Object} user
 * @returns {Promise<Boolean>}
 */
const userMayNeedScreenshots = async user => {

  if (user.screenshotsState === ScreenshotsState.REQUIRED
    || user.screenshotsState === ScreenshotsState.OPTIONAL)
    return true;

  const projectsRequiringScreenshots = await Project.count({
    where: { screenshotsState: ScreenshotsState.REQUIRED },
  });

  return projectsRequiringScreenshots > 0;

};

/**
 * Start a persistent screen-capture session on Wayland.
 *
 * Keeps a single PipeWire stream alive so the xdg-desktop-portal permission
 * dialog is shown only once per application session.
 * @return {Promise<void>}
 */
const startSession = async () => {

  if (!isWayland())
    return;

  if (activeSession?.active)
    return;

  if (pendingStart)
    return pendingStart;

  pendingStart = (async () => {

    const session = new CaptureSession();

    try {

      await session.start();
      activeSession = session;

    } finally {

      pendingStart = null;

    }

  })();

  return pendingStart;

};

/**
 * Start a persistent capture session when the user is allowed to take screenshots.
 * @param {Object} user Current user object
 * @return {Promise<void>}
 */
const startSessionForUser = async user => {

  if (!user)
    return;

  if (!await userMayNeedScreenshots(user))
    return;

  try {

    await startSession();

  } catch (err) {

    log.error('Failed to start screenshot session', err);

  }

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
  module.exports = {
    makeScreenshot: makeScreenshotMockup,
    startSession: async () => {},
    startSessionForUser: async () => {},
    stopSession: async () => {},
  };
} else {
  module.exports = {
    makeScreenshot,
    startSession,
    startSessionForUser,
    stopSession,
  };
}

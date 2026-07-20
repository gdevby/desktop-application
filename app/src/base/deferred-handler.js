const IntervalsController = require('../controller/time-intervals');
const TimeIntervalModel = require('../models').db.models.Interval;
const Log = require('../utils/log');
const OfflineMode = require('./offline-mode');
const TaskTracker = require('./task-tracker');

const log = new Log('DeferredHandler');

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3_000;

/**
 * If deferred intervals push procedure is already running,
 * we should lock this from more executions to avoid collisions
 * @type {Boolean}
 */
let threadLock = false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {Error} error
 * @returns {Boolean}
 */
const isRetryableError = error => error.isNetworkError
  || error.message === 'Connect timeout'
  || error.message === 'Read timeout'
  || error.code === 'ECONNABORTED'
  || error.code === 'ETIMEDOUT'
  || error.code === 'ECONNRESET'
  || error.code === 'ENOTFOUND'
  || error.code === 'EAI_AGAIN';

/**
 * Push single deferred interval with retries on transient failures
 * @param {Object} preparedInterval
 * @param {Buffer} [screenshot]
 * @returns {Promise<Object>}
 */
const pushIntervalWithRetry = async (preparedInterval, screenshot) => {

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

    try {

      if (screenshot)
        return await IntervalsController.pushTimeInterval(preparedInterval, screenshot);

      return await IntervalsController.pushTimeInterval(preparedInterval);

    } catch (error) {

      lastError = error;

      if (!isRetryableError(error) || attempt === MAX_ATTEMPTS)
        throw error;

      log.warning(`Interval push attempt ${attempt}/${MAX_ATTEMPTS} failed, retry in ${RETRY_DELAY_MS}ms`);
      await sleep(RETRY_DELAY_MS);

    }

  }

  throw lastError;

};

/**
 * Pushes deferred intervals
 * @param {Object} [options]
 * @param {Boolean} [options.manual=false] Manual sync initiated by user
 * @return {Promise<{synced: number, remaining: number, failed: number, error?: string}>}
 */
const deferredIntervalsPush = async ({ manual = false } = {}) => {

  if (threadLock) {

    if (manual)
      return {
        synced: 0,
        remaining: await TimeIntervalModel.count({ where: { synced: false } }),
        failed: 0,
        error: 'Sync already in progress',
      };

    return { synced: 0, remaining: 0, failed: 0 };

  }

  threadLock = true;

  try {

    if (manual)
      await OfflineMode.restoreWithCheck();

    const deferredIntervals = await TimeIntervalModel.findAll({ where: { synced: false } });

    if (deferredIntervals.length === 0)
      return { synced: 0, remaining: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    // eslint-disable-next-line no-restricted-syntax
    for await (const rawInterval of deferredIntervals) {

      /* eslint camelcase: 0 */
      const preparedInterval = {

        _isDeferred: true,
        task_id: rawInterval.taskId,
        start_at: rawInterval.startAt,
        end_at: rawInterval.endAt,
        user_id: rawInterval.userId,
        activity_fill: rawInterval.systemActivity,

      };

      if (rawInterval.mouseActivity)
        preparedInterval.mouse_fill = rawInterval.mouseActivity;

      if (rawInterval.keyboardActivity)
        preparedInterval.keyboard_fill = rawInterval.keyboardActivity;

      try {

        const res = await pushIntervalWithRetry(preparedInterval, rawInterval.screenshot || undefined);

        log.debug(`Deferred interval (${res.response.data.id}) has been pushed`);

        rawInterval.synced = true;
        rawInterval.remoteId = res.response.data.id;
        await rawInterval.save();

        synced += 1;

        TaskTracker.emit('interval-pushed', {
          deferred: true,
        });

        await IntervalsController.reduceSyncedIntervalQueue();

      } catch (error) {

        if (isRetryableError(error))
          OfflineMode.trigger();

        log.warning(`Error occured during deferred interval push: ${error}`);
        failed += 1;

      }

    }

    const remaining = await TimeIntervalModel.count({ where: { synced: false } });

    if (failed > 0)
      log.debug(`Deferred intervals push finished: synced=${synced}, failed=${failed}, remaining=${remaining}`);
    else
      log.debug('Deferred intervals queue is empty, nice work');

    const result = { synced, remaining, failed };

    if (manual && synced === 0 && failed > 0)
      result.error = 'Failed to sync intervals';

    return result;

  } finally {

    threadLock = false;

  }

};

module.exports = { deferredIntervalsPush };

OfflineMode.on('connection-restored', () => deferredIntervalsPush());
OfflineMode.once('connection-ok', () => deferredIntervalsPush());

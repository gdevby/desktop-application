/**
 * Normalizes task active flag from API payload to local storage value.
 * @param  {Object} task  Raw task from API
 * @return {String}       '1' for active, '0' for inactive
 */
const resolveTaskActiveFlag = task => {

  if (task.status && typeof task.status === 'object' && task.status.active !== undefined)
    return task.status.active ? '1' : '0';

  if (task.active !== undefined)
    return task.active ? '1' : '0';

  if (task.status_id !== undefined)
    return Number(task.status_id) === 1 ? '1' : '0';

  return String(task.status) === '1' ? '1' : '0';

};

/**
 * @param  {String|Number|Boolean} status  Local task status flag
 * @return {Boolean}
 */
const isTaskActive = status => String(status) === '1';

module.exports = {
  resolveTaskActiveFlag,
  isTaskActive,
};

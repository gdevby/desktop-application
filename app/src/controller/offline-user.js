const Log = require('../utils/log');

const log = new Log('OfflineUser');

const getPropertyModel = () => require('../models').db.models.Property;

/**
 * Implements offline (local) user logic
 */
class OfflineUser {

  constructor() {

    /**
     * User properties
     * @type {Object}
     */
    this.user = {};

  }

  /**
   * Read user properties from local storage
   * @returns {OfflineUser|null} Returns nnull if data cannot be fetched
   */
  static async readFromLocalStorage() {

    // Getting serialized local user data
    const serializedUser = await getPropertyModel().findOne({ where: { key: 'local_user' } });

    // Check is database entry exists
    if (!serializedUser)
      return null;

    // Trying to parse values from serialized data
    try {

      return JSON.parse(serializedUser.value);

    } catch (error) {

      // Log issue
      log.error('Error occured during offline user data read from storage', error);
      return null;

    }

  }

  /**
   * Bulk properties set
   * @param {Object} properties Properties to set
   */
  async setProperties(properties) {

    // Check type of properties argument
    if (typeof properties !== 'object')
      throw new TypeError(`Properties object must be an object, but ${typeof properties} given`);

    this.user = { ...properties };
    return this;

  }

  /**
   * Fetches user properties from local storage into buffer
   */
  async fetch() {

    const usr = await OfflineUser.readFromLocalStorage();

    if (!usr)
      return false;

    this.setProperties(usr);
    return true;

  }

  /**
   * Commits current offline user buffer to disk
   * @returns {Promise<Boolean|Error>} True, if succeed
   */
  async commit() {

    const serialized = JSON.stringify(this.user);
    const storedEntry = await getPropertyModel().findOne({ where: { key: 'local_user' } });

    // Update existing property if it is exists
    if (storedEntry) {

      await storedEntry.update({ value: serialized });
      return true;

    }

    // Create new one if it is not exists
    const newEntry = new (getPropertyModel())({ key: 'local_user', value: serialized });
    await newEntry.save();
    return true;

  }

}

module.exports = new OfflineUser();

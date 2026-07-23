/**
 * @returns {Boolean} Is the app running on a Wayland session?
 */
const isWayland = () => process.platform === 'linux' && !!process.env.WAYLAND_DISPLAY;

module.exports = {
  isWayland,
};

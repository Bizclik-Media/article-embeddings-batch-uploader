/**
 * An object containing ANSI escape codes for various colors.
 * @type {Object.<string, string>}
 */
var colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  grey: '\u001b[38;5;245m',
  'dark grey': '\u001b[38;5;245m',
  yellow: '\u001b[33;1m',
  white: '\u001b[37;1m',
  blue: '\x1b[34m'
}

/**
 * Colors a message with the specified color.
 * 
 * @param {string} message - The message to color.
 * @param {string} colorName - The name of the color to use.
 * @returns {string} The colored message.
 */
function color(message, colorName) {
  var colorToUse = colors[colorName] || colors.reset
  return colorToUse + message + colors.reset
}

export default color
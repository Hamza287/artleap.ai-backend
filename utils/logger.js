class Logger {
  static error(message, error = null) {
    console.error(`[ERROR] ${message}`, error ? error : '');
  }

  static warn(message, data = null) {
    console.warn(`[WARN] ${message}`, data ? data : '');
  }

  static info(message, data = null) {
    console.info(`[INFO] ${message}`, data ? data : '');
  }
}

module.exports = Logger;
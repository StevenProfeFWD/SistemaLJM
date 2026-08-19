export default class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {object} [options]
   * @param {unknown} [options.details]
   * @param {Record<string, unknown>} [options.legacyJson] - Si existe, errorHandler responde exactamente este JSON (compatibilidad API)
   */
  constructor(message, statusCode = 500, options = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (options && typeof options === 'object') {
      this.details = options.details;
      this.legacyJson = options.legacyJson;
    }
  }
}


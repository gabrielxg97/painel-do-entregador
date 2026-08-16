export class Logger {
  static info(message: string, meta?: any) {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`, meta ? JSON.stringify(this.sanitize(meta)) : '');
  }

  static warn(message: string, meta?: any) {
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`, meta ? JSON.stringify(this.sanitize(meta)) : '');
  }

  static error(message: string, error?: any) {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error ? this.sanitize(error) : '');
  }

  static sanitize(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key in sanitized) {
      if (['client_secret', 'password', 'token', 'access_token', 'JWT_SECRET'].includes(key.toLowerCase())) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    return sanitized;
  }
}

export const logger = {
  info: (message: string, meta?: any) => {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...(meta && { meta }),
    };
    console.log(JSON.stringify(log));
  },
  warn: (message: string, meta?: any) => {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      ...(meta && { meta }),
    };
    console.warn(JSON.stringify(log));
  },
  error: (message: string, error?: any) => {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      ...(error && { error: error.message || error }),
    };
    console.error(JSON.stringify(log));
  },
};

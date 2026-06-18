type LogContext = Record<string, unknown>;

export const appLogger = {
  error(message: string, context?: LogContext) {
    if (context) {
      console.error(`[MyChatPDF] ${message}`, context);
      return;
    }

    console.error(`[MyChatPDF] ${message}`);
  },
  warn(message: string, context?: LogContext) {
    if (context) {
      console.warn(`[MyChatPDF] ${message}`, context);
      return;
    }

    console.warn(`[MyChatPDF] ${message}`);
  }
};

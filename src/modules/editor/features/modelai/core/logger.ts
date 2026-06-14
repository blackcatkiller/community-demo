// @ts-nocheck
export enum LoggerLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3
}

export class Logger {
  static level: LoggerLevel = LoggerLevel.Info;

  static debug(...args: any[]) {
    if (Logger.level <= LoggerLevel.Debug) {
      console.debug(...args);
    }
  }

  static info(...args: any[]) {
    if (Logger.level <= LoggerLevel.Info) {
      console.log(...args);
    }
  }

  static warn(...args: any[]) {
    if (Logger.level <= LoggerLevel.Warn) {
      console.warn(...args);
    }
  }

  static error(...args: any[]) {
    if (Logger.level <= LoggerLevel.Error) {
      console.error(...args);
    }
  }
}

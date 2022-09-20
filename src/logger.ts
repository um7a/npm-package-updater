const BG_RED = '\u001b[41m';
const BG_GREEN = '\u001b[42m';
const BG_YELLOW = '\u001b[43m';
const BG_BLUE = '\u001b[44m';
const BG_MAGENTA = '\u001b[45m';
const BG_CYAN = '\u001b[46m';
const RESET = '\u001b[0m';

const logLevels = {
  debug: {
    color: BG_BLUE,
    index: 5,
    prefix: ' DEBUG ',
  },
  info: {
    color: BG_GREEN,
    index: 4,
    prefix: ' INFO ',
  },
  notice: {
    color: BG_CYAN,
    index: 3,
    prefix: ' NOTICE ',
  },
  warning: {
    color: BG_YELLOW,
    index: 2,
    prefix: ' WARN ',
  },
  error: {
    color: BG_RED,
    index: 1,
    prefix: ' ERROR ',
  },
  critical: {
    color: BG_MAGENTA,
    index: 0,
    prefix: ' CRITICAL ',
  },
};

type LogLevel = {
  color: string;
  index: number;
  prefix: string;
};

export default class Logger {
  private logLevel: LogLevel;

  private addColor: boolean;

  // You can use any type value as msg.
  // This function pass it directly console.log.
  //
  private log(msg: any, logLevel: LogLevel) {
    const complementedMsg = msg === undefined ? '' : msg;
    if (this.logLevel.index < logLevel.index) {
      return;
    }
    const prefix = this.addColor
      ? `${logLevel.color}${logLevel.prefix}${RESET}`
      : logLevel.prefix;
    if (typeof complementedMsg === 'string') {
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${complementedMsg}`);
      return;
    }
    process.stdout.write(`${prefix} `);
    // eslint-disable-next-line no-console
    console.log(complementedMsg);
  }

  constructor(
    logLevel: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical',
    addColor: boolean,
  ) {
    this.logLevel = logLevels[logLevel];
    this.addColor = addColor !== undefined ? addColor : true;
  }

  debug(msg: any) {
    this.log(msg, logLevels.debug);
  }

  info(msg: any) {
    this.log(msg, logLevels.info);
  }

  notice(msg: any) {
    this.log(msg, logLevels.notice);
  }

  warn(msg: any) {
    this.log(msg, logLevels.warning);
  }

  error(msg: any) {
    this.log(msg, logLevels.error);
  }

  crit(msg: any) {
    this.log(msg, logLevels.critical);
  }
}

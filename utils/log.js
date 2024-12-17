import color from './color.js'

const LogLevel = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
};

const LogLevelColorMap = {
  [LogLevel.FATAL]: 'red',
  [LogLevel.ERROR]: 'red',
  [LogLevel.WARN]: 'yellow',
  [LogLevel.INFO]: 'grey',
  [LogLevel.DEBUG]: 'blue',
  [LogLevel.TRACE]: 'cyan'
};

function log(level, ...args) {
  const cleanArgs = [level.toUpperCase(), ...args];
  console.log.apply(console, cleanArgs);
}

function createLogger(db, jobId) {
  if(!db || !jobId) return {
    log: (level, ...args) => {
      log(color(level, LogLevelColorMap[level]), ...args);
    }
  };

  return {
    log: async (level, ...args) => {
      log(color(level, LogLevelColorMap[level]), ...args);

       // Log to the MongoDB collection
       const message = args.join(' ');
       await db.collection('article-embedding-job-log').insertOne({
         level,
         message,
         timestamp: new Date(),
         jobId: String(jobId)
       });
    }
  }
}

export { LogLevel };
export default createLogger;
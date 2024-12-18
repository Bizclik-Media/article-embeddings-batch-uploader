import color from './utils/color.js'
import { LogLevel } from './utils/log.js';
import init from './src/init.js'
import handleBatchRequests from './src/handleBatchRequests.js';
import checkStatus from './src/checkStatus.js';
import updatePinecone from './src/updatePinecone.js';

const JOB_STATUS = {
  INITIALISING: 'initialising',
  CREATING_AND_SENDING_BATCH_REQUESTS: 'creating_and_sending_batch_requests',
  CHECKING_STATUS: 'checking_status',
  UPDATING_VECTOR_STORE: 'updating_vector_store',
  ERROR: 'error',
  SUCCESS: 'success',
  EXIT: 'exit'
}

// Statuses (initialising, creating_batches, sending_batch_requests, checking_status, updating_vector_store)

// HandleStatus(STATUS) { switch(STATUS) { case } }

let mongoClient, db, storage, bucket, openaiClient, pineconeClient, logger, errors=[], state;

async function handler(status) {
  switch(status) {
    case 'initialising':
      const dependencies = await init();
      errors = dependencies.errors;
      
      if(errors.length > 0) { 
        return handler(JOB_STATUS.ERROR); 
      }

      mongoClient = dependencies.mongoClient;
      db = dependencies.db;
      storage = dependencies.storage;
      bucket = dependencies.bucket;
      openaiClient = dependencies.openaiClient;
      pineconeClient = dependencies.pineconeClient;
      logger = dependencies.logger;
      state = dependencies.state;

      await logger.log(LogLevel.INFO, color('Initialising', 'grey'), '✅ Initialising complete');
      return handler(JOB_STATUS.CREATING_AND_SENDING_BATCH_REQUESTS);

    case 'creating_and_sending_batch_requests':
      // Creating the batch responses, and sending them to the OpenAI API, and storing the batch info in collection
      await handleBatchRequests(db, bucket, logger, state, openaiClient)
      return handler(JOB_STATUS.CHECKING_STATUS);

    case 'checking_status':
      // polling the OpenAI API for the status of the batch requests
      await db.collection('article-embedding-job').updateOne({ _id: state.jobId }, { $set: { status: 'checking_status' } });
      await checkStatus(db, logger, state, openaiClient);
      return handler(JOB_STATUS.UPDATING_VECTOR_STORE);

    case 'updating_vector_store':
      await db.collection('article-embedding-job').updateOne({ _id: state.jobId }, { $set: { status: 'updating_vector_store' } });
      await updatePinecone(db, logger, state, openaiClient, pineconeClient);
      return handler(JOB_STATUS.SUCCESS);

    case 'success':
      await db.collection('article-embedding-job').updateOne({ _id: state.jobId }, { $set: { status: 'success' } });
      await logger.log(LogLevel.INFO, color('Success', 'green'), '✅ Successfully created & uploaded batch files, congratulations 🥳!');
      return process.exit(0);

    case 'error':
      await db.collection('article-embedding-job').updateOne({ _id: state.jobId }, { $set: { status: 'error' } });
      await logger.log(LogLevel.ERROR, color('Error', 'red'), '⛔️ Unexpected error occured, check logs for more information');
      errors.forEach(err => log('\t' + err));
      return process.exit(1);

    case 'exit':
      await db.collection('article-embedding-job').updateOne({ _id: state.jobId }, { $set: { status: 'exited' } });
      await logger.log(LogLevel.INFO, color('Exiting', 'grey'), '🔄 Exiting process...');
      return process.exit(0);

    default: 
      return
  }
}

await handler(JOB_STATUS.INITIALISING)
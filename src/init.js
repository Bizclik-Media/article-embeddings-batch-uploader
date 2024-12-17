import { MongoClient } from 'mongodb'
import mongodbUri from 'mongodb-uri'
import color from '../utils/color.js'
import createLogger, { LogLevel } from '../utils/log.js'
import { Storage } from '@google-cloud/storage'
import OpenAI from "openai";
import { Pinecone } from '@pinecone-database/pinecone';

async function init() {
  let
    mongoClient,
    db,
    storage,
    bucket,
    openaiClient,
    pineconeClient,
    errors = [],
    logger = createLogger(),
    state = { jobId: null };

  const done = () => {
    return ({ mongoClient, db, storage, bucket, openaiClient, pineconeClient, errors, logger, state });
  }

  logger.log(LogLevel.INFO, color('Initialising', 'grey'), '🔄 Initialising process...');

  // MONGODB
  const connectionUri = process.env.MONGO_URL || `mongodb://host.docker.internal:27017/${process.env.DB_NAME}`
  const { database } = mongodbUri.parse(connectionUri)
  try {
    mongoClient = new MongoClient(connectionUri, { useNewUrlParser: true, useUnifiedTopology: true });
    await mongoClient.connect();
    logger.log(LogLevel.INFO, color('Connected to MongoDB', 'green'));
    db = mongoClient.db(database);
    logger.log(LogLevel.INFO, color('Successfully', 'green'), 'connected to database')
  } catch (err) {
    errors.push(err);
    logger.log(LogLevel.ERROR, color('Error', 'red'), 'occured while connecting to database');
    await mongoClient.close();
    logger.log(LogLevel.INFO, color('Disconnected from MongoDB', 'red'));
    return done();
  }

  // CREATE STATE DOC
  try {
    const collection = db.collection('article-embedding-job');
    const stateDoc = await collection.insertOne({
      status: 'initialising',
      createdAt: new Date()
    });
    state.jobId = stateDoc.insertedId;
    logger.log(LogLevel.INFO, color('Successfully', 'green'), `created state document (id: ${state.jobId})`);
    logger = createLogger(db, state.jobId);
    await logger.log(LogLevel.INFO, `Logger created, logs will be stored in database (jobId: ${state.jobId})`);
  } catch (err) {
    errors.push(err);
    await logger.log(LogLevel.ERROR, color('Error', 'red'), 'occured while creating state document');
    return done();
  }

  // GOOGLE CLOUD STORAGE
  try {
    storage = new Storage();
    const bucketName = 'batch-requests-' + new Date().toISOString().replace(/[^0-9]/g, '');
    await storage.createBucket(bucketName);
    bucket = storage.bucket(bucketName);
    await logger.log(LogLevel.INFO, color('Successfully', 'green'), `created GCloud bucket: ${bucketName}.`);
    await logger.log(LogLevel.INFO, `\thttps://console.cloud.google.com/storage/browser/${bucketName}?project=${process.env.GCLOUD_PROJECT_ID}`)
  } catch (err) {
    errors.push(err);
    await logger.log(LogLevel.ERROR, color('Error', 'red'), 'occured while creating GCloud bucket');
    await logger.log(LogLevel.INFO, color('Disconnected from GCloud Storage', 'red'));
    return done();
  }

  // OPENAI
  try {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await logger.log(LogLevel.INFO, color('Connected to OpenAI', 'green'));
  } catch (err) {
    errors.push(err);
    await logger.log(LogLevel.ERROR, color('Error', 'red'), 'occured while connecting to OpenAI');
    await logger.log(LogLevel.INFO, color('Disconnected from OpenAI', 'red'));
    return done();
  }

  // PINECONE
  try {
    pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    await logger.log(LogLevel.INFO, color('Connected to Pinecone', 'green'));
  } catch (err) {
    errors.push(err);
    await logger.log(LogLevel.ERROR, color('Error', 'red'), 'occured while connecting to Pinecone');
    await logger.log(LogLevel.INFO, color('Disconnected from Pinecone', 'red'));
    return done();
  }

  return done();
}

export default init;
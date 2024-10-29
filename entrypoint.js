import { MongoClient } from 'mongodb'
import mongodbUri from 'mongodb-uri'
import color from './utils/color.js'
import log from './utils/log.js'
import { Storage } from '@google-cloud/storage'
import hat from 'hat'
import createBatchRequestFile from './src/createBatchRequestFile.js'

// Database connection
const connectionUri = process.env.MONGO_URL || `mongodb://host.docker.internal:27017/${process.env.DB_NAME}`
const { database } = mongodbUri.parse(connectionUri)

// Storage connection
const storage = new Storage();

// Begin connection
log(color('Connecting', 'grey'), 'to database...')
MongoClient.connect(
  connectionUri,
  { useNewUrlParser: true, useUnifiedTopology: true },
  async (err, client) => {
    if (err) {
      log(color('Error', 'red'), 'occured while connecting to database')
      return log('\t' + err)
    }
    const db = client.db(database)
    log(color('Successfully', 'green'), 'connected to database')

    // Configure storage
    const bucketName = 'batch-requests-' + new Date().toISOString().replace(/[^0-9]/g, '');
    await storage.createBucket(bucketName);
    const bucket = storage.bucket(bucketName);

    // Create batcher
    const batchRequestsResponse = await createBatchRequestFile(db, bucket)
    const { batchFiles, status } = batchRequestsResponse
    if(status === 'success') {
      log(color('Batch files created: ', 'blue') + batchFiles.length)
    } else {
      return log(color('Error', 'red'), 'occured while creating batch files')
    }

    // Create bucket and upload files
    log(color('Successfully', 'green'), `created GCloud bucket: ${bucketName}.`);
    log(`\thttps://console.cloud.google.com/storage/browser/${bucketName}?project=${process.env.GCLOUD_PROJECT_ID}`)

    // combine all embeddings into 1 master file
  }
)




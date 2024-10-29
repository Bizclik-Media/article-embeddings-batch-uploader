import { MongoClient } from 'mongodb'
import mongodbUri from 'mongodb-uri'
import color from './src/color.js'
import log from './src/log.js'
import { Storage } from '@google-cloud/storage'
import hat from 'hat'

// Database connection
const connectionUri = process.env.MONGO_URL || `mongodb://host.docker.internal:27017/${process.env.DB_NAME}`
const { database } = mongodbUri.parse(connectionUri)

// Storage connection
const storage = new Storage();
const createBucket = async () => {
  const bucketName = hat()
  // await storage.createBucket(bucketName);
  log(color('Successfully', 'green'), `created GCloud bucket: ${bucketName}.`);
  log(`\thttps://console.cloud.google.com/storage/browser/${bucketName}?project=${process.env.GCLOUD_PROJECT_ID}`)
}

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

    const articles  = await db.collection('article').find({ slug: 'department-international-development' }).toArray()
    log(color('Articles found: ', 'blue') + articles.length)

    // Run Google Cloud business
    await createBucket()
  }
)

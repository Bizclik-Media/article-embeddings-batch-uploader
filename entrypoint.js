import { MongoClient } from 'mongodb'
import mongodbUri from 'mongodb-uri'
import color from './src/color.js'
import log from './src/log.js'

const connectionUri = process.env.MONGO_URL || `mongodb://host.docker.internal:27017/${process.env.DB_NAME}`
const { database } = mongodbUri.parse(connectionUri)

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

      log(color('Articles found: ', 'blue'), - articles.length)
      log('\t' + articles)
    }
  )

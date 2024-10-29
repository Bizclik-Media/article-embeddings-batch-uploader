import log from "../utils/log.js";
import color from "../utils/color.js";
import fs from "fs"
import path from "path";
import { convert } from "html-to-text"

const DEFAULT_OPTIONS = {
    batchSize: 32 
}

const createBatchRequestFile = async (db, options=DEFAULT_OPTIONS) => {
    let response
    log('Beginning batching process')

    const articleCollection = db.collection('article')
    await articleCollection.createIndex({ displayDate: 1 });

    const cutoff =  new Date("2022-01-01T00:00:00.000+00:00")
    log(color(`article cuttoff date: ${cutoff.toISOString()}`, 'grey'))

    const query = { displayDate: { $gte: cutoff } }
    const cursor = articleCollection.find(query).sort({ displayDate: -1 })
    const articleCount = await cursor.count()
    log(color(`articles found: ${articleCount}`, 'grey'))

    const numOfBatches = Math.ceil(articleCount / options.batchSize)
    log(color(`number of batches: ${numOfBatches}`, 'grey'))

     // Ensure the ./tmp directory exists
     const outputDir = path.join(__dirname, 'tmp');
     if (!fs.existsSync(outputDir)) {
         fs.mkdirSync(outputDir);
     } 

    // Create files for each batch
    const batchFiles = []
    for(var i = 0; i < numOfBatches; i++) {
        const batch = []
        const cursor = articleCollection.find(query).skip(i * options.batchSize).limit(options.batchSize).sort({ displayDate: -1 });

        while (await cursor.hasNext()) {
            const article = await cursor.next();
            if (article) {
                batch.push(requestify(article));
            }
        }

        const batchFileName = path.join(outputDir, `batch-${i}.json`);
        log(color(`writing batch file: ${batchFileName}`, 'grey'))

        try {
            fs.writeFileSync(`./tmp/${batchFileName}`, JSON.stringify(batch, null, 2));
            fs.writeFileSync(`tmp/${batchFileName}-fake-embedding`, JSON.stringify(
                batch.map((b) => ({id: b.custom_id, embedding: generateFakeEmbedding()})), null, 2)
            );
            log(color(`Successfully wrote batch file: ${batchFileName}`, 'green'));
            batchFiles.push({name: batchFileName, count: batch.length, filePath: `./tmp/${batchFileName}`, embeddingFilePath: `./tmp/${batchFileName}-fake-embedding`});
        } catch (err) {
            console.error(`Error writing batch file: ${batchFileName}`, err);
        }
    }

    log(color('✅ Successfully', 'green') + ' created batch files')
    log(color('Batch files:', 'grey'), batchFiles.map((b) => b.name).join(', '))
    response = { batchFiles, articleCount, numOfBatches, status: 'success' }
    return response
}

const getPlaintext = (widgets) => {
    let html = ''
    widgets.forEach((b) => {
        switch (b.type) {
            case 'text':
            html += b.html
            break
            default:
            break
        }
    })
    return convert(html, { wordwrap: 130 }).replaceAll('\n', ' ')
}

const requestify = (article) => {
    return ({
        "custom_id": `article-${article._id}-${new Date().toISOString().replace(/[^0-9]/g, '')}`,
        "method": "POST",
        "url": "/v1/embeddings",
        "body": {
            "model": "text-embedding-3-small",
            "input": `Title: ${article.headline}, Standfirst: ${article.standfirst}, Body: ${getPlaintext(article.body.widgets)}`
        }}
    )
}

const generateFakeEmbedding = () => {
    const embedding = Array.from({ length: 1536 }, () => (Math.random() * 2 - 1) * 0.9999999999);
    return embedding;
  }

export default createBatchRequestFile;
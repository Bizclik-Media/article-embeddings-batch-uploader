import log from "../utils/log.js";
import color from "../utils/color.js";
import { convert } from "html-to-text"


const DEFAULT_OPTIONS = {
    batchSize: 32 
}

const createBatchRequestFile = async (db, bucket, options = DEFAULT_OPTIONS) => {
    let response;
    log('Beginning batching process');

    const articleCollection = db.collection('article');
    await articleCollection.createIndex({ displayDate: 1 });

    const cutoff = new Date("2022-01-01T00:00:00.000+00:00");
    log(color(`article cutoff date: ${cutoff.toISOString()}`, 'grey'));

    const query = { displayDate: { $gte: cutoff } };
    const cursor = articleCollection.find(query).sort({ displayDate: -1 });
    const articleCount = await cursor.count();
    let count = 0
    log(color(`articles found: ${articleCount}`, 'grey'));

    const numOfBatches = Math.ceil(articleCount / options.batchSize);
    log(color(`number of batches: ${numOfBatches}`, 'grey'));

    const batchFiles = [];
    const batchPromises = [];

    for (let i = 0; i < numOfBatches; i++) {
        batchPromises.push((async () => {
            const batch = [];
            const batchCursor = articleCollection.find(query).skip(i * options.batchSize).limit(options.batchSize).sort({ displayDate: -1 });

            while (await batchCursor.hasNext()) {
                const article = await batchCursor.next();
                if (article) {
                    batch.push(requestify(article));
                }
            }

            const batchFileName = `batch-${i}.json`;
            log(color(`writing batch file to bucket: ${batchFileName}`, 'grey'));

            const requestFile = bucket.file(`batch-requests/${batchFileName}`);
            const embeddingFile = bucket.file(`embeddings/${batchFileName}`);

            try {
                await requestFile.save(
                    JSON.stringify(batch, null, 2),
                    { resumable: false, metadata: { contentType: 'application/json' } }
                );
                await embeddingFile.save(
                    JSON.stringify(
                        batch.map((b) => ({ id: b.custom_id, embedding: generateFakeEmbedding() })),
                        null,
                        2
                    ),
                    { resumable: false, metadata: { contentType: 'application/json' } }
                );
                count++
                log(color(`Successfully wrote files: ${batchFileName}`, 'green') + ` (${count}/${numOfBatches})`);
                
                batchFiles.push({ name: batchFileName, count: batch.length });
            } catch (err) {
                log(color(`Error writing batch file: ${batchFileName}`, 'red'));
                return log('\t' + err)
            }
        })());
    }

    await Promise.all(batchPromises); // Wait for all batch operations to complete

    log(color('✅ Successfully', 'green') + ' created batch files');
    log(color('Batch files:', 'grey'), batchFiles.map((b) => b.name).join(', '));
    
    response = { batchFiles, articleCount, numOfBatches, status: 'success' };
    return response;
};

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
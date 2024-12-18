import { LogLevel } from '../utils/log.js'
import color from '../utils/color.js'
import { convert } from "html-to-text"
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '..', 'tmp');

const DEFAULT_OPTIONS = {
    batchSize: 32,
    chunkSize: 4,
}

const chunkArray = (arr, chunkSize) => {
    const results = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        results.push(arr.slice(i, i + chunkSize));
    }
    return results;
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
        "custom_id": String(article._id),
        "method": "POST",
        "url": "/v1/embeddings",
        "body": {
            "model": "text-embedding-3-small",
            "input": `Title: ${article.headline}, Standfirst: ${article.standfirst}, Body: ${getPlaintext(article.body.widgets)}`,
            "encoding_format": "float"
        }}
    )
}

// const generateFakeEmbedding = () => {
//     const embedding = Array.from({ length: 1536 }, () => (Math.random() * 2 - 1) * 0.9999999999);
//     return embedding;
// }

async function handleBatchRequests(db, bucket, logger, state, openaiClient, options = DEFAULT_OPTIONS) {
    await logger.log(LogLevel.INFO, color('Creating Batches', 'grey'), '🔄 Creating batch files...');

    const articleCollection = db.collection('article');
    await articleCollection.createIndex({ displayDate: 1 });

    const cutoff = new Date("2022-01-01T00:00:00.000+00:00");
    await logger.log(LogLevel.INFO, color(`article cutoff date: ${cutoff.toISOString()}`, 'grey'));

    const query = { displayDate: { $gte: cutoff }, state: "Published" };
    const cursor = articleCollection.find(query).limit(10000).sort({ displayDate: -1 });
    const articleCount = await cursor.count();
    let count = 0
    await logger.log(LogLevel.INFO, color(`articles found: ${articleCount}`, 'grey'));

    const numOfBatches = Math.ceil(articleCount / options.batchSize);
    await logger.log(LogLevel.INFO, color(`number of batches: ${numOfBatches}`, 'grey'));

    const batchFiles = [];
    const batchPromises = [];

    const uploadWithTempFile = async (batch, batchFileName, openaiClient, logger) => {
        // Ensure tmp directory exists
        await fs.mkdir(tmpDir, { recursive: true });
        
        const tempFilePath = path.join(tmpDir, batchFileName);
        
        try {
            // Write batch to temp file
            const content = batch
                .map(item => JSON.stringify(item))
                .join('\n') + '\n';
            
            await fs.writeFile(tempFilePath, content, 'utf8');
            
            // Create read stream and upload
            const fileStream = createReadStream(tempFilePath);
            const openaiFile = await openaiClient.files.create({
                file: fileStream,
                purpose: 'batch'
            });
            
            return openaiFile;
        } finally {
            // Cleanup: Delete temp file
            try {
                await fs.unlink(tempFilePath);
            } catch (err) {
                await logger.log(LogLevel.WARN, `Failed to delete temp file: ${tempFilePath}`);
            }
        }
    }

    const handleBatch = async (i) => {
        const articleIds = []
        const batch = [];
        const batchCursor = articleCollection.find(query).skip(i * options.batchSize).limit(options.batchSize).sort({ displayDate: -1 });

        // const jsonlify = (batch) => batch.map(item => JSON.stringify(item)).join('\n') + '\n';

        while (await batchCursor.hasNext()) {
            const article = await batchCursor.next();
            if (article) {
                batch.push(requestify(article));
                articleIds.push(String(article._id));
            }
        }

        const batchFileName = `batch-${i}.jsonl`;
        await logger.log(LogLevel.INFO, color(`writing batch file to bucket: ${batchFileName}`, 'grey'));

        // const embeddingFile = bucket.file(`embeddings/${batchFileName}`);
        const requestFile = bucket.file(`batch-requests/${batchFileName}`);

        try {
            // Create batch file
            const batchDoc = await db.collection('article-embedding-job-batch').insertOne({
                jobId: String(state.jobId),
                articleIds,
                status: 'request_created',
                createdAt: new Date()
            });
            await logger.log(LogLevel.INFO, color(`\tBatch document created: ${batchFileName} - ${batchDoc.insertedId}`, 'grey'));

             // Upload to OpenAI
            const openaiFile = await uploadWithTempFile(batch, batchFileName, openaiClient, logger);
            await logger.log(LogLevel.INFO, color(`\tOpenAi file uploaded: ${openaiFile.id} - ${batchFileName} - ${batchDoc.insertedId}`, 'grey'));

            const openaiBatchResponse = await openaiClient.batches.create({
                input_file_id: openaiFile.id,
                endpoint: "/v1/embeddings",
                completion_window: "24h"
            });

            await logger.log(LogLevel.INFO, color(`\tOpenAi batch created: ${openaiBatchResponse.id} - ${batchFileName} - ${batchDoc.insertedId}`, 'grey'));
            await db.collection('article-embedding-job-batch').updateOne({ _id: batchDoc.insertedId }, { $set: { openaiBatchId: openaiBatchResponse.id, status: 'openai_batch_created' } });
            await logger.log(LogLevel.INFO, color(`\tBatch document updated: ${batchFileName} - ${batchDoc.insertedId}`, 'grey'));

            // await embeddingFile.save(
            //     JSON.stringify(
            //         batch.map((b) => ({ id: b.custom_id, embedding: generateFakeEmbedding() })),
            //         null,
            //         2
            //     ),
            //     { resumable: false, metadata: { contentType: 'application/jsonl' } }
            // );
            await requestFile.save(
                JSON.stringify(batch, null, 2),
                { resumable: false, metadata: { contentType: 'application/jsonl' } }
            );
            count++
            await logger.log(LogLevel.INFO, color(`Successfully wrote files: ${batchFileName}`, 'green') + ` (${count}/${numOfBatches}) - ${Math.floor((count/numOfBatches) * 100)}%`);
            batchFiles.push({ name: batchFileName, count: batch.length });
        } catch (err) {
            await logger.log(LogLevel.ERROR, color(`Error writing batch file: ${batchFileName}`, 'red'));
            await logger.log(LogLevel.INFO, '\t' + err)
            await logger.log(LogLevel.INFO, color(`Retrying: ${batchFileName}`, 'blue') + ` (${count}/${numOfBatches}) - ${Math.floor((count/numOfBatches) * 100)}%`);
            await handleBatch(i)
        }
    }

    for (let i = 0; i < numOfBatches; i++) {
        batchPromises.push(handleBatch(i));
    }

    const chunkedBatches = chunkArray(batchPromises, options.chunkSize)
    for (const chunk of chunkedBatches) {
        await Promise.all(chunk);
    }

    await logger.log(LogLevel.INFO, color('Batch Files Created', 'green'), '✅ Batch files created successfully');
    return 
}

export default handleBatchRequests;

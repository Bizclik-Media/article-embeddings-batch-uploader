import createLogger, { LogLevel } from '../utils/log.js';
import color from '../utils/color.js';

async function updatePinecone(db, logger = createLogger(), state, openaiClient, pineconeClient) {
    await logger.log(LogLevel.INFO, color('Updating Pinecone', 'grey'), '🔄 Updating Pinecone index...');

    const collection = db.collection('article-embedding-job-batch');
    const cursor = collection.find({
        jobId: String(state.jobId),
        status: 'completed'
    });

    const index = pineconeClient.index('article-test');

    while (await cursor.hasNext()) {
        const jobBatch = await cursor.next();

        try {
            // Retrieve the embeddings from OpenAI
            if(!jobBatch.openaiOutputFileId) continue
            const fileResponse = await openaiClient.files.content(jobBatch.openaiOutputFileId);
            const fileContent = await fileResponse.text();  
            await logger.log(LogLevel.INFO, color(`\tRetrieved embeddings for batchId: ${jobBatch.openaiBatchId} from ${jobBatch.openaiOutputFileId}`, 'grey'));
            const upsertPayload = []
            for await (const line of fileContent.split('\n')) {
                if(!line) continue
                const object = JSON.parse(line);
                const id = object.custom_id
                const embedding = object.response.body.data[0].embedding;
                const article = await db.collection('articles').findOne({ _id: id });
                upsertPayload.push({ id, values: embedding, metadata: {
                    headline: article.headline,
                    state: article.state,
                    displayDate: article.displayDate,
                    tags: article.tags,
                    category: article.category,
                    contentType: article.contentType,
                    subContentType: article.subContentType,
                    instance: article.instance,
                    author: article.author,
                }});
            }
            
            // Upsert to Pinecone
            // await index.namespace(String(state.jobId)).upsert(upsertPayload);
            await index.namespace(String(state.jobId)).upsert(upsertPayload);
            await logger.log(LogLevel.INFO, color(`\tUpserted embeddings to Pinecone for batchId: ${jobBatch.openaiBatchId} (length: ${upsertPayload.length})`, 'green'));

            // // Update the batch status to 'upserted'
            await collection.updateOne(
                { _id: jobBatch._id },
                { $set: { status: 'upserted', upsertedAt: new Date() } }
            );
            await logger.log(LogLevel.INFO, color(`\tBatch status updated to 'upserted' for batchId: ${jobBatch.openaiBatchId}`, 'green'));

        } catch (err) {
            await logger.log(LogLevel.ERROR, color(`Error upserting embeddings for batchId: ${jobBatch.openaiBatchId}`, 'red'), err.message);
        }
    }

    await logger.log(LogLevel.INFO, color('Pinecone update complete', 'grey'), '✅ Pinecone index updated.');
}

export default updatePinecone;
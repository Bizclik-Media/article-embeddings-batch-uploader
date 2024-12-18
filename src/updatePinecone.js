import createLogger, { LogLevel } from '../utils/log.js';
import color from '../utils/color.js';
import { ObjectId } from 'mongodb';

async function updatePinecone(db, logger = createLogger(), state, openaiClient, pineconeClient) {
    await logger.log(LogLevel.INFO, color('Updating Pinecone', 'grey'), '🔄 Updating Pinecone index...');

    const index = pineconeClient.index('article-test');
    const collection = db.collection('article-embedding-job-batch');
    const query = {
        jobId: String(state.jobId),
        status: 'completed'
    };
    const count = await collection.countDocuments(query);
    await logger.log(LogLevel.INFO, color(`Found ${count} completed batches to process.`, 'grey'));


    const cursor = collection.find(query);
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
                const article = await db.collection('article').findOne({ _id: ObjectId(id) });
                let metadata = {};
                if(article) {
                    if (article._id) metadata._id = ObjectId(article._id);
                    if (article.headline) metadata.headline = article.headline;
                    if (article.state) metadata.state = article.state;
                    if (article.displayDate) metadata.displayDate = article.displayDate;
                    if (article.tags) metadata.tags = article.tags.map((t) => t.tag);
                    if (article.category) metadata.category = article.category;
                    if (article.contentType) metadata.contentType = article.contentType;
                    if (article.subContentType) metadata.subContentType = article.subContentType;
                    if (article.instance) metadata.instance = article.instance;
                    if (article.author) metadata.author = article.author;
                }
                logger.log(LogLevel.INFO, color('\tArticle metadata:', 'grey'), JSON.stringify(metadata));
                upsertPayload.push({ id, values: embedding, metadata});
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
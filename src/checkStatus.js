import createLogger, { LogLevel } from '../utils/log.js';
import color from '../utils/color.js';

const DEFAULT_OPTIONS = {
    pollingInterval: 1000 * 60 * 5 // 60 seconds (5 minute)
};
async function checkStatus(
    db,
    logger = createLogger(),
    state,
    openaiClient,
    options = DEFAULT_OPTIONS
) {
    const collection = db.collection('article-embedding-job-batch');
    const query = { jobId: String(state.jobId), status: 'openai_batch_created' }

    async function pollBatches() {
        const count = await collection.countDocuments(query);

        if (count === 0) {
            // No open batches left, stop polling
            await logger.log(LogLevel.INFO, color('✅ All batches are complete or failed. Status check finished.', 'green'));
            return;
        }

        const cursor = collection.find(query);

        while (await cursor.hasNext()) {
            const jobBatch = await cursor.next();

            try {
                const batch = await openaiClient.batches.retrieve(jobBatch.openaiBatchId);
                await logger.log(
                    LogLevel.INFO,
                    color(`\tRetrieved batch status: ${batch.status} for batchId: ${jobBatch.openaiBatchId}`, 'grey')
                );

                if (batch.status === 'completed') {
                    await collection.updateOne(
                        { _id: jobBatch._id },
                        { $set: 
                            { 
                                status: 'completed',
                                completedAt: batch.completed_at,
                                openaiOutputFileId: batch.output_file_id, 
                                openaiInputFileId: batch.input_file_id 
                            } 
                        }
                    );
                    await logger.log(
                        LogLevel.INFO,
                        color(`\tBatch completed: ${jobBatch.openaiBatchId}`, 'green')
                    );
                } else if (batch.status === 'failed') {
                    await collection.updateOne(
                        { _id: jobBatch._id },
                        { $set: 
                            { 
                                status: 'failed',
                                failedAt: batch.failed_at, 
                                openaiErrorFileId: batch.error_file_id,
                                openaiInputFileId: batch.input_file_id 
                            } 
                        }
                    );
                    await logger.log(
                        LogLevel.ERROR,
                        color(`\tBatch failed: ${jobBatch.openaiBatchId}`, 'red')
                    );
                } else {
                    await logger.log(
                        LogLevel.INFO,
                        color(`\tBatch in progress: ${jobBatch.openaiBatchId}`, 'yellow')
                    );
                }
            } catch (err) {
                await logger.log(
                    LogLevel.ERROR,
                    color(`Error retrieving batch status for batchId: ${jobBatch.openaiBatchId}`, 'red'),
                    err.message
                );
            }
        }

        // Re-run after polling interval
        await logger.log(LogLevel.INFO, color('Re-checking status after interval...', 'grey'));
        return new Promise(resolve => setTimeout(() => resolve(pollBatches()), options.pollingInterval));

    }

    // Start polling
    await logger.log(LogLevel.INFO, color('Starting batch status check...', 'grey'), '🔄 Checking status...');
    await pollBatches();
    return 
}

export default checkStatus;

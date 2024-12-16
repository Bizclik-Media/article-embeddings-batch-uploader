import log from "../utils/log.js";
import color from "../utils/color.js";
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY
 });

const sendRequest = async (db, bucket) => {
    const [files] = await bucket.getFiles();

    for (const file of files) {
        const filename = file.name.split('/')[1];
        log(color('Bucket: ', 'blue'), filename);
        await bucket.file(filename).download();

        const openaiFile = await openai.files.create({
            file: fs.createReadStream(filename),
            purpose: 'batch'
        })

        log(color('OpenAi', 'blue'), openaiFile);
    }


    
}

export default sendRequest;
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"; // Import getSignedUrl function
import s3Client from "./s3.js";

const gets3Dataurl = async (req : any, reply : any) => {
    try {
        const { Pid, size } = req.params;
        const params = {
            Bucket: "revo365",
            Prefix: `product/${Pid}/${size}/`,
            Delimiter: '/',
        };
        console.log(params);
        const listCommand = new ListObjectsV2Command(params);
        const data = await s3Client.send(listCommand);
        console.log(data);
        if (!data.Contents) {
            return reply.send({ message: 'No files found for the specified folder' });
        }

        const urls = [];
        for (const obj of data.Contents) {
            const getObjectParams = {
                Bucket: params.Bucket,
                Key: obj.Key
            };
            const getObjectCommand = new GetObjectCommand(getObjectParams);
            const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 3600 });
            urls.push(url);
        }

        reply.send({ urls });
    } catch (err) {
        console.error('Error retrieving object from S3:', err);
        reply.status(500).send({ error: 'Internal server error' });
    }
};


const gets3DataStream = async (req, reply) => {
    const params = {
        Bucket: "revo365",
        Key: 'product/152/Large/large_2024-03-14T04-25-16.006Z-test.png',
        Delimiter: '/',
    };
    const getObjectCommand = new GetObjectCommand(params);
    console.log(reply);
    try {

        //starts streaming image directly 
        const response = await s3Client.send(getObjectCommand);
        const bodyBuffer: any = await streamToBuffer(response.Body);
        reply.type('image/png');
        reply.send(bodyBuffer);
        // ends 
    } catch (err) {
        console.error('Error retrieving object from S3:', err);
    }
};

const streamToBuffer = async (stream: any) => {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};


export  { gets3Dataurl, gets3DataStream };




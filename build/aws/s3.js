import { S3Client } from "@aws-sdk/client-s3";
import { ACCESSKEYID, SECRETACCESSKEY, REGION } from '../config/config.js';
const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: ACCESSKEYID,
        secretAccessKey: SECRETACCESSKEY,
    },
});
export default s3Client;
//# sourceMappingURL=s3.js.map
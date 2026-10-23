import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3Client from "./s3.js";
import fs from "fs";
let successCount = 0;
let failureCount = 0;
const uploadtos3 = async (filestoupload: any, productId: any) => {
    try {
        for (const key in filestoupload) {
            let folderName = key
            if (filestoupload.hasOwnProperty(key)) {
                const fileList = filestoupload[key];
                for (const file of fileList) {
                    let resultofupdateds3 = await uploads3File(file, productId, folderName);
                    if (resultofupdateds3 !== null) {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                }
            }
        }
        return `Upload complete. Success count:, ${successCount}, Failure count: ${failureCount}`
    } catch (error) {
        return `Error in getting s3 URL : ${error.message}`
    }
};


async function uploads3File(filedata: any, productId: any, folderName: any) {
    try {
        const bucketName = "revo365";
        const { Path, file } = filedata;
        let key = `product/${productId}/${folderName}/` + file;

        const fileStream = fs.createReadStream(Path);
        const params: any = {
            Bucket: bucketName,
            Key: key,
            Body: fileStream,
            ACL: "public-read",
        };
        const data = await s3Client.send(new PutObjectCommand(params));
        console.log(`File ${file} uploaded successfully to S3: ${JSON.stringify(data)}`);
        return data
    } catch (error) {
        console.error(`Error uploading to S3:`, error);
        return null; // Return null in case of error
    }
}

export default uploadtos3;



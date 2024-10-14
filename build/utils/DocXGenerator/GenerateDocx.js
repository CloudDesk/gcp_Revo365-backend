import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path, { dirname } from "path";
import util from "util";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { PROTOCOL } from "../../config/config.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log(__dirname, "DIRNAME");
const uploadsDir = path.resolve(__dirname, "../../../uploads");
console.log(uploadsDir, "uploadsDIR");
const execAsync = util.promisify(exec);
let returnResult;
let globaltemplate;
const GenerateDocx = async (request, data, template) => {
    try {
        globaltemplate = template;
        console.log(globaltemplate, "global template");
        returnResult = request;
        for (const e of data) {
            let finalOutput = await fileGeneration(e);
            return finalOutput;
        }
    }
    catch (error) {
        return error.message;
    }
};
const fileGeneration = async (data) => {
    try {
        const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);
        // console.log(data.id, "File Generation data");
        const content = fs.readFileSync(
        // path.resolve("po/REVO 365Attach Invoice 1.docx"),
        // path.resolve("po/Revo-PO.docx"),
        path.resolve(globaltemplate), "binary");
        const zip = new PizZip(content);
        // console.log(zip, "zip");
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter() {
                return "-";
            },
        });
        await doc.render(data);
        const buf = doc.getZip().generate({
            type: "nodebuffer",
            compression: "DEFLATE",
        });
        const pdfFilePath = path.resolve(`${uploadsDir}/${data.ponumber ? data.ponumber : data.prnumber ? data.prnumber : data.invoicenumber ? data.invoicenumber : data.ticketnumber ? data.ticketnumber : "Revo"}.pdf`);
        // const docxFilePath = path.resolve(
        //   // `${data.name}_PaySlip_${data.paySlipMonth}_${data.paySlipYear}.docx`
        //   `${uploadsDir}/${data.ponumber ? data.ponumber : data.prnumber ? data.prnumber : data.invoicenumber ? data.invoicenumber : data.ticketnumber ? data.ticketnumber : "Revo" || currentEpochTimeInSeconds}.docx`
        // );
        const docxFilePath = path.resolve(`${uploadsDir}/${data.ponumber ||
            data.prnumber ||
            data.invoicenumber ||
            data.ticketnumber ||
            (currentEpochTimeInSeconds ? currentEpochTimeInSeconds : "Revo")}.docx`);
        // console.log(docxFilePath, "docxfilepath");
        fs.writeFileSync(docxFilePath, buf);
        console.log(data.id, "data id is");
        console.log(pdfFilePath, "pdf file path");
        let result = await convertToPdf(docxFilePath, pdfFilePath, data.id);
        return result;
    }
    catch (error) {
        return error.message;
    }
};
const convertToPdf = async (docxFilePath, pdfFilePath, id) => {
    try {
        let fileurl;
        const command = `soffice --headless --convert-to pdf "${docxFilePath}" --outdir "${uploadsDir}"`;
        const { stdout, stderr } = await execAsync(command);
        // console.log("PDF Generated Successfully", stdout);
        console.log(pdfFilePath, " PDF FILE PATH ");
        var filename = pdfFilePath.replace(/^.*[\\/]/, "");
        console.log(filename, "FILE NAME IS");
        // fileurl = returnResult.protocol + "s://" + returnResult.headers.host + '/' + filename
        console.log(PROTOCOL, 'PROTOCOL IS DATA');
        fileurl = PROTOCOL + "://" + returnResult.headers.host + "/" + filename;
        if (stderr) {
            console.log("Stderr", stderr);
            return stderr;
        }
        // console.log(fileurl,'-- file URL');
        console.log(id, fileurl, "eee");
        return { fileurl, id };
    }
    catch (error) {
        console.error("Error :", error);
    }
};
export default GenerateDocx;
//# sourceMappingURL=GenerateDocx.js.map
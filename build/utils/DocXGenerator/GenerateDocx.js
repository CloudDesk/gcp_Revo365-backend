import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path, { dirname } from "path";
import util from "util";
import os from "os";
import { exec, execFile } from "child_process";
import { fileURLToPath } from "url";
import { PROTOCOL } from "../../config/config.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log(__dirname, "DIRNAME");
const uploadsDir = path.resolve(__dirname, "../../../uploads");
console.log(uploadsDir, "uploadsDIR");
const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);
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
        await removeTrailingBlankPdfPages(pdfFilePath);
        // console.log(fileurl,'-- file URL');
        console.log(id, fileurl, "eee");
        return { fileurl, id };
    }
    catch (error) {
        console.error("Error :", error);
    }
};
export const removeTrailingBlankPdfPages = async (pdfFilePath) => {
    let tempDir = "";
    try {
        if (!fs.existsSync(pdfFilePath)) {
            return;
        }
        const { stdout: infoOutput } = await execFileAsync("pdfinfo", [pdfFilePath]);
        const pageMatch = infoOutput.match(/^Pages:\s+(\d+)/m);
        const pageCount = pageMatch ? Number(pageMatch[1]) : 0;
        if (!Number.isFinite(pageCount) || pageCount <= 1) {
            return;
        }
        let lastContentPage = 0;
        for (let page = pageCount; page >= 1; page -= 1) {
            if (!(await isPdfPageVisuallyBlank(pdfFilePath, page))) {
                lastContentPage = page;
                break;
            }
        }
        if (lastContentPage >= pageCount || lastContentPage <= 0) {
            return;
        }
        const { PDFDocument } = await import("pdf-lib");
        const sourceBuffer = fs.readFileSync(pdfFilePath);
        const sourceBytes = sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength);
        const sourcePdf = await PDFDocument.load(sourceBytes);
        const trimmedPdf = await PDFDocument.create();
        const copiedPages = await trimmedPdf.copyPages(sourcePdf, Array.from({ length: lastContentPage }, (_, index) => index));
        copiedPages.forEach((page) => trimmedPdf.addPage(page));
        fs.writeFileSync(pdfFilePath, await trimmedPdf.save());
        console.log(`Removed ${pageCount - lastContentPage} trailing blank page(s) from ${pdfFilePath}`);
    }
    catch (error) {
        console.error(`Trailing blank PDF page cleanup skipped for ${pdfFilePath}:`, error?.message || error);
    }
    finally {
        if (tempDir) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            catch {
                // ignore cleanup failures
            }
        }
    }
};
const isPdfPageVisuallyBlank = async (pdfFilePath, page) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "revo-pdf-page-"));
    try {
        const pagePrefix = path.join(tempDir, `page-${page}`);
        const pgmFilePath = `${pagePrefix}.pgm`;
        await execFileAsync("pdftoppm", [
            "-f",
            String(page),
            "-l",
            String(page),
            "-singlefile",
            "-r",
            "18",
            "-gray",
            pdfFilePath,
            pagePrefix,
        ]);
        const imageBuffer = fs.readFileSync(pgmFilePath);
        const pixelOffset = getPgmPixelDataOffset(imageBuffer);
        if (pixelOffset <= 0 || pixelOffset >= imageBuffer.length) {
            return false;
        }
        let nonWhitePixels = 0;
        const totalPixels = imageBuffer.length - pixelOffset;
        for (let index = pixelOffset; index < imageBuffer.length; index += 1) {
            if (imageBuffer[index] < 245) {
                nonWhitePixels += 1;
            }
        }
        return nonWhitePixels / Math.max(totalPixels, 1) < 0.0002;
    }
    finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        catch {
            // ignore cleanup failures
        }
    }
};
const getPgmPixelDataOffset = (buffer) => {
    let index = 0;
    let tokensRead = 0;
    while (index < buffer.length && tokensRead < 4) {
        while (index < buffer.length &&
            (buffer[index] === 9 ||
                buffer[index] === 10 ||
                buffer[index] === 13 ||
                buffer[index] === 32)) {
            index += 1;
        }
        if (buffer[index] === 35) {
            while (index < buffer.length && buffer[index] !== 10) {
                index += 1;
            }
            continue;
        }
        while (index < buffer.length &&
            buffer[index] !== 9 &&
            buffer[index] !== 10 &&
            buffer[index] !== 13 &&
            buffer[index] !== 32) {
            index += 1;
        }
        tokensRead += 1;
    }
    while (index < buffer.length &&
        (buffer[index] === 9 ||
            buffer[index] === 10 ||
            buffer[index] === 13 ||
            buffer[index] === 32)) {
        index += 1;
    }
    return index;
};
export default GenerateDocx;
//# sourceMappingURL=GenerateDocx.js.map
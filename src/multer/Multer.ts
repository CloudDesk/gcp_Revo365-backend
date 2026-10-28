import Multer from 'fastify-multer';
import { fileURLToPath } from 'url';
import { dirname, join,resolve  } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '../../uploads');
mkdirSync(parentDir, { recursive: true });
const fileMaxSize = 150 * 1024 * 1024;


const storage = Multer.diskStorage({
  destination: (req, file, cb) => {
    const ROOT_PATH = parentDir;

     cb(null,ROOT_PATH)
  },
  filename: (req, file, cb) => {
    cb(
      null,
      new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname
    );
  }
});

const upload = Multer({
  storage: storage,
  limits: { fileSize: fileMaxSize }
});

const filesUpload:any = upload.array('file');

// Journal attachments have a stricter contract than the application's legacy
// upload endpoints. Keep the file in memory so its contents can be verified
// before anything is written to disk, accept exactly one file, and reject
// oversized uploads at the multipart boundary.
const journalAttachmentUpload: any = Multer({
  storage: Multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single('file');

export { filesUpload, journalAttachmentUpload, Multer };

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'node_modules', 'long', 'umd', 'index.d.ts');

if (fs.existsSync(filePath)) {
    const content = `import Long = require("../index");
export = Long;`;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed node_modules/long/umd/index.d.ts');
} else {
    console.log('File not found: ' + filePath);
}

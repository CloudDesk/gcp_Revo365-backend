import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { GMAIL_AUTH_PASSWORD, GMAIL_AUTH_USER, GMAIL_HOST, GMAIL_PORT, GMAIL_SERVICE } from '../config/config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '..');
let mailOptions;
export const sendMail = async (request, reply) => {
    const { to, cc, subject, text } = request.body;
    mailOptions = {
        from: '"TEQIT" <teqitcontact@gmail.com>',
        to: to,
        cc: cc,
        subject: subject,
        text: text,
    };
    if (request.files && request.files.length > 0) {
        mailOptions.attachments = request.files.map((file) => {
            const filepath = join(parentDir, "../uploads", file.filename);
            return { filename: file.filename, path: filepath };
        });
    }
    const transporter = nodemailer.createTransport({
        service: GMAIL_SERVICE,
        host: GMAIL_HOST,
        port: GMAIL_PORT,
        secure: true,
        auth: {
            user: GMAIL_AUTH_USER,
            pass: GMAIL_AUTH_PASSWORD,
        },
    });
    transporter.sendMail(mailOptions, (error, info) => {
        console.log('Mail Options:', mailOptions);
        console.log('%csrc/Gmail/gmail.ts:40 e', 'color: #007acc;', error);
        if (error) {
            if (reply) {
                reply.status(404).send('Error Sending Email');
            }
            else {
                return 'Error Sending Email';
            }
        }
        else {
            if (reply) {
                reply.send("Email Sent Successfully");
            }
            else {
                return 'Email Sent Successfully';
            }
        }
    });
};
//# sourceMappingURL=gmail.js.map
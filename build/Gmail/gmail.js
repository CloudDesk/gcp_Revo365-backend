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
    console.log(to);
    console.log(subject);
    console.log(text);
    mailOptions = {
        from: '"Revo" <pravinsf24@gmail.com>',
        to: to,
        cc: cc,
        subject: subject,
        text: text,
    };
    console.log(request.files);
    if (request.files && request.files.length > 0) {
        mailOptions.attachments = request.files.map((file) => {
            const filepath = join(parentDir, "../uploads", file.filename);
            return { filename: file.filename, path: filepath };
        });
    }
    console.log(mailOptions);
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
        if (error) {
            console.error("Error sending email: ", error);
            if (reply) {
                reply.status(404).send('Error Sending Email');
            }
            else {
                return 'Error Sending Email';
            }
        }
        else {
            console.log("Email sent: ", info.response);
            console.log(reply, 'Reply is ');
            if (reply) {
                reply.send("Email Sent Successfully");
            }
            else {
                console.log(`Else PART`);
                return 'Email Sent Successfully';
            }
        }
    });
};
//# sourceMappingURL=gmail.js.map
import nodemailer from 'nodemailer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { MAIL_AUTH_PASSWORD, MAIL_AUTH_USER, MAIL_HOST, MAIL_PORT, MAIL_SERVICE, } from '../config/config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '..');
const mailLogPath = join(parentDir, '../mail.log');
const writeMailLog = (level, event, data) => {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            ...data,
        };
        fs.appendFileSync(mailLogPath, `${JSON.stringify(entry)}\n`);
    }
    catch (logError) {
        console.error("[mail:log] Failed to write mail log", logError?.message || logError);
    }
};
// ─── Singleton transporter ───────────────────────────────────────────────────
// Created once at module load. Reuses the same SMTP connection pool across all
// calls instead of opening a new TLS handshake per email.
const resolvedMailPort = Number(MAIL_PORT || 465);
const resolvedMailHost = MAIL_HOST || "smtp.gmail.com";
const transporter = nodemailer.createTransport({
    service: MAIL_SERVICE || undefined,
    host: resolvedMailHost,
    port: resolvedMailPort,
    secure: resolvedMailPort === 465,
    auth: {
        user: MAIL_AUTH_USER,
        pass: MAIL_AUTH_PASSWORD,
    },
});
export const verifyMailTransport = async () => {
    const metadata = {
        host: resolvedMailHost,
        port: resolvedMailPort,
        secure: resolvedMailPort === 465,
        user: MAIL_AUTH_USER || null,
    };
    console.log("[mail:init] Verifying SMTP transporter", metadata);
    writeMailLog("INFO", "mail_init_verifying", metadata);
    try {
        await transporter.verify();
        console.log("[mail:init] SMTP transporter verified successfully", metadata);
        writeMailLog("INFO", "mail_init_verified", metadata);
    }
    catch (error) {
        const errorMetadata = {
            ...metadata,
            error: error?.message || error,
        };
        console.error("[mail:init] SMTP transporter verification failed", errorMetadata);
        writeMailLog("ERROR", "mail_init_failed", errorMetadata);
        throw error;
    }
};
// ─── Internal transactional utility ─────────────────────────────────────────
// Used by all service-layer callers (orders, tickets, OTP).
// Returns a Promise that resolves only after Gmail confirms delivery (or throws).
export const sendTransactionalMail = async (payload) => {
    const mailOptions = {
        from: `"Teqit" <${MAIL_AUTH_USER}>`,
        to: payload.to,
        cc: payload.cc,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments,
    };
    const metadata = {
        host: resolvedMailHost,
        port: resolvedMailPort,
        secure: resolvedMailPort === 465,
        to: payload.to,
        cc: payload.cc || null,
        subject: payload.subject,
    };
    console.log("[sendTransactionalMail] Attempting SMTP send", metadata);
    writeMailLog("INFO", "mail_send_attempt", metadata);
    try {
        const info = await transporter.sendMail(mailOptions);
        const successMetadata = {
            ...metadata,
            messageId: info?.messageId || null,
            response: info?.response || null,
            accepted: info?.accepted || [],
            rejected: info?.rejected || [],
        };
        console.log("[sendTransactionalMail] Mail sent successfully", successMetadata);
        writeMailLog("INFO", "mail_send_success", successMetadata);
    }
    catch (error) {
        const errorMetadata = {
            ...metadata,
            error: error?.message || error,
        };
        console.error("[sendTransactionalMail] Mail send failed", errorMetadata);
        writeMailLog("ERROR", "mail_send_failed", errorMetadata);
        throw error;
    }
};
// ─── Fastify route handler  (POST /gmail) ────────────────────────────────────
// Kept as the public HTTP endpoint for ad-hoc / manual email sends.
// Signature stays compatible with the existing route registration in routes.ts.
export const sendMail = async (request, reply) => {
    try {
        const { to, cc, subject, text } = request.body;
        const attachments = request.files && request.files.length > 0
            ? request.files.map((file) => ({
                filename: file.filename,
                path: join(parentDir, '../uploads', file.filename),
            }))
            : undefined;
        await sendTransactionalMail({ to, cc, subject, text, attachments });
        reply.send({ success: true, message: 'Email sent successfully' });
    }
    catch (error) {
        console.error('[sendMail] Failed to send email:', error?.message || error);
        reply.status(500).send({ success: false, message: 'Error sending email' });
    }
};
//# sourceMappingURL=gmail.js.map
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import {
    GMAIL_AUTH_PASSWORD,
    GMAIL_AUTH_USER,
    GMAIL_HOST,
    GMAIL_PORT,
    GMAIL_SERVICE,
} from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = resolve(__dirname, '..');

// ─── Singleton transporter ───────────────────────────────────────────────────
// Created once at module load. Reuses the same SMTP connection pool across all
// calls instead of opening a new TLS handshake per email.
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

// ─── Typed payload interface ─────────────────────────────────────────────────
export interface MailPayload {
    to: string;
    cc?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: { filename: string; path: string }[];
}

// ─── Internal transactional utility ─────────────────────────────────────────
// Used by all service-layer callers (orders, tickets, OTP).
// Returns a Promise that resolves only after Gmail confirms delivery (or throws).
export const sendTransactionalMail = async (payload: MailPayload): Promise<void> => {
    const mailOptions = {
        from: `"Revo" <${GMAIL_AUTH_USER}>`,
        to: payload.to,
        cc: payload.cc,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("[sendTransactionalMail] Mail sent", {
        to: payload.to,
        cc: payload.cc || null,
        subject: payload.subject,
        messageId: info?.messageId || null,
        accepted: info?.accepted || [],
        rejected: info?.rejected || [],
    });
};

// ─── Fastify route handler  (POST /gmail) ────────────────────────────────────
// Kept as the public HTTP endpoint for ad-hoc / manual email sends.
// Signature stays compatible with the existing route registration in routes.ts.
export const sendMail = async (request: any, reply: any): Promise<void> => {
    try {
        const { to, cc, subject, text } = request.body;

        const attachments =
            request.files && request.files.length > 0
                ? request.files.map((file: any) => ({
                      filename: file.filename,
                      path: join(parentDir, '../uploads', file.filename),
                  }))
                : undefined;

        await sendTransactionalMail({ to, cc, subject, text, attachments });
        reply.send({ success: true, message: 'Email sent successfully' });
    } catch (error: any) {
        console.error('[sendMail] Failed to send email:', error?.message || error);
        reply.status(500).send({ success: false, message: 'Error sending email' });
    }
};

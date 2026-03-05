"use strict";
/**
 * PADocs — Firebase Cloud Functions
 *
 * Triggered on: mailQueue/{docId} creation
 *
 * Reads queued email documents and sends them via Resend.
 * Provider-agnostic: swap Resend for any provider by changing
 * the sendEmail() function only — no other code changes needed.
 *
 * Email Templates:
 *   - teacher-invite:    Activation link for approved teachers
 *   - teacher-rejected:  Rejection notice (not on approved list)
 *   - teacher-activated: Welcome after successful activation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMailQueue = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
// ── Init ──────────────────────────────────────────────────────────────────
admin.initializeApp();
// Secret stored securely in Google Secret Manager.
// Set via: firebase functions:secrets:set RESEND_API_KEY
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
// ── Email Templates ───────────────────────────────────────────────────────
function renderTemplate(template, data) {
    const schoolName = String(data.schoolName ?? 'your school');
    const activationUrl = String(data.activationUrl ?? '');
    const expiresInHours = Number(data.expiresInHours ?? 72);
    const baseStyle = `
    font-family: 'Segoe UI', Arial, sans-serif;
    max-width: 560px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  `;
    const headerStyle = `
    background: #4f46e5;
    padding: 32px 40px;
    text-align: center;
  `;
    const bodyStyle = `padding: 32px 40px;`;
    const footerStyle = `
    padding: 20px 40px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
  `;
    const btnStyle = `
    display: inline-block;
    background: #4f46e5;
    color: #ffffff !important;
    text-decoration: none;
    padding: 14px 32px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 15px;
    margin: 24px 0;
  `;
    const h1Style = `margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;`;
    const h2Style = `margin: 0 0 16px; color: #111827; font-size: 20px;`;
    const pStyle = `color: #4b5563; line-height: 1.6; margin: 0 0 12px;`;
    const logo = `<div style="${headerStyle}"><h1 style="${h1Style}">PADocs</h1></div>`;
    const footer = `<div style="${footerStyle}">PADocs — Plateforme d'Automatisation des Documents<br/>This is an automated message, please do not reply.</div>`;
    switch (template) {
        case 'teacher-invite':
            return {
                subject: `You're invited to join ${schoolName} on PADocs`,
                html: `
          <div style="${baseStyle}">
            ${logo}
            <div style="${bodyStyle}">
              <h2 style="${h2Style}">You've been invited! 🎉</h2>
              <p style="${pStyle}">
                <strong>${schoolName}</strong> has added you as a teacher on PADocs.
                Click the button below to activate your account and set your password.
              </p>
              <div style="text-align:center;">
                <a href="${activationUrl}" style="${btnStyle}">Activate My Account</a>
              </div>
              <p style="${pStyle}">
                This link expires in <strong>${expiresInHours} hours</strong>.
                If you did not expect this invitation, you can safely ignore this email.
              </p>
              <p style="font-size:12px;color:#9ca3af;word-break:break-all;">
                Or copy this link: ${activationUrl}
              </p>
            </div>
            ${footer}
          </div>
        `,
            };
        case 'teacher-rejected':
            return {
                subject: `PADocs - Account Request`,
                html: `
          <div style="${baseStyle}">
            ${logo}
            <div style="${bodyStyle}">
              <h2 style="${h2Style}">Account Request</h2>
              <p style="${pStyle}">
                Your email address is not currently on the approved teacher list for
                <strong>${schoolName}</strong>.
              </p>
              <p style="${pStyle}">
                If you believe this is an error, please contact your school administrator
                to have your email added to the approved list.
              </p>
            </div>
            ${footer}
          </div>
        `,
            };
        case 'teacher-activated':
            return {
                subject: `Welcome to ${schoolName} on PADocs!`,
                html: `
          <div style="${baseStyle}">
            ${logo}
            <div style="${bodyStyle}">
              <h2 style="${h2Style}">Welcome aboard! 🚀</h2>
              <p style="${pStyle}">
                Your teacher account at <strong>${schoolName}</strong> is now active on PADocs.
              </p>
              <p style="${pStyle}">
                You can now sign in and start using the document automation platform.
              </p>
              <div style="text-align:center;">
                <a href="${process.env.FRONTEND_URL ?? 'https://padocs.app'}/auth" style="${btnStyle}">
                  Sign In to PADocs
                </a>
              </div>
            </div>
            ${footer}
          </div>
        `,
            };
        default:
            return {
                subject: 'PADocs Notification',
                html: `<p>You have a new notification from PADocs.</p>`,
            };
    }
}
// ── Send via Resend ───────────────────────────────────────────────────────
async function sendEmail(params) {
    const resend = new resend_1.Resend(params.apiKey);
    const { error } = await resend.emails.send({
        from: 'PADocs <onboarding@resend.dev>', // → replace with your domain later
        to: params.to,
        subject: params.subject,
        html: params.html,
    });
    if (error)
        throw new Error(`Resend error: ${JSON.stringify(error)}`);
}
// ── Cloud Function — Firestore Trigger ────────────────────────────────────
exports.processMailQueue = (0, firestore_1.onDocumentCreated)({
    document: 'mailQueue/{docId}',
    database: 'padocdatabase',
    secrets: [resendApiKey],
    region: 'us-central1',
}, async (event) => {
    const docId = event.params.docId;
    const data = event.data?.data();
    if (!data) {
        console.error('[processMailQueue] No data in event for doc:', docId);
        return;
    }
    const apiKey = resendApiKey.value();
    if (!apiKey) {
        console.error('[processMailQueue] RESEND_API_KEY secret is empty!');
        await event.data.ref.update({ status: 'failed', error: 'RESEND_API_KEY not configured' });
        return;
    }
    const { to, template, data: templateData } = data;
    console.log(`[processMailQueue] Processing: ${template} → ${to}`);
    await event.data.ref.update({ status: 'processing', startedAt: admin.firestore.FieldValue.serverTimestamp() });
    try {
        const { subject, html } = renderTemplate(template, templateData);
        await sendEmail({ apiKey, to, subject, html });
        await event.data.ref.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[processMailQueue] ✓ Sent: ${template} → ${to}`);
    }
    catch (err) {
        console.error(`[processMailQueue] ✗ Failed: ${template} → ${to}`, err);
        await event.data.ref.update({
            status: 'failed',
            error: String(err),
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
});
//# sourceMappingURL=index.js.map
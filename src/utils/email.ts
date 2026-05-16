import fs from 'fs';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Resend } from 'resend';
import { config } from '../config';
import { r2Client, r2Url } from '../config/r2';

let _resend: Resend | null = null;
const getResend = () => {
    if (!_resend) _resend = new Resend(config.resendApiKey);
    return _resend;
};

const LOGO_R2_KEY = 'assets/logo.png';
const LOGO_URL = r2Url(LOGO_R2_KEY);

/** Called once at server startup — uploads logo.png to R2 so it's reachable by email clients. */
export async function ensureLogoUploaded(): Promise<void> {
    const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
    try {
        const body = fs.readFileSync(logoPath);
        await r2Client.send(new PutObjectCommand({
            Bucket: config.r2.bucket,
            Key: LOGO_R2_KEY,
            Body: body,
            ContentType: 'image/png',
        }));
    } catch (err) {
        console.warn('Could not upload email logo to R2:', err);
    }
}

interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
    from?: string;
}

export const sendEmail = async (options: EmailOptions) => {
    const { data, error } = await getResend().emails.send({
        from: options.from ?? config.email.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
    });

    if (error) {
        console.error('Email send error:', error);
        throw error;
    }

    return data;
};

const logoImgTag = `<img src="${LOGO_URL}" alt="Udarsy" width="64" height="64" style="border-radius:50%;border:3px solid rgba(255,255,255,0.3);display:block;margin:0 auto 12px;" />`;

export const sendVerificationEmail = async (to: string, token: string) => {
    const link = `${config.frontendUrl}/verify-email?token=${token}`;

    return sendEmail({
        to,
        subject: 'تأكيد بريدك الإلكتروني — Udarsy',
        text: `مرحباً! اضغط على هذا الرابط لتأكيد بريدك الإلكتروني: ${link}\n\nهذا الرابط صالح لمدة 24 ساعة.`,
        html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#3aaa6a;padding:28px 40px 24px;text-align:center;">
      ${logoImgTag}
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Udarsy</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:12px;">منصة التعلم الرقمي</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:20px;font-weight:700;">تأكيد بريدك الإلكتروني</h2>
      <p style="color:#555;line-height:1.8;margin:0 0 8px;font-size:15px;">
        مرحباً! شكراً لتسجيلك في Udarsy.
      </p>
      <p style="color:#555;line-height:1.8;margin:0 0 32px;font-size:15px;">
        اضغط على الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${link}" style="background:#3aaa6a;color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">
          تأكيد البريد الإلكتروني
        </a>
      </div>
      <p style="color:#999;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #f0f0f0;padding-top:20px;">
        هذا الرابط صالح لمدة <strong>24 ساعة</strong>. إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.
        <br><br>
        Ce lien est valable <strong>24 heures</strong>. Si vous n'avez pas créé ce compte, ignorez cet email.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#bbb;font-size:12px;margin:0;">© 2025 Udarsy · contact@udarsy.com</p>
    </div>
  </div>
</body>
</html>`,
    });
};

export const sendPasswordResetEmail = async (to: string, token: string) => {
    const link = `${config.frontendUrl}/reset-password?token=${token}`;

    return sendEmail({
        to,
        from: '"Udarsy" <noreply@udarsy.com>',
        subject: 'إعادة تعيين كلمة المرور — Udarsy',
        text: `اضغط على هذا الرابط لإعادة تعيين كلمة مرورك: ${link}\n\nهذا الرابط صالح لمدة ساعة واحدة فقط.`,
        html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#3aaa6a;padding:28px 40px 24px;text-align:center;">
      ${logoImgTag}
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Udarsy</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:12px;">منصة التعلم الرقمي</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:20px;font-weight:700;">إعادة تعيين كلمة المرور</h2>
      <p style="color:#555;line-height:1.8;margin:0 0 8px;font-size:15px;">
        تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في Udarsy.
      </p>
      <p style="color:#555;line-height:1.8;margin:0 0 32px;font-size:15px;">
        اضغط على الزر أدناه لإنشاء كلمة مرور جديدة.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${link}" style="background:#3aaa6a;color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">
          إعادة تعيين كلمة المرور
        </a>
      </div>
      <p style="color:#999;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #f0f0f0;padding-top:20px;">
        هذا الرابط صالح لمدة <strong>ساعة واحدة</strong> فقط. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة — حسابك بأمان.
        <br><br>
        Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email — votre compte est en sécurité.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#bbb;font-size:12px;margin:0;">© 2025 Udarsy · contact@udarsy.com</p>
    </div>
  </div>
</body>
</html>`,
    });
};

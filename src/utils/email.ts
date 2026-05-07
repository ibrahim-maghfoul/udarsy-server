import nodemailer from 'nodemailer';
import { config } from '../config';

interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
});

export const sendEmail = async (options: EmailOptions) => {
    try {
        const mailOptions = {
            from: config.email.from,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Email send error:', error);
        throw error;
    }
};

import { Router, Request, Response } from 'express';
import { sendEmail } from '../utils/email';
import { config } from '../config';

const router = Router();

// POST /api/contact
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            res.status(400).json({ error: 'Name, email, and message are required' });
            return;
        }

        // Send email to administrator
        await sendEmail({
            to: config.email.adminEmail,
            subject: `[Contact Form] ${subject || 'New Message'} from ${name}`,
            text: `
                Name: ${name}
                Email: ${email}
                Subject: ${subject}
                
                Message:
                ${message}
            `,
            html: `
                <h3>New Contact Form Submission</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <br>
                <p><strong>Message:</strong></p>
                <p style="white-space: pre-wrap;">${message}</p>
            `,
        });

        res.status(200).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router;

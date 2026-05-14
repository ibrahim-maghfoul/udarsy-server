import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from './index';

export const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
    },
});

/** Build the public CDN URL for a given R2 object key */
export function r2Url(key: string): string {
    return `https://${config.r2.publicDomain}/${key}`;
}

/** Extract the R2 object key from a full public URL */
export function r2Key(url: string): string {
    return url.replace(`https://${config.r2.publicDomain}/`, '');
}

/** Delete an object from R2. Accepts a full public URL or a raw key. Silently ignores errors. */
export async function deleteFromR2(urlOrKey: string): Promise<void> {
    if (!urlOrKey) return;
    const key = urlOrKey.startsWith('http') ? r2Key(urlOrKey) : urlOrKey;
    try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
    } catch {
        // Ignore — object may already be gone
    }
}

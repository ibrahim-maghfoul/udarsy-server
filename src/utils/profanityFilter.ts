/**
 * Moroccan Arabic / Darija bad-word filter
 * Returns true if the text contains a profane word.
 */

const BAD_WORDS: string[] = [
    // ─── Moroccan Darija offensive words ───
    'زاملة', 'زامل', 'زمل', 'كاوري', 'كافر', 'متناك', 'تناك', 'تنيك',
    'تنيكو', 'نيك', 'نيكو', 'نيكها', 'بوزك', 'بوز', 'طيزك', 'طيز',
    'قحبة', 'قحب', 'شرموطة', 'شرموط', 'عاهرة', 'عاهر', 'حمار', 'حمارة',
    'ولد الحرام', 'بنت الحرام', 'كس', 'كسك', 'كسها', 'كس امك',
    'كس اختك', 'لعق', 'مص', 'زب', 'زبك', 'زبو', 'زبه', 'خنزير',
    'خنزيرة', 'خنازير', 'كلب', 'كلبة', 'حيوان', 'بهيم', 'بهيمة',
    'مجنون', 'مجنونة', 'ولد الشيطان', 'بنت الشيطان',
    'لمك', 'دير امك', 'دير اختك', 'نيك امك', 'نيك اختك',
    // transliterations / latin variants
    'zb', 'kss', 'nik', 'niko', 'qahba', 'sharmouta', 'tnyak',
    'tnayak', 'bghel', 'hmaq', 'weld lhram', 'bent lhram',
    'la3q', 'lhmar', 'khanzir',
];

// Normalize Arabic text: strip diacritics and some variants
function normalizeAr(text: string): string {
    return text
        .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC]/g, '') // diacritics
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function containsBadWord(text: string): boolean {
    const normalized = normalizeAr(text);
    for (const word of BAD_WORDS) {
        const normWord = normalizeAr(word);
        if (normalized.includes(normWord)) return true;
    }
    return false;
}

export function cleanMessage(text: string): string {
    let result = text;
    const normalized = normalizeAr(text);
    for (const word of BAD_WORDS) {
        const normWord = normalizeAr(word);
        if (normalized.includes(normWord)) {
            // Replace with stars, preserving length
            const stars = '*'.repeat(word.length);
            const regex = new RegExp(word, 'gi');
            result = result.replace(regex, stars);
        }
    }
    return result;
}

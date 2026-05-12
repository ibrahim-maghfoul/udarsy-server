import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { MoroccanHoliday } from '../models/MoroccanHoliday';

type T3 = { ar: { title: string; desc?: string }; fr: { title: string; desc?: string }; en: { title: string; desc?: string } };
const t = (ar: string, fr: string, en: string, dar: string, dfr: string, den: string): T3 => ({
    ar: { title: ar, desc: dar },
    fr: { title: fr, desc: dfr },
    en: { title: en, desc: den },
});

// Shared event definitions — date is set per-year in HOLIDAYS below
const D = {
    newYear:      t(
        'رأس السنة الميلادية', 'Jour de l\'An', 'New Year\'s Day',
        'بداية السنة الميلادية الجديدة في أول يناير من كل عام',
        'Début de la nouvelle année grégorienne, célébrée le 1er janvier',
        'Start of the new Gregorian calendar year, celebrated on January 1st'
    ),
    manifesto:    t(
        'تقديم وثيقة الاستقلال', 'Manifeste de l\'indépendance', 'Independence Manifesto',
        'ذكرى تقديم وثيقة الاستقلال عام 1944 للمطالبة باستقلال المغرب عن الاستعمار الفرنسي',
        'Commémoration du manifeste de 1944 réclamant l\'indépendance du Maroc de la France',
        'Commemoration of the 1944 manifesto demanding Morocco\'s independence from France'
    ),
    yennayer:     t(
        'رأس السنة الأمازيغية (يناير)', 'Nouvel An amazigh (Yennayer)', 'Amazigh New Year',
        'رأس السنة الأمازيغية المعروف بـ"يناير"، أصبح عطلة رسمية بالمغرب منذ عام 2024',
        'Nouvel An amazigh (Yennayer), devenu jour férié officiel au Maroc depuis 2024',
        'Amazigh (Berber) New Year (Yennayer), official public holiday in Morocco since 2024'
    ),
    fitr:         t(
        'عيد الفطر المبارك', 'Aïd Al-Fitr', 'Eid al-Fitr',
        'عيد الفطر المبارك، يُحتفل بانتهاء شهر رمضان المبارك وبداية شوال',
        'Fête marquant la fin du mois sacré du ramadan et le début du mois de Chawwal',
        'Feast celebrating the end of the holy fasting month of Ramadan'
    ),
    labour:       t(
        'عيد العمال', 'Fête du Travail', 'Labour Day',
        'عيد العمال العالمي، يوم للاحتفاء بحقوق الطبقة العاملة ومكتسباتها',
        'Fête internationale du Travail, journée de reconnaissance des droits des travailleurs',
        'International Workers\' Day, celebrating the rights and achievements of the working class'
    ),
    adha:         t(
        'عيد الأضحى المبارك', 'Aïd Al-Adha', 'Eid al-Adha',
        'عيد الأضحى المبارك، إحياءً لذكرى تضحية سيدنا إبراهيم عليه السلام',
        'Fête du Sacrifice, commémorant le dévouement du prophète Ibrahim (paix sur lui)',
        'Feast of the Sacrifice, commemorating the devotion of Prophet Ibrahim (peace be upon him)'
    ),
    hijriNew:     t(
        'رأس السنة الهجرية', 'Nouvel An hégirien', 'Islamic New Year',
        'أول يوم من شهر محرم ومطلع السنة الهجرية الجديدة في التقويم الإسلامي',
        'Premier jour du mois de Mouharram et début du nouvel an du calendrier hégirien',
        'First day of Muharram marking the start of the new Islamic Hijri calendar year'
    ),
    throne:       t(
        'عيد العرش المجيد', 'Fête du Trône', 'Throne Day',
        'ذكرى جلوس جلالة الملك محمد السادس على عرش أسلافه الكرام في 30 يوليوز 1999',
        'Anniversaire de l\'accession de Sa Majesté le Roi Mohammed VI au Trône le 30 juillet 1999',
        'Anniversary of King Mohammed VI\'s accession to the throne on 30 July 1999'
    ),
    ouedEddahab:  t(
        'ذكرى استرداد إقليم وادي الذهب', 'Journée de Oued Eddahab', 'Oued Ed-Dahab Day',
        'ذكرى انضمام إقليم وادي الذهب إلى الوطن الأم المغربي في 14 غشت 1979',
        'Commémoration du retour de la province Oued Eddahab à la mère patrie marocaine le 14 août 1979',
        'Commemoration of the Oued Ed-Dahab province\'s return to Morocco on 14 August 1979'
    ),
    revolution:   t(
        'ذكرى ثورة الملك والشعب', 'Révolution du roi et du peuple', 'Revolution Day',
        'ذكرى ثورة الملك محمد الخامس والشعب المغربي في وجه المستعمر الفرنسي عام 1953',
        'Commémoration de la résistance du Roi Mohammed V et du peuple marocain face au colonisateur français en 1953',
        'Commemoration of King Mohammed V and the Moroccan people\'s resistance against French colonization in 1953'
    ),
    youth:        t(
        'عيد الشباب', 'Fête de la Jeunesse', 'Youth Day',
        'عيد ميلاد جلالة الملك محمد السادس، يُحتفل به باعتباره يوم الشباب المغربي',
        'Anniversaire de Sa Majesté le Roi Mohammed VI, célébré comme Fête nationale de la Jeunesse',
        'Birthday of King Mohammed VI, celebrated as Morocco\'s National Youth Day'
    ),
    mawlid:       t(
        'المولد النبوي الشريف', 'Aïd Al-Mawlid', 'Prophet\'s Birthday',
        'الاحتفاء بذكرى ميلاد سيدنا محمد صلى الله عليه وسلم في الثاني عشر من ربيع الأول',
        'Célébration de la naissance du Prophète Mohammed (paix et salut sur lui) le 12 Rabi Al-Awal',
        'Celebration of the birth of the Prophet Mohammed (PBUH) on the 12th of Rabi al-Awwal'
    ),
    greenMarch:   t(
        'ذكرى المسيرة الخضراء', 'Marche verte', 'Green March Day',
        'ذكرى انطلاق المسيرة الخضراء السلمية في 6 نونبر 1975 لاسترداد الأقاليم الجنوبية للمغرب',
        'Anniversaire de la Marche verte pacifique du 6 novembre 1975 pour la récupération des provinces du sud du Maroc',
        'Anniversary of the peaceful Green March of 6 November 1975 for the recovery of Morocco\'s southern provinces'
    ),
    independence: t(
        'عيد الاستقلال', 'Fête de l\'Indépendance', 'Independence Day',
        'ذكرى حصول المغرب على استقلاله عن الحماية الفرنسية في 18 نونبر 1956',
        'Commémoration de l\'indépendance du Maroc de la France le 18 novembre 1956',
        'Commemoration of Morocco\'s independence from France on 18 November 1956'
    ),
};

const HOLIDAYS: Array<{ id: string; date: string; category: string; color: string } & T3> = [
    // ── 2025 ─────────────────────────────────────────────────────────────────
    { id:'ma25-01', date:'2025-01-01', category:'personal', color:'green',  ...D.newYear      },
    { id:'ma25-02', date:'2025-01-11', category:'personal', color:'red',    ...D.manifesto    },
    { id:'ma25-03', date:'2025-01-14', category:'personal', color:'green',  ...D.yennayer     },
    { id:'ma25-04', date:'2025-03-31', category:'personal', color:'blue',   ...D.fitr         },
    { id:'ma25-05', date:'2025-05-01', category:'personal', color:'dark',   ...D.labour       },
    { id:'ma25-06', date:'2025-06-07', category:'personal', color:'blue',   ...D.adha         },
    { id:'ma25-07', date:'2025-06-27', category:'personal', color:'blue',   ...D.hijriNew     },
    { id:'ma25-08', date:'2025-07-30', category:'personal', color:'red',    ...D.throne       },
    { id:'ma25-09', date:'2025-08-14', category:'personal', color:'red',    ...D.ouedEddahab  },
    { id:'ma25-10', date:'2025-08-20', category:'personal', color:'red',    ...D.revolution   },
    { id:'ma25-11', date:'2025-08-21', category:'personal', color:'red',    ...D.youth        },
    { id:'ma25-12', date:'2025-09-05', category:'personal', color:'blue',   ...D.mawlid       },
    { id:'ma25-13', date:'2025-11-06', category:'personal', color:'red',    ...D.greenMarch   },
    { id:'ma25-14', date:'2025-11-18', category:'personal', color:'red',    ...D.independence },

    // ── 2026 ─────────────────────────────────────────────────────────────────
    { id:'ma26-01', date:'2026-01-01', category:'personal', color:'green',  ...D.newYear      },
    { id:'ma26-02', date:'2026-01-11', category:'personal', color:'red',    ...D.manifesto    },
    { id:'ma26-03', date:'2026-01-14', category:'personal', color:'green',  ...D.yennayer     },
    { id:'ma26-04', date:'2026-03-20', category:'personal', color:'blue',   ...D.fitr         },
    { id:'ma26-05', date:'2026-05-01', category:'personal', color:'dark',   ...D.labour       },
    { id:'ma26-06', date:'2026-05-27', category:'personal', color:'blue',   ...D.adha         },
    { id:'ma26-07', date:'2026-06-17', category:'personal', color:'blue',   ...D.hijriNew     },
    { id:'ma26-08', date:'2026-07-30', category:'personal', color:'red',    ...D.throne       },
    { id:'ma26-09', date:'2026-08-14', category:'personal', color:'red',    ...D.ouedEddahab  },
    { id:'ma26-10', date:'2026-08-20', category:'personal', color:'red',    ...D.revolution   },
    { id:'ma26-11', date:'2026-08-21', category:'personal', color:'red',    ...D.youth        },
    { id:'ma26-12', date:'2026-08-26', category:'personal', color:'blue',   ...D.mawlid       },
    { id:'ma26-13', date:'2026-11-06', category:'personal', color:'red',    ...D.greenMarch   },
    { id:'ma26-14', date:'2026-11-18', category:'personal', color:'red',    ...D.independence },

    // ── 2027 ─────────────────────────────────────────────────────────────────
    { id:'ma27-01', date:'2027-01-01', category:'personal', color:'green',  ...D.newYear      },
    { id:'ma27-02', date:'2027-01-11', category:'personal', color:'red',    ...D.manifesto    },
    { id:'ma27-03', date:'2027-01-14', category:'personal', color:'green',  ...D.yennayer     },
    { id:'ma27-04', date:'2027-03-09', category:'personal', color:'blue',   ...D.fitr         },
    { id:'ma27-05', date:'2027-05-01', category:'personal', color:'dark',   ...D.labour       },
    { id:'ma27-06', date:'2027-05-16', category:'personal', color:'blue',   ...D.adha         },
    { id:'ma27-07', date:'2027-06-06', category:'personal', color:'blue',   ...D.hijriNew     },
    { id:'ma27-08', date:'2027-07-30', category:'personal', color:'red',    ...D.throne       },
    { id:'ma27-09', date:'2027-08-14', category:'personal', color:'red',    ...D.ouedEddahab  },
    { id:'ma27-10', date:'2027-08-15', category:'personal', color:'blue',   ...D.mawlid       },
    { id:'ma27-11', date:'2027-08-20', category:'personal', color:'red',    ...D.revolution   },
    { id:'ma27-12', date:'2027-08-21', category:'personal', color:'red',    ...D.youth        },
    { id:'ma27-13', date:'2027-11-06', category:'personal', color:'red',    ...D.greenMarch   },
    { id:'ma27-14', date:'2027-11-18', category:'personal', color:'red',    ...D.independence },
];

function isAdmin(user: any): boolean {
    return user && user.role === 'admin';
}

export class MoroccanHolidaysController {

    // GET /api/moroccan-holidays?locale=ar  — returns localized flat objects for the frontend
    // GET /api/moroccan-holidays?raw=true   — returns full docs with translations{} for the admin
    static async list(req: Request, res: Response): Promise<void> {
        try {
            const count = await MoroccanHoliday.countDocuments();
            if (count === 0) await MoroccanHolidaysController.seed();

            const holidays = await MoroccanHoliday.find({}).sort({ date: 1 }).lean();

            if (req.query.raw === 'true') {
                res.json(holidays);
                return;
            }

            const locale = (req.query.locale as string) || 'ar';
            const localized = holidays.map((h: any) => {
                const tr = h.translations?.[locale] || h.translations?.ar || h.translations?.fr || {};
                return {
                    id:       h.id,
                    date:     h.date,
                    endDate:  h.endDate,
                    category: h.category,
                    color:    h.color,
                    isGlobal: true,
                    title:    tr.title || h.title,
                    desc:     tr.desc  || h.desc,
                };
            });
            res.json(localized);
        } catch (err) {
            console.error('moroccanHolidays list error:', err);
            res.status(500).json({ error: 'Failed to fetch holidays' });
        }
    }

    // POST /api/moroccan-holidays/seed — admin, upserts all built-in holidays
    static async seedEndpoint(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!isAdmin(user)) { res.status(403).json({ error: 'Admin only' }); return; }
            await MoroccanHolidaysController.seed();
            res.json({ message: `Seeded ${HOLIDAYS.length} Moroccan holidays (2025–2027).` });
        } catch (err) {
            console.error('moroccanHolidays seed error:', err);
            res.status(500).json({ error: 'Failed to seed holidays' });
        }
    }

    // POST /api/moroccan-holidays — admin
    static async create(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!isAdmin(user)) { res.status(403).json({ error: 'Admin only' }); return; }

            const body = req.body;
            if (!body.id || !body.date || !body.category || !body.color) {
                res.status(400).json({ error: 'id, date, category, color are required' });
                return;
            }
            if (!body.translations?.en?.title && !body.title) {
                res.status(400).json({ error: 'At least one title is required' });
                return;
            }
            const fallbackTitle = body.title || body.translations?.en?.title || body.translations?.fr?.title || body.translations?.ar?.title;
            const fallbackDesc  = body.desc  || body.translations?.en?.desc  || body.translations?.fr?.desc  || body.translations?.ar?.desc;
            const holiday = await MoroccanHoliday.create({ ...body, title: fallbackTitle, desc: fallbackDesc, isGlobal: true });
            res.status(201).json(holiday);
        } catch (err: any) {
            if (err.code === 11000) { res.status(409).json({ error: 'A holiday with that id already exists' }); return; }
            console.error('moroccanHolidays create error:', err);
            res.status(500).json({ error: 'Failed to create holiday' });
        }
    }

    // PUT /api/moroccan-holidays/:id — admin
    static async update(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!isAdmin(user)) { res.status(403).json({ error: 'Admin only' }); return; }

            const { id } = req.params;
            const body = req.body;
            const fallbackTitle = body.title || body.translations?.en?.title || body.translations?.fr?.title || body.translations?.ar?.title;
            const fallbackDesc  = body.desc  || body.translations?.en?.desc  || body.translations?.fr?.desc  || body.translations?.ar?.desc;
            const updated = await MoroccanHoliday.findOneAndUpdate(
                { id },
                { ...body, title: fallbackTitle, desc: fallbackDesc },
                { new: true }
            );
            if (!updated) { res.status(404).json({ error: 'Holiday not found' }); return; }
            res.json(updated);
        } catch (err) {
            console.error('moroccanHolidays update error:', err);
            res.status(500).json({ error: 'Failed to update holiday' });
        }
    }

    // DELETE /api/moroccan-holidays/:id — admin
    static async remove(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!isAdmin(user)) { res.status(403).json({ error: 'Admin only' }); return; }

            const { id } = req.params;
            const deleted = await MoroccanHoliday.findOneAndDelete({ id });
            if (!deleted) { res.status(404).json({ error: 'Holiday not found' }); return; }
            res.json({ message: 'Holiday deleted' });
        } catch (err) {
            console.error('moroccanHolidays delete error:', err);
            res.status(500).json({ error: 'Failed to delete holiday' });
        }
    }

    // Internal: upsert all built-in holidays
    static async seed(): Promise<void> {
        const docs = HOLIDAYS.map(h => ({
            id:       h.id,
            date:     h.date,
            category: h.category,
            color:    h.color,
            title:    h.en.title,
            desc:     h.en.desc,
            translations: {
                ar: h.ar,
                fr: h.fr,
                en: h.en,
            },
            isGlobal: true as const,
        }));
        for (const doc of docs) {
            await MoroccanHoliday.findOneAndUpdate({ id: doc.id }, { $set: doc }, { upsert: true, new: true });
        }
    }
}

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User, CalEvent, CalTodo } from '../models/User';
import { GlobalEvent } from '../models/GlobalEvent';

// ── Helper: get or initialize user calendar ──────────────────────────────────
async function getUserCalendar(userId: string) {
    const user = await User.findById(userId).select('calendar');
    if (!user) return null;
    if (!user.calendar) {
        user.calendar = { events: [], todos: [] };
    }
    return user;
}

// ── Translation helpers ───────────────────────────────────────────────────────
type T3 = { ar: { title: string; desc?: string }; fr: { title: string; desc?: string }; en: { title: string; desc?: string } };
const t = (ar: string, fr: string, en: string, dar?: string, dfr?: string, den?: string): T3 => ({
    ar: { title: ar, ...(dar ? { desc: dar } : {}) },
    fr: { title: fr, ...(dfr ? { desc: dfr } : {}) },
    en: { title: en, ...(den ? { desc: den } : {}) },
});

export class CalendarController {

    // GET /api/calendar  — return user's events + todos
    static async getCalendar(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await getUserCalendar(req.userId!);
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            res.json({ events: user.calendar?.events || [], todos: user.calendar?.todos || [] });
        } catch (err) {
            console.error('getCalendar error:', err);
            res.status(500).json({ error: 'Failed to fetch calendar' });
        }
    }

    // PUT /api/calendar  — bulk sync (replace) events + todos
    static async syncCalendar(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { events, todos } = req.body as { events: CalEvent[]; todos: CalTodo[] };
            const user = await User.findByIdAndUpdate(
                req.userId,
                { $set: { 'calendar.events': events || [], 'calendar.todos': todos || [] } },
                { new: true }
            ).select('calendar');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            res.json({ events: user.calendar?.events || [], todos: user.calendar?.todos || [] });
        } catch (err) {
            console.error('syncCalendar error:', err);
            res.status(500).json({ error: 'Failed to sync calendar' });
        }
    }

    // POST /api/calendar/events  — add one event
    static async addEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            const event: CalEvent = req.body;
            if (!event.id || !event.title || !event.date) {
                res.status(400).json({ error: 'id, title, and date are required' });
                return;
            }
            const user = await User.findByIdAndUpdate(
                req.userId,
                { $push: { 'calendar.events': event } },
                { new: true }
            ).select('calendar');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            res.status(201).json(event);
        } catch (err) {
            console.error('addEvent error:', err);
            res.status(500).json({ error: 'Failed to add event' });
        }
    }

    // PUT /api/calendar/events/:id  — update one event
    static async updateEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const updated: CalEvent = { ...req.body, id, updatedAt: new Date().toISOString() };
            const user = await User.findOneAndUpdate(
                { _id: req.userId, 'calendar.events.id': id },
                { $set: { 'calendar.events.$': updated } },
                { new: true }
            ).select('calendar');
            if (!user) { res.status(404).json({ error: 'Event not found' }); return; }
            res.json(updated);
        } catch (err) {
            console.error('updateEvent error:', err);
            res.status(500).json({ error: 'Failed to update event' });
        }
    }

    // DELETE /api/calendar/events/:id  — delete one event
    static async deleteEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            await User.findByIdAndUpdate(
                req.userId,
                { $pull: { 'calendar.events': { id } } }
            );
            res.json({ message: 'Event deleted' });
        } catch (err) {
            console.error('deleteEvent error:', err);
            res.status(500).json({ error: 'Failed to delete event' });
        }
    }

    // POST /api/calendar/todos  — add one todo
    static async addTodo(req: AuthRequest, res: Response): Promise<void> {
        try {
            const todo: CalTodo = req.body;
            if (!todo.id || !todo.label) {
                res.status(400).json({ error: 'id and label are required' });
                return;
            }
            await User.findByIdAndUpdate(
                req.userId,
                { $push: { 'calendar.todos': todo } }
            );
            res.status(201).json(todo);
        } catch (err) {
            console.error('addTodo error:', err);
            res.status(500).json({ error: 'Failed to add todo' });
        }
    }

    // PUT /api/calendar/todos/:id  — toggle done state
    static async toggleTodo(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const user = await User.findById(req.userId).select('calendar.todos');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            const todo = (user.calendar?.todos || []).find((t: CalTodo) => t.id === id);
            if (!todo) { res.status(404).json({ error: 'Todo not found' }); return; }
            const now = new Date().toISOString();
            const newDone = !todo.done;
            await User.findOneAndUpdate(
                { _id: req.userId, 'calendar.todos.id': id },
                {
                    $set: {
                        'calendar.todos.$.done': newDone,
                        'calendar.todos.$.completedAt': newDone ? now : null,
                        'calendar.todos.$.updatedAt': now,
                    }
                }
            );
            res.json({ id, done: newDone });
        } catch (err) {
            console.error('toggleTodo error:', err);
            res.status(500).json({ error: 'Failed to toggle todo' });
        }
    }

    // DELETE /api/calendar/todos/:id  — delete one todo
    static async deleteTodo(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            await User.findByIdAndUpdate(
                req.userId,
                { $pull: { 'calendar.todos': { id } } }
            );
            res.json({ message: 'Todo deleted' });
        } catch (err) {
            console.error('deleteTodo error:', err);
            res.status(500).json({ error: 'Failed to delete todo' });
        }
    }

    // GET /api/calendar/global?locale=ar  — get all global events (public)
    static async getGlobalEvents(req: Request, res: Response): Promise<void> {
        try {
            const locale = (req.query.locale as string) || 'ar';
            const count = await GlobalEvent.countDocuments();
            if (count === 0) {
                await CalendarController.seedGlobalEvents();
            }
            const events = await GlobalEvent.find({}).lean();
            const localized = events.map((e: any) => {
                const tr = e.translations?.[locale] || e.translations?.ar || e.translations?.fr || {};
                return {
                    id:       e.id,
                    date:     e.date,
                    endDate:  e.endDate,
                    category: e.category,
                    color:    e.color,
                    isGlobal: true,
                    title:    tr.title || e.title,
                    desc:     tr.desc  || e.desc,
                };
            });
            res.json(localized);
        } catch (err) {
            console.error('getGlobalEvents error:', err);
            res.status(500).json({ error: 'Failed to fetch global events' });
        }
    }

    // POST /api/calendar/global  — create a global event (admin)
    static async createGlobalEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
            const body = req.body;
            if (!body.id || !body.date || !body.category || !body.color) {
                res.status(400).json({ error: 'id, date, category, color are required' });
                return;
            }
            if (!body.translations?.ar?.title && !body.title) {
                res.status(400).json({ error: 'At least one title is required' });
                return;
            }
            // Derive top-level title from English translation, fallback to French then Arabic
            const fallbackTitle = body.title || body.translations?.en?.title || body.translations?.fr?.title || body.translations?.ar?.title;
            const fallbackDesc  = body.desc  || body.translations?.en?.desc  || body.translations?.fr?.desc  || body.translations?.ar?.desc;
            const event = await GlobalEvent.create({
                ...body,
                title: fallbackTitle,
                desc:  fallbackDesc,
                isGlobal: true,
            });
            res.status(201).json(event);
        } catch (err) {
            console.error('createGlobalEvent error:', err);
            res.status(500).json({ error: 'Failed to create global event' });
        }
    }

    // PUT /api/calendar/global/:id  — update a global event (admin)
    static async updateGlobalEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
            const { id } = req.params;
            const body = req.body;
            const fallbackTitle = body.title || body.translations?.en?.title || body.translations?.fr?.title || body.translations?.ar?.title;
            const fallbackDesc  = body.desc  || body.translations?.en?.desc  || body.translations?.fr?.desc  || body.translations?.ar?.desc;
            const updated = await GlobalEvent.findOneAndUpdate(
                { id },
                { ...body, title: fallbackTitle, desc: fallbackDesc },
                { new: true }
            );
            if (!updated) { res.status(404).json({ error: 'Event not found' }); return; }
            res.json(updated);
        } catch (err) {
            console.error('updateGlobalEvent error:', err);
            res.status(500).json({ error: 'Failed to update global event' });
        }
    }

    // DELETE /api/calendar/global/:id  — delete a global event (admin)
    static async deleteGlobalEvent(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
            const { id } = req.params;
            const deleted = await GlobalEvent.findOneAndDelete({ id });
            if (!deleted) { res.status(404).json({ error: 'Event not found' }); return; }
            res.json({ message: 'Event deleted' });
        } catch (err) {
            console.error('deleteGlobalEvent error:', err);
            res.status(500).json({ error: 'Failed to delete global event' });
        }
    }

    // POST /api/calendar/global/seed-holidays
    static async seedHolidays(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'admin') {
                res.status(403).json({ error: 'Admin only' });
                return;
            }

            const moroccoHolidays = [
                // ── 2025 ──────────────────────────────────────────────────────────────
                { id:'ma25-01', date:'2025-01-01', category:'personal', color:'green',
                  ...t('رأس السنة الميلادية','Jour de l\'An','New Year\'s Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-02', date:'2025-01-11', category:'personal', color:'red',
                  ...t('تقديم وثيقة الاستقلال','Manifeste de l\'indépendance','Independence Manifesto','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-03', date:'2025-01-14', category:'personal', color:'green',
                  ...t('رأس السنة الأمازيغية (يناير)','Nouvel An amazigh (Yennayer)','Amazigh New Year','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-04', date:'2025-03-31', category:'personal', color:'blue',
                  ...t('عيد الفطر المبارك','Aïd Al-Fitr','Eid al-Fitr','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-05', date:'2025-05-01', category:'personal', color:'dark',
                  ...t('عيد العمال','Fête du Travail','Labour Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-06', date:'2025-06-07', category:'personal', color:'blue',
                  ...t('عيد الأضحى المبارك','Aïd Al-Adha','Eid al-Adha','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-07', date:'2025-06-27', category:'personal', color:'blue',
                  ...t('رأس السنة الهجرية','Nouvel An hégirien','Islamic New Year','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-08', date:'2025-07-30', category:'personal', color:'red',
                  ...t('عيد العرش المجيد','Fête du Trône','Throne Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-09', date:'2025-08-14', category:'personal', color:'red',
                  ...t('ذكرى استرداد إقليم وادي الذهب','Journée de Oued Eddahab','Oued Ed-Dahab Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-10', date:'2025-08-20', category:'personal', color:'red',
                  ...t('ذكرى ثورة الملك والشعب','Révolution du roi et du peuple','Revolution Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-11', date:'2025-08-21', category:'personal', color:'red',
                  ...t('عيد الشباب','Fête de la Jeunesse','Youth Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-12', date:'2025-09-05', category:'personal', color:'blue',
                  ...t('المولد النبوي الشريف','Aïd Al-Mawlid','Prophet\'s Birthday','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-13', date:'2025-11-06', category:'personal', color:'red',
                  ...t('ذكرى المسيرة الخضراء','Anniversaire de la Marche verte','Green March Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma25-14', date:'2025-11-18', category:'personal', color:'red',
                  ...t('عيد الاستقلال','Fête de l\'Indépendance','Independence Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },

                // ── 2026 ──────────────────────────────────────────────────────────────
                { id:'ma26-01', date:'2026-01-01', category:'personal', color:'green',
                  ...t('رأس السنة الميلادية','Jour de l\'An','New Year\'s Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-02', date:'2026-01-11', category:'personal', color:'red',
                  ...t('تقديم وثيقة الاستقلال','Manifeste de l\'indépendance','Independence Manifesto','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-03', date:'2026-01-14', category:'personal', color:'green',
                  ...t('رأس السنة الأمازيغية (يناير)','Nouvel An amazigh (Yennayer)','Amazigh New Year','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-04', date:'2026-03-20', category:'personal', color:'blue',
                  ...t('عيد الفطر المبارك','Aïd Al-Fitr','Eid al-Fitr','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-05', date:'2026-05-01', category:'personal', color:'dark',
                  ...t('عيد العمال','Fête du Travail','Labour Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-06', date:'2026-05-27', category:'personal', color:'blue',
                  ...t('عيد الأضحى المبارك','Aïd Al-Adha','Eid al-Adha','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-07', date:'2026-06-17', category:'personal', color:'blue',
                  ...t('رأس السنة الهجرية','Nouvel An hégirien','Islamic New Year','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-08', date:'2026-07-30', category:'personal', color:'red',
                  ...t('عيد العرش المجيد','Fête du Trône','Throne Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-09', date:'2026-08-14', category:'personal', color:'red',
                  ...t('ذكرى استرداد إقليم وادي الذهب','Journée de Oued Eddahab','Oued Ed-Dahab Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-10', date:'2026-08-20', category:'personal', color:'red',
                  ...t('ذكرى ثورة الملك والشعب','Révolution du roi et du peuple','Revolution Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-11', date:'2026-08-21', category:'personal', color:'red',
                  ...t('عيد الشباب','Fête de la Jeunesse','Youth Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-12', date:'2026-08-26', category:'personal', color:'blue',
                  ...t('المولد النبوي الشريف','Aïd Al-Mawlid','Prophet\'s Birthday','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-13', date:'2026-11-06', category:'personal', color:'red',
                  ...t('ذكرى المسيرة الخضراء','Anniversaire de la Marche verte','Green March Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
                { id:'ma26-14', date:'2026-11-18', category:'personal', color:'red',
                  ...t('عيد الاستقلال','Fête de l\'Indépendance','Independence Day','عطلة رسمية مغربية','Jour férié marocain','Moroccan Public holiday') },
            ].map(ev => ({
                id:       ev.id,
                date:     ev.date,
                category: ev.category,
                color:    ev.color,
                title:    ev.en.title,
                desc:     ev.en.desc,
                translations: {
                    ar: ev.ar,
                    fr: ev.fr,
                    en: ev.en,
                },
                isGlobal: true,
            }));

            for (const holiday of moroccoHolidays) {
                await GlobalEvent.findOneAndUpdate({ id: holiday.id }, holiday, { upsert: true });
            }
            res.json({ message: 'Moroccan holidays seeded successfully.' });
        } catch (err) {
            console.error('seedHolidays error:', err);
            res.status(500).json({ error: 'Failed to seed holidays' });
        }
    }

    // Internal: seed the GlobalEvent collection from the hardcoded list
    private static async seedGlobalEvents(): Promise<void> {
        const y = new Date().getFullYear();
        const mk = (m: number, d: number): string =>
            `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

        const globals = [
            { id:'g01', date:mk(1,1),  category:'personal', color:'dark',
              ...t('رأس السنة الميلادية','Jour de l\'An','New Year\'s Day','عطلة رسمية عالمية','Jour férié mondial','Public holiday worldwide') },
            { id:'g02', date:mk(1,24), category:'class',    color:'blue',
              ...t('اليوم الدولي للتعليم','Journée internationale de l\'éducation','Intl. Education Day','مناسبة اليونسكو','Observance de l\'UNESCO','UNESCO observance') },
            { id:'g03', date:mk(1,27), category:'personal', color:'dark',
              ...t('يوم إحياء ذكرى ضحايا الهولوكوست','Journée de la mémoire de l\'Holocauste','Holocaust Remembrance Day','يوم تذكاري أممي','Journée commémorative des Nations Unies','UN memorial day') },
            { id:'g04', date:mk(2,6),  category:'learning', color:'blue',
              ...t('اليوم الأكثر أمانًا للإنترنت','Journée pour un Internet plus sûr','Safer Internet Day','مبادرة أوروبية وعالمية','Initiative européenne et mondiale','EU/Global initiative') },
            { id:'g05', date:mk(2,21), category:'class',    color:'blue',
              ...t('اليوم الدولي للغة الأم','Journée internationale de la langue maternelle','Intl. Mother Language Day','مناسبة اليونسكو','Observance de l\'UNESCO','UNESCO observance') },
            { id:'g06', date:mk(3,8),  category:'personal', color:'pink',
              ...t('اليوم الدولي للمرأة','Journée internationale de la femme','Intl. Women\'s Day','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g07', date:mk(3,14), category:'class',    color:'blue',
              ...t('اليوم الدولي للرياضيات','Journée internationale des mathématiques','Intl. Day of Mathematics','اليونسكو – يوم باي','UNESCO – Jour du Pi','UNESCO – Pi Day') },
            { id:'g08', date:mk(3,20), category:'personal', color:'orange',
              ...t('اليوم الدولي للسعادة','Journée internationale du bonheur','Intl. Day of Happiness','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g09', date:mk(3,21), category:'learning', color:'purple',
              ...t('اليوم العالمي للشعر','Journée mondiale de la poésie','World Poetry Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g10', date:mk(3,22), category:'personal', color:'teal',
              ...t('اليوم العالمي للمياه','Journée mondiale de l\'eau','World Water Day','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g11', date:mk(4,7),  category:'personal', color:'green',
              ...t('اليوم العالمي للصحة','Journée mondiale de la santé','World Health Day','مناسبة منظمة الصحة العالمية','Observance de l\'OMS','WHO observance') },
            { id:'g12', date:mk(4,22), category:'learning', color:'green',
              ...t('يوم الأرض العالمي','Journée mondiale de la Terre','World Earth Day','مناسبة عالمية','Observance mondiale','Global observance') },
            { id:'g13', date:mk(4,23), category:'class',    color:'dark',
              ...t('اليوم العالمي للكتاب وحقوق المؤلف','Journée mondiale du livre et du droit d\'auteur','World Book & Copyright Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g14', date:mk(5,3),  category:'learning', color:'blue',
              ...t('اليوم العالمي لحرية الصحافة','Journée mondiale de la liberté de la presse','World Press Freedom Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g15', date:mk(5,12), category:'personal', color:'green',
              ...t('اليوم الدولي للتمريض','Journée internationale des infirmiers','Intl. Nurses Day','مناسبة المجلس الدولي للتمريض','Observance du CII','ICN observance') },
            { id:'g16', date:mk(6,5),  category:'learning', color:'green',
              ...t('اليوم العالمي للبيئة','Journée mondiale de l\'environnement','World Environment Day','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g17', date:mk(7,15), category:'class',    color:'blue',
              ...t('اليوم العالمي لمهارات الشباب','Journée mondiale des compétences des jeunes','World Youth Skills Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g18', date:mk(8,1),  category:'learning', color:'purple',
              ...t('يوم الشبكة العنكبوتية العالمية','Journée du World Wide Web','World Wide Web Day','تيم بيرنرز-لي','Tim Berners-Lee','Tim Berners-Lee') },
            { id:'g19', date:mk(8,12), category:'class',    color:'orange',
              ...t('اليوم الدولي للشباب','Journée internationale de la jeunesse','Intl. Youth Day','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g20', date:mk(9,8),  category:'class',    color:'blue',
              ...t('اليوم الدولي لمحو الأمية','Journée internationale de l\'alphabétisation','Intl. Literacy Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g21', date:mk(9,21), category:'personal', color:'teal',
              ...t('اليوم الدولي للسلام','Journée internationale de la paix','Intl. Peace Day','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g22', date:mk(10,5), category:'class',    color:'orange',
              ...t('اليوم العالمي للمعلم','Journée mondiale des enseignants','World Teachers\' Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g23', date:mk(10,10),category:'personal', color:'purple',
              ...t('اليوم العالمي للصحة النفسية','Journée mondiale de la santé mentale','World Mental Health Day','منظمة الصحة العالمية','OMS','WHO') },
            { id:'g24', date:mk(10,24),category:'personal', color:'blue',
              ...t('يوم الأمم المتحدة','Journée des Nations Unies','United Nations Day','ذكرى تأسيس الأمم المتحدة 1945','Anniversaire de l\'ONU 1945','UN anniversary 1945') },
            { id:'g25', date:mk(11,10),category:'learning', color:'blue',
              ...t('اليوم العالمي للعلوم','Journée mondiale de la science','World Science Day','اليونسكو','UNESCO','UNESCO') },
            { id:'g26', date:mk(11,17),category:'class',    color:'dark',
              ...t('اليوم الدولي للطلاب','Journée internationale des étudiants','Intl. Students Day','مناسبة عالمية','Observance mondiale','Global observance') },
            { id:'g27', date:mk(11,20),category:'personal', color:'orange',
              ...t('اليوم العالمي للطفل','Journée mondiale de l\'enfance','World Children\'s Day','اليونيسف / الأمم المتحدة','UNICEF / ONU','UNICEF / UN') },
            { id:'g28', date:mk(12,1), category:'personal', color:'red',
              ...t('اليوم العالمي للإيدز','Journée mondiale contre le SIDA','World AIDS Day','اليونيدز / منظمة الصحة العالمية','ONUSIDA / OMS','UNAIDS / WHO') },
            { id:'g29', date:mk(12,10),category:'personal', color:'blue',
              ...t('يوم حقوق الإنسان','Journée des droits de l\'homme','Human Rights Day','مناسبة الأمم المتحدة','Observance des Nations Unies','UN observance') },
            { id:'g30', date:mk(12,25),category:'personal', color:'green',
              ...t('عيد الميلاد المجيد','Jour de Noël','Christmas Day','عطلة رسمية','Jour férié','Public holiday') },
            { id:'g31', date:mk(12,31),category:'personal', color:'dark',
              ...t('ليلة رأس السنة الميلادية','Réveillon du Nouvel An','New Year\'s Eve','احتفال عالمي','Célébration mondiale','Global celebration') },
        ].map(ev => ({
            id:       ev.id,
            date:     ev.date,
            category: ev.category,
            color:    ev.color,
            title:    ev.en.title,
            desc:     ev.en.desc,
            translations: {
                ar: ev.ar,
                fr: ev.fr,
                en: ev.en,
            },
            isGlobal: true as const,
        }));

        await GlobalEvent.insertMany(globals, { ordered: false }).catch(() => {/* ignore dupe key */});
    }
}

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
            // Pull the user to get current state of the todo
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

    // GET /api/calendar/global  — get all global events (public)
    static async getGlobalEvents(_req: Request, res: Response): Promise<void> {
        try {
            // Auto-seed on first call if collection is empty
            const count = await GlobalEvent.countDocuments();
            if (count === 0) {
                await CalendarController.seedGlobalEvents();
            }
            const events = await GlobalEvent.find({}).lean();
            res.json(events);
        } catch (err) {
            console.error('getGlobalEvents error:', err);
            res.status(500).json({ error: 'Failed to fetch global events' });
        }
    }

    // Internal: seed the GlobalEvent collection from the hardcoded list
    private static async seedGlobalEvents(): Promise<void> {
        const y = new Date().getFullYear();
        const mk = (m: number, d: number): string =>
            `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

        const globals = [
            { id:'g01', title:"New Year's Day",            date:mk(1,1),  category:'personal', color:'dark', desc:'Public holiday worldwide' },
            { id:'g02', title:"Intl. Education Day",        date:mk(1,24), category:'class',    color:'blue', desc:'UNESCO observance' },
            { id:'g03', title:"Holocaust Remembrance Day",  date:mk(1,27), category:'personal', color:'dark', desc:'UN memorial day' },
            { id:'g04', title:"Safer Internet Day",         date:mk(2,6),  category:'learning', color:'blue', desc:'EU/Global initiative' },
            { id:'g05', title:"Intl. Mother Language Day",  date:mk(2,21), category:'class',    color:'blue', desc:'UNESCO observance' },
            { id:'g06', title:"Intl. Women's Day",          date:mk(3,8),  category:'personal', color:'pink', desc:'UN observance' },
            { id:'g07', title:"Intl. Day of Mathematics",   date:mk(3,14), category:'class',    color:'blue', desc:'UNESCO – Pi Day' },
            { id:'g08', title:"Intl. Day of Happiness",     date:mk(3,20), category:'personal', color:'orange', desc:'UN observance' },
            { id:'g09', title:"World Poetry Day",           date:mk(3,21), category:'learning', color:'purple', desc:'UNESCO' },
            { id:'g10', title:"World Water Day",            date:mk(3,22), category:'personal', color:'teal', desc:'UN observance' },
            { id:'g11', title:"World Health Day",           date:mk(4,7),  category:'personal', color:'green', desc:'WHO observance' },
            { id:'g12', title:"World Earth Day",            date:mk(4,22), category:'learning', color:'green', desc:'Global observance' },
            { id:'g13', title:"World Book & Copyright Day", date:mk(4,23), category:'class',    color:'dark', desc:'UNESCO' },
            { id:'g14', title:"World Press Freedom Day",    date:mk(5,3),  category:'learning', color:'blue', desc:'UNESCO' },
            { id:'g15', title:"Intl. Nurses Day",           date:mk(5,12), category:'personal', color:'green', desc:'ICN observance' },
            { id:'g16', title:"World Environment Day",      date:mk(6,5),  category:'learning', color:'green', desc:'UN observance' },
            { id:'g17', title:"World Youth Skills Day",     date:mk(7,15), category:'class',    color:'blue', desc:'UNESCO' },
            { id:'g18', title:"World Wide Web Day",         date:mk(8,1),  category:'learning', color:'purple', desc:'Tim Berners-Lee' },
            { id:'g19', title:"Intl. Youth Day",            date:mk(8,12), category:'class',    color:'orange', desc:'UN observance' },
            { id:'g20', title:"Intl. Literacy Day",         date:mk(9,8),  category:'class',    color:'blue', desc:'UNESCO' },
            { id:'g21', title:"Intl. Peace Day",            date:mk(9,21), category:'personal', color:'teal', desc:'UN observance' },
            { id:'g22', title:"World Teachers' Day",        date:mk(10,5), category:'class',    color:'orange', desc:'UNESCO' },
            { id:'g23', title:"World Mental Health Day",    date:mk(10,10),category:'personal', color:'purple', desc:'WHO' },
            { id:'g24', title:"United Nations Day",         date:mk(10,24),category:'personal', color:'blue', desc:'UN anniversary 1945' },
            { id:'g25', title:"World Science Day",          date:mk(11,10),category:'learning', color:'blue', desc:'UNESCO' },
            { id:'g26', title:"Intl. Students Day",         date:mk(11,17),category:'class',    color:'dark', desc:'Global observance' },
            { id:'g27', title:"World Children's Day",       date:mk(11,20),category:'personal', color:'orange', desc:'UNICEF / UN' },
            { id:'g28', title:"World AIDS Day",             date:mk(12,1), category:'personal', color:'red', desc:'UNAIDS / WHO' },
            { id:'g29', title:"Human Rights Day",           date:mk(12,10),category:'personal', color:'blue', desc:'UN observance' },
            { id:'g30', title:"Christmas Day",              date:mk(12,25),category:'personal', color:'green', desc:'Public holiday' },
            { id:'g31', title:"New Year's Eve",             date:mk(12,31),category:'personal', color:'dark', desc:'Global celebration' },
        ].map(ev => ({ ...ev, isGlobal: true as const }));

        await GlobalEvent.insertMany(globals, { ordered: false }).catch(() => {/* ignore dupe key */});
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
                { id:'ma25-01', title:"New Year's Day", date:"2025-01-01", category:'personal', color:'green', desc:'Moroccan Public holiday' },
                { id:'ma25-02', title:"Independence Manifesto", date:"2025-01-11", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma25-03', title:"Amazigh New Year", date:"2025-01-14", category:'personal', color:'green', desc:'Moroccan Public holiday' },
                { id:'ma25-04', title:"Eid al-Fitr", date:"2025-03-31", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma25-05', title:"Labour Day", date:"2025-05-01", category:'personal', color:'dark', desc:'Moroccan Public holiday' },
                { id:'ma25-06', title:"Eid al-Adha", date:"2025-06-07", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma25-07', title:"Islamic New Year", date:"2025-06-27", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma25-08', title:"Throne Day", date:"2025-07-30", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma25-09', title:"Oued Ed-Dahab Day", date:"2025-08-14", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma25-10', title:"Revolution Day", date:"2025-08-20", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma25-11', title:"Youth Day", date:"2025-08-21", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma25-12', title:"Prophet's Birthday", date:"2025-09-05", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma25-13', title:"Green March Day", date:"2025-11-06", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma25-14', title:"Independence Day", date:"2025-11-18", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                
                { id:'ma26-01', title:"New Year's Day", date:"2026-01-01", category:'personal', color:'green', desc:'Moroccan Public holiday' },
                { id:'ma26-02', title:"Independence Manifesto", date:"2026-01-11", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma26-03', title:"Amazigh New Year", date:"2026-01-14", category:'personal', color:'green', desc:'Moroccan Public holiday' },
                { id:'ma26-04', title:"Eid al-Fitr", date:"2026-03-20", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma26-05', title:"Labour Day", date:"2026-05-01", category:'personal', color:'dark', desc:'Moroccan Public holiday' },
                { id:'ma26-06', title:"Eid al-Adha", date:"2026-05-27", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma26-07', title:"Islamic New Year", date:"2026-06-17", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma26-08', title:"Throne Day", date:"2026-07-30", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma26-09', title:"Oued Ed-Dahab Day", date:"2026-08-14", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma26-10', title:"Revolution Day", date:"2026-08-20", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma26-11', title:"Youth Day", date:"2026-08-21", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma26-12', title:"Prophet's Birthday", date:"2026-08-26", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
                { id:'ma26-13', title:"Green March Day", date:"2026-11-06", category:'personal', color:'red', desc:'Moroccan Public holiday' },
                { id:'ma26-14', title:"Independence Day", date:"2026-11-18", category:'personal', color:'red', desc:'Moroccan Public holiday' },
            ].map(ev => ({ ...ev, isGlobal: true }));

            for (const holiday of moroccoHolidays) {
                await GlobalEvent.findOneAndUpdate({ id: holiday.id }, holiday, { upsert: true });
            }
            res.json({ message: 'Moroccan holidays seeded successfully.' });
        } catch (err) {
            console.error('seedHolidays error:', err);
            res.status(500).json({ error: 'Failed to seed holidays' });
        }
    }
}

import { Router, Request, Response } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { User } from '../models/User';
import { School } from '../models/School';
import { Level } from '../models/Level';
import { Guidance } from '../models/Guidance';
import { Subject } from '../models/Subject';
import { Lesson } from '../models/Lesson';
import { News } from '../models/News';
import { NewsQuestion } from '../models/NewsQuestion';
import { Contribution } from '../models/Contribution';
import { Feedback } from '../models/Feedback';
import { TeacherApplication } from '../models/TeacherApplication';
import { TeacherVerification } from '../models/TeacherVerification';
import { TeacherProfile } from '../models/TeacherProfile';
import { TeacherRoom } from '../models/TeacherRoom';
import { TeacherRoomMessage } from '../models/TeacherRoomMessage';
import { InstructorCourse } from '../models/InstructorCourse';
import { InstructorRating } from '../models/InstructorRating';
import ChatRoom from '../models/ChatRoom';
import Message from '../models/Message';
import { GlobalEvent } from '../models/GlobalEvent';
import { Newsletter } from '../models/Newsletter';
import { SchoolService } from '../models/SchoolService';
import { RewardRequest } from '../models/RewardRequest';
import { Notification } from '../models/Notification';
import { AiAnswer } from '../models/AiAnswer';
import { Report } from '../models/Report';
import { UserReport } from '../models/UserReport';
import { MonthlyRank } from '../models/MonthlyRank';

const router = Router();

const COLLECTIONS: Record<string, { model: any; label: string; danger?: boolean }> = {
    // Content
    news:                  { model: News,                label: 'News Articles' },
    news_questions:        { model: NewsQuestion,        label: 'News Q&A' },
    contributions:         { model: Contribution,        label: 'Contributions' },
    school_services:       { model: SchoolService,       label: 'School Services' },

    // Community
    feedback:              { model: Feedback,            label: 'Feedback & Reports' },
    reports:               { model: Report,              label: 'Reports' },
    user_reports:          { model: UserReport,          label: 'User Reports' },
    reward_requests:       { model: RewardRequest,       label: 'Reward Requests' },

    // Teachers & Instructors
    teacher_applications:  { model: TeacherApplication,  label: 'Teacher Applications' },
    teacher_verifications: { model: TeacherVerification, label: 'Teacher Verifications' },
    teacher_profiles:      { model: TeacherProfile,      label: 'Teacher Profiles' },
    teacher_rooms:         { model: TeacherRoom,         label: 'Teacher Rooms' },
    teacher_room_messages: { model: TeacherRoomMessage,  label: 'Teacher Room Messages' },
    instructor_courses:    { model: InstructorCourse,    label: 'Instructor Courses' },
    instructor_ratings:    { model: InstructorRating,    label: 'Instructor Ratings' },

    // Chat
    chat_rooms:            { model: ChatRoom,            label: 'Chat Rooms' },
    chat_messages:         { model: Message,             label: 'Chat Messages' },

    // Other
    global_events:         { model: GlobalEvent,         label: 'Global Calendar Events' },
    newsletter:            { model: Newsletter,          label: 'Newsletter Subscribers' },
    notifications:         { model: Notification,        label: 'Notifications' },
    ai_answers:            { model: AiAnswer,            label: 'AI Answers' },
    monthly_ranks:         { model: MonthlyRank,         label: 'Monthly Rankings' },

    // Danger zone — wiping breaks the content tree or removes all users
    schools:               { model: School,              label: 'Schools',    danger: true },
    levels:                { model: Level,               label: 'Levels',     danger: true },
    guidances:             { model: Guidance,            label: 'Guidances',  danger: true },
    subjects:              { model: Subject,             label: 'Subjects',   danger: true },
    lessons:               { model: Lesson,              label: 'Lessons',    danger: true },
    users:                 { model: User,                label: 'Users',      danger: true },
};

// GET /api/admin/collections — list all collections with document counts
router.get('/collections', authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
    try {
        const results = await Promise.all(
            Object.entries(COLLECTIONS).map(async ([key, { label, danger }]) => {
                const count = await COLLECTIONS[key].model.countDocuments();
                return { key, label, count, danger: danger ?? false };
            })
        );
        res.json(results);
    } catch (err) {
        console.error('Collection count error:', err);
        res.status(500).json({ error: 'Failed to fetch collection counts' });
    }
});

// DELETE /api/admin/collections/:key — wipe all documents in a collection
router.delete('/collections/:key', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    const { key } = req.params;
    const entry = COLLECTIONS[key];
    if (!entry) {
        res.status(404).json({ error: `Unknown collection: ${key}` });
        return;
    }
    try {
        const result = await entry.model.deleteMany({});
        res.json({ message: `${entry.label} wiped`, deleted: result.deletedCount });
    } catch (err) {
        console.error(`Wipe error [${key}]:`, err);
        res.status(500).json({ error: 'Wipe failed' });
    }
});

export default router;

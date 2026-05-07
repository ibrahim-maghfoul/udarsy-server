import mongoose, { Schema, Document } from 'mongoose';

export interface ILessonResource {
    title: string;
    url: string;
    type?: string;
    docId?: string;
}

export interface ILesson extends Document {
    title: string;
    subjectId: string;
    coursesPdf?: ILessonResource[];
    videos?: ILessonResource[];
    exercices?: ILessonResource[];
    exams?: ILessonResource[];
    resourses?: ILessonResource[];
    createdAt: Date;
    updatedAt: Date;
}

const LessonResourceSchema = new Schema({
    title: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String },
    docId: { type: String },
});

const LessonSchema = new Schema<ILesson>({
    _id: { type: String, required: true } as any,
    title: { type: String, required: true },
    subjectId: { type: String, required: true, index: true },
    coursesPdf: [LessonResourceSchema],
    videos: [LessonResourceSchema],
    exercices: [LessonResourceSchema],
    exams: [LessonResourceSchema],
    resourses: [LessonResourceSchema],
}, {
    timestamps: true,
    _id: false
});

export const Lesson = mongoose.model<ILesson>('Lesson', LessonSchema);

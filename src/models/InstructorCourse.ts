import mongoose, { Schema, Document } from 'mongoose';

export interface IInstructorCourse extends Document {
    instructorId: mongoose.Types.ObjectId; // userId of instructor
    title: string;
    description?: string;
    videoUrl?: string;  // video/applications/{userId}.{ext}
    pdfUrl?: string;    // documents/{userId}/{filename}.pdf
    guidanceId: string;
    subjectId: string;
    viewCount: number;
    downloadCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const InstructorCourseSchema = new Schema<IInstructorCourse>({
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    videoUrl: { type: String },
    pdfUrl: { type: String },
    guidanceId: { type: String, required: true },
    subjectId: { type: String, required: true },
    viewCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
}, {
    timestamps: true,
});

// Index for querying by instructor
InstructorCourseSchema.index({ instructorId: 1, createdAt: -1 });
// Indexes for filtering by guidance/subject (used in listInstructors, getInstructorCourses)
InstructorCourseSchema.index({ guidanceId: 1, subjectId: 1 });

export const InstructorCourse = mongoose.model<IInstructorCourse>('InstructorCourse', InstructorCourseSchema);

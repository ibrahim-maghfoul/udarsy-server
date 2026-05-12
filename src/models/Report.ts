import mongoose, { Schema, Document } from 'mongoose';

export interface IReport extends Document {
    type: 'dashboard_stats';
    levelsStat: {
        guidanceId: string;
        title: string;
        totalPdfs: number;
        totalVideos: number;
        totalExercises: number;
        totalExams: number;
        totalLessons: number;
        totalSubjects: number;
        totalResources: number;
    }[];
    newsStat: {
        category: string;
        count: number;
    }[];
    contributionStat: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        byGuidance: {
            guidanceId: string;
            count: number;
        }[];
    };
    feedbackStat: {
        total: number;
        byType: {
            type: string;
            count: number;
        }[];
    };
    overallStat: {
        totalPdfs: number;
        totalVideos: number;
        totalExercises: number;
        totalExams: number;
        totalLessons: number;
        totalSubjects: number;
        totalGuidances: number;
        totalLevels: number;
        totalResources: number;
        totalItems: number;
        totalUsers: number;
        totalNews: number;
    };
    updatedAt: Date;
}

const ReportSchema = new Schema<IReport>({
    type: { type: String, default: 'dashboard_stats', unique: true },
    levelsStat: [{
        guidanceId: { type: String },
        title: { type: String },
        totalPdfs: { type: Number },
        totalVideos: { type: Number },
        totalExercises: { type: Number },
        totalExams: { type: Number },
        totalLessons: { type: Number },
        totalSubjects: { type: Number },
        totalResources: { type: Number }
    }],
    newsStat: [{
        category: { type: String },
        count: { type: Number }
    }],
    contributionStat: {
        total: { type: Number, default: 0 },
        pending: { type: Number, default: 0 },
        approved: { type: Number, default: 0 },
        rejected: { type: Number, default: 0 },
        byGuidance: [{
            guidanceId: { type: String },
            count: { type: Number }
        }]
    },
    feedbackStat: {
        total: { type: Number, default: 0 },
        byType: [{
            type: String,
            count: { type: Number }
        }]
    },
    overallStat: {
        totalPdfs: { type: Number },
        totalVideos: { type: Number },
        totalExercises: { type: Number },
        totalExams: { type: Number },
        totalLessons: { type: Number },
        totalSubjects: { type: Number },
        totalGuidances: { type: Number },
        totalLevels: { type: Number },
        totalResources: { type: Number },
        totalItems: { type: Number },
        totalUsers: { type: Number },
        totalNews: { type: Number }
    }
}, {
    timestamps: true
});

export const Report = mongoose.model<IReport>('Report', ReportSchema);

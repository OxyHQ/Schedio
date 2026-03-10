import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPostAnalytics extends Document {
  postId: Types.ObjectId;
  platform: string;
  metrics: {
    likes: number;
    shares: number;
    comments: number;
    impressions: number;
    reach: number;
    clicks: number;
  };
}

const PostAnalyticsSchema = new Schema<IPostAnalytics>({
  postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  platform: { type: String, required: true },
  metrics: {
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
}, { timestamps: true, versionKey: false });

PostAnalyticsSchema.index({ postId: 1, platform: 1 }, { unique: true });

export const PostAnalytics = mongoose.model<IPostAnalytics>('PostAnalytics', PostAnalyticsSchema);
export default PostAnalytics;

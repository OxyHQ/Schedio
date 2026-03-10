import mongoose, { Schema, Document, Types } from 'mongoose';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface IPost extends Document {
  userId: string;
  content: string;
  media: string[];
  platforms: Types.ObjectId[];
  status: PostStatus;
  scheduledAt?: Date;
  publishedAt?: Date;
  hashtags: string[];
  retryCount: number;
}

const PostSchema = new Schema<IPost>({
  userId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  media: [{ type: String }],
  platforms: [{ type: Schema.Types.ObjectId, ref: 'SocialAccount' }],
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'failed'], default: 'draft' },
  scheduledAt: { type: Date },
  publishedAt: { type: Date },
  hashtags: [{ type: String }],
  retryCount: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

PostSchema.index({ userId: 1, status: 1 });
PostSchema.index({ status: 1, scheduledAt: 1 });

export const Post = mongoose.model<IPost>('Post', PostSchema);
export default Post;

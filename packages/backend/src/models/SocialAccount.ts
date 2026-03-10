import mongoose, { Schema, Document } from 'mongoose';

export type SocialPlatform = 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'mastodon';

export interface ISocialAccount extends Document {
  userId: string;
  platform: SocialPlatform;
  platformUserId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  profileImageUrl?: string;
  isActive: boolean;
  connectedAt: Date;
}

const SocialAccountSchema = new Schema<ISocialAccount>({
  userId: { type: String, required: true, index: true },
  platform: { type: String, required: true, enum: ['twitter', 'instagram', 'facebook', 'linkedin', 'mastodon'] },
  platformUserId: { type: String, required: true },
  platformUsername: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
  tokenExpiresAt: { type: Date },
  profileImageUrl: { type: String },
  isActive: { type: Boolean, default: true },
  connectedAt: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });

SocialAccountSchema.index({ userId: 1, platform: 1, platformUserId: 1 }, { unique: true });

export const SocialAccount = mongoose.model<ISocialAccount>('SocialAccount', SocialAccountSchema);
export default SocialAccount;

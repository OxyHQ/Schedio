import mongoose, { Schema, Document } from 'mongoose';

export interface ITimeSlot {
  dayOfWeek: number; // 0-6, Sunday-Saturday
  time: string; // HH:mm format
}

export interface IPublishingSchedule extends Document {
  userId: string;
  name: string;
  slots: ITimeSlot[];
  timezone: string;
  isDefault: boolean;
}

const TimeSlotSchema = new Schema<ITimeSlot>({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  time: { type: String, required: true },
}, { _id: false });

const PublishingScheduleSchema = new Schema<IPublishingSchedule>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  slots: [TimeSlotSchema],
  timezone: { type: String, default: 'UTC' },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

export const PublishingSchedule = mongoose.model<IPublishingSchedule>('PublishingSchedule', PublishingScheduleSchema);
export default PublishingSchedule;

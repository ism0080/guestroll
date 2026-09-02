import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core"

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  ownerId: text("ownerId").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  coverKey: text("coverKey"),
  filterPack: text("filterPack").notNull(),
  photoLimit: integer("photoLimit").notNull(),
  status: text("status").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull()
}, (table) => [
  uniqueIndex("events_slug_unique").on(table.slug),
  index("events_owner_id_created_at_idx").on(table.ownerId, table.createdAt),
  check("events_photo_limit_positive", sql`${table.photoLimit} > 0`),
  check("events_status_valid", sql`${table.status} IN ('draft', 'live')`)
])

export const cameras = sqliteTable("cameras", {
  id: text("id").primaryKey(),
  eventId: text("eventId")
    .notNull()
    .references(() => events.id),
  guestName: text("guestName"),
  usedCount: integer("usedCount").notNull().default(0),
  createdAt: text("createdAt").notNull()
}, (table) => [
  index("cameras_event_id_idx").on(table.eventId),
  unique("cameras_id_event_id_unique").on(table.id, table.eventId),
  check("cameras_used_count_non_negative", sql`${table.usedCount} >= 0`)
])

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  uploadId: text("uploadId").notNull(),
  eventId: text("eventId").notNull(),
  cameraId: text("cameraId").notNull(),
  objectKey: text("objectKey").notNull().unique(),
  thumbKey: text("thumbKey").notNull(),
  takenAt: text("takenAt").notNull(),
  uploadedAt: text("uploadedAt").notNull()
}, (table) => [
  unique("photos_camera_upload_unique").on(table.cameraId, table.uploadId),
  index("photos_event_id_uploaded_at_id_idx").on(table.eventId, table.uploadedAt, table.id),
  index("photos_camera_id_idx").on(table.cameraId),
  foreignKey({
    columns: [table.cameraId, table.eventId],
    foreignColumns: [cameras.id, cameras.eventId]
  }).onDelete("cascade")
])

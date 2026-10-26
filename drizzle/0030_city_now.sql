CREATE TABLE "social_city_now" (
	"id" text PRIMARY KEY NOT NULL,
	"weather" jsonb,
	"weather_at" timestamp with time zone,
	"sanroo" jsonb,
	"sanroo_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

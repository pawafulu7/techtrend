-- Add personalizationPeriodMonths column to User table
-- This stores the user's preferred time period for personalized article filtering
-- Default is 12 months, 0 means all time

ALTER TABLE "User" ADD COLUMN "personalizationPeriodMonths" INTEGER NOT NULL DEFAULT 12;

-- Add comment for documentation
COMMENT ON COLUMN "User"."personalizationPeriodMonths" IS 'Time period in months for personalized article filtering (0 = all time, default = 12)';

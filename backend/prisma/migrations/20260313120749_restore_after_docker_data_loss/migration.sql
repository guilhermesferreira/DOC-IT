-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "guiVersion" TEXT,
ADD COLUMN     "tamperEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tamperPassword" TEXT;

-- AlterTable
ALTER TABLE "GlobalSettings" ADD COLUMN     "selectedOsqueryVersion" TEXT NOT NULL DEFAULT 'latest';

-- AlterTable
ALTER TABLE "UserGroup" ADD COLUMN     "canManageTemplates" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OsqueryTemplate" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OsqueryTemplate_pkey" PRIMARY KEY ("id")
);

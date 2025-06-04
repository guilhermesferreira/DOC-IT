/*
  Warnings:

  - You are about to drop the column `isMfaEnabled` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `mfaSecret` on the `Device` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Device" DROP COLUMN "isMfaEnabled",
DROP COLUMN "mfaSecret";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isMfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT;

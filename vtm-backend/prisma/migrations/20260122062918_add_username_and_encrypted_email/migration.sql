/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[usernameNorm]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailHash]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailEnc" TEXT,
ADD COLUMN     "emailHash" TEXT,
ADD COLUMN     "username" TEXT,
ADD COLUMN     "usernameNorm" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameNorm_key" ON "User"("usernameNorm");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

-- CreateIndex
CREATE INDEX "User_usernameNorm_idx" ON "User"("usernameNorm");

-- CreateIndex
CREATE INDEX "User_emailHash_idx" ON "User"("emailHash");

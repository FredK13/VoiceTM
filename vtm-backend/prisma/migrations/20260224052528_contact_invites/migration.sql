-- CreateEnum
CREATE TYPE "ContactInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ContactInvite" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "ContactInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactInvite_toUserId_status_idx" ON "ContactInvite"("toUserId", "status");

-- CreateIndex
CREATE INDEX "ContactInvite_fromUserId_status_idx" ON "ContactInvite"("fromUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContactInvite_fromUserId_toUserId_key" ON "ContactInvite"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "ContactInvite" ADD CONSTRAINT "ContactInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInvite" ADD CONSTRAINT "ContactInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "FakeBubble" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "vx" DOUBLE PRECISION NOT NULL,
    "vy" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FakeBubble_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FakeBubble_userId_idx" ON "FakeBubble"("userId");

-- AddForeignKey
ALTER TABLE "FakeBubble" ADD CONSTRAINT "FakeBubble_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

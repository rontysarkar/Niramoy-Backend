import cron from "node-cron";
import { prisma } from "./prisma";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";

export const deletedUnverifiedDoctor = () => {
  cron.schedule("0 * * * *", async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const deletedDoctor = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          emailVerified: false,
          createdAt: {
            lt: oneHourAgo,
          },
          doctor: {
            verificationStatus: DoctorVerificationStatus.PENDING,
          },
        },
      });
      console.log(deletedDoctor)
      if (deletedDoctor.count > 0) {
        console.log(
          `Unverified ${deletedDoctor.count} doctor deleted from database`,
        );
      }
    } catch (error) {
      console.log("Unverified data deleted failed", error);
    }

    console.log("Unverified deleted function running");
  });
};

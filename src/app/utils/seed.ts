import bcrypt from "bcryptjs";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";

export const seedSuperAdmin = async () => {
  try {
    const isSuperAdminExist = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdminExist) {
      console.log("Super Admin Already Exists!");
      return;
    }

    const name = config.super_admin_name;
    const email = config.super_admin_email;
    const password = config.super_admin_password;

    const hashPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashPassword,
        role: Role.SUPER_ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Super Admin Created:", superAdmin);
  } catch (error) {
    console.log("Error Seeding Super Admin:", error);
    await prisma.user.delete({
      where: {
        email: config.super_admin_email,
      },
    });
  }
};

export const seedTestAdmin = async () => {
  try {
    const name = config.test_admin_name;
    const email = config.test_admin_email;
    const password = config.test_admin_password;

    const isExistsTestAdmin = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (isExistsTestAdmin) {
      console.log("Test Admin Already Exists");
      return;
    }

    const hashPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const testAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashPassword,
        emailVerified: true,
        role: Role.ADMIN,
      },
    });

    console.log("Test Admin Created :", testAdmin);
  } catch (error) {
    console.log("Seeding Test Admin Error:", error);
    await prisma.user.delete({
      where: {
        email: config.test_admin_email,
      },
    });
  }
};

export const seedTestDoctor = async () => {
  try {
    const name = config.test_doctor_name;
    const email = config.test_doctor_email;
    const password = config.test_doctor_password;

    const isExistsTestDoctor = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (isExistsTestDoctor) {
      console.log("Test Doctor Already Exists ");
      return;
    }
    const hashPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );
    const testDoctor = await prisma.user.create({
      data: {
        name,
        email,
        password: hashPassword,
        emailVerified: true,
        role: Role.DOCTOR,
        doctor: {
          create: {
            email,
            name,
            specialization: "Internal Medicine Specialist",
            experienceYears: "5",
            licenseNumber: "1243MBS",
            qualifications: "MBBS, SPC",
            verificationStatus:DoctorVerificationStatus.APPROVED
          },
        },
      },
    });

    console.log("Test Doctor Created :", testDoctor);
  } catch (error) {
    console.log("Seeding Test Doctor Error:", error);
    await prisma.user.delete({
      where: {
        email: config.test_doctor_email,
      },
    });
  }
};

import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { IApproveDoctorPayload, IDoctorWithUser } from "./doctor.interface";
import { cloudinary, uploadToCloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import {
  DoctorVerificationStatus,
  Role,
} from "../../../generated/prisma/enums";
import crypto from "crypto";
import ejs from "ejs";
import path from "path";
import { transporter } from "../../lib/nodemailer";
import { redisClient } from "../../lib/redis";
import { IRequestUser } from "../auth/auth.interface";

const applyAsDoctor = async (
  payload: IDoctorWithUser,
  resume: Express.Multer.File,
  additionalFiles: Express.Multer.File[],
) => {
  const isExistsEmail = await prisma.user.findUnique({
    where: {
      email: payload?.user?.email,
    },
  });

  if (isExistsEmail) {
    throw new Error("This Email already Create an account");
  }

  const cloudinaryResumeResult = await uploadToCloudinary(resume);

  let cloudinaryAdditionalFilesResult: Array<{
    url: string;
    publicId: string;
  }> = [];

  if (additionalFiles && additionalFiles.length > 0) {
    const uploadPromises = additionalFiles.map((file) =>
      uploadToCloudinary(file),
    );
    const cloudinaryResults = await Promise.all(uploadPromises);

    cloudinaryAdditionalFilesResult = cloudinaryResults.map((result) => ({
      url: result.secure_url,
      publicId: result.public_id,
    }));
  }

  const randomPass = Math.random().toString(36).slice(-8);
  const hashPassword = await bcrypt.hash(
    randomPass,
    Number(config.bcrypt_salt_rounds),
  );

  const doctorApplication = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashPassword,
      needPasswordChange: true,
      role: Role.DOCTOR,
      doctor: {
        create: {
          name: payload.user.name,
          email: payload.user.email,
          ...payload.doctor,
          resume: cloudinaryResumeResult.secure_url,
          resumePublicId: cloudinaryResumeResult.public_id,
          additionalFiles: cloudinaryAdditionalFilesResult,
          verificationStatus: "PENDING",
        },
      },
    },
  });

  const otp = crypto.randomInt(100000, 1000000).toString();
  const doctorApplicationOtpKey = `doctor-application-otp:${doctorApplication?.email}`;

  await redisClient.set(doctorApplicationOtpKey, otp, {
    EX: 60 * 60,
  });

  const verifyEmailTemplatePath = path.join(
    process.cwd(),
    "/src/app/templates/verify-email.ejs",
  );
  const html = await ejs.renderFile(verifyEmailTemplatePath, {
    otp,
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: doctorApplication?.email,
    subject: "Email Verification OTP",
    html,
  });

  return doctorApplication;
};

const applyAsDoctorEmailVerify = async (email: string, otp: string) => {
  const existingEmail = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!existingEmail) {
    throw new Error("Email not found");
  }

  if (
    existingEmail.status === "BLOCKED" ||
    existingEmail.status === "DELETED"
  ) {
    throw new Error(`This user already ${existingEmail.status}`);
  }

  const doctorApplicationOtpKey = `doctor-application-otp:${email}`;

  const redisOtp = await redisClient.get(doctorApplicationOtpKey);
  if (!redisOtp) {
    throw new Error("Otp Expired");
  }

  if (redisOtp !== otp) {
    throw new Error("OTP incorrect");
  }

  const verifiedEmailDoctor = await prisma.user.update({
    where: {
      email,
    },
    data: {
      emailVerified: true,
    },
    omit: {
      password: true,
    },
    include: {
      doctor: true,
    },
  });

  return verifiedEmailDoctor;
};

const approveDoctor = async (
  payload: IApproveDoctorPayload,
  reviewer: IRequestUser,
) => {
  const { doctorId, verificationStatus, rejectReason } = payload;

  const existsDoctor = await prisma.doctor.findUnique({
    where: {
      id: doctorId,
    },
    include: {
      user: true,
    },
  });

  if (!existsDoctor) {
    throw new Error("Doctor Application Not Found");
  }

  if (existsDoctor.isDeleted) {
    throw new Error("Doctor has been Deleted");
  }

  if (!existsDoctor.user.emailVerified) {
    throw new Error(
      "Doctor Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
    );
  }

  if (existsDoctor.verificationStatus === "APPROVED") {
    throw new Error("Doctor Already Approve");
  }

  if (existsDoctor.verificationStatus === "REJECTED") {
    throw new Error("Doctor Already Rejected");
  }

  if (verificationStatus === "REJECTED" && !rejectReason) {
    throw new Error("Reject Reason is Required");
  }

  const updatedDoctor = await prisma.doctor.update({
    where: {
      id: doctorId,
    },
    data: {
      verificationStatus,
      rejectionReason:
        verificationStatus === DoctorVerificationStatus.REJECTED
          ? rejectReason
          : null,
    },
  });
  return updatedDoctor;
};

export const DoctorServices = {
  applyAsDoctor,
  applyAsDoctorEmailVerify,
  approveDoctor,
};

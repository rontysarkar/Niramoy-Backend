import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { IDoctorWithUser } from "./doctor.interface";
import { cloudinary, uploadToCloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { Role } from "../../../generated/prisma/enums";

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
        },
      },
    },
    include: {
      doctor: true,
    },
  });

  return doctorApplication;
};

export const DoctorServices = {
  applyAsDoctor,
};

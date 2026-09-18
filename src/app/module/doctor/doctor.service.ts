import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { IApproveDoctorPayload, IDoctorWithUser, IUpdateDoctorProfilePayload } from "./doctor.interface";
import { cloudinary, uploadToCloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import {
  DoctorVerificationStatus,
  Role,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import crypto from "crypto";
import ejs from "ejs";
import path from "path";
import { transporter } from "../../lib/nodemailer";
import { redisClient } from "../../lib/redis";
import { IRequestUser } from "../auth/auth.interface";
import { IQuery } from "../../interface";
import { Prisma } from "../../../generated/prisma/client";
import { buildQuery } from "../../utils/buildQuery";
import { DoctorWhereInput } from "../../../generated/prisma/models";
import httpStatus from 'http-status'
import { AppError } from "../../utils/AppError";
import { addDays, startOfDay } from "date-fns";

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
      reviewedBy: reviewer?.userId,
      reviewedAt: new Date(),
    },
  });
  return updatedDoctor;
};

const getAllDoctors = async (query: IQuery) => {
  const { limit, page, skip, sortBy, sortOrder } = buildQuery(query);

  const andConditions: DoctorWhereInput[] = [];

  if (query?.searchTerm) {
    andConditions.push({
      OR: [
        {
          name: {
            contains: query.searchTerm,
            mode: "insensitive",
          },
        },
        {
          specialization: {
            contains: query.searchTerm,
            mode: "insensitive",
          },
        },
        { email: { contains: query.searchTerm, mode: "insensitive" } },
        { licenseNumber: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query?.specialization) {
    andConditions.push({
      specialization: {
        equals: query.specialization,
        mode: "insensitive",
      },
    });
  }

  if (query?.licenseNumber) {
    andConditions.push({
      licenseNumber: {
        equals: query.licenseNumber,
        mode: "insensitive",
      },
    });
  }

  if (query?.verificationStatus) {
    andConditions.push({
      verificationStatus: query?.verificationStatus,
    });
  }

  andConditions.push({
    isDeleted: false,
  });

  const allDoctors = await prisma.doctor.findMany({
    where: {
      AND: andConditions,
    },
    skip,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      user: {
        omit: {
          password: true,
        },
      },
    },
  });

  const totalDoctorCount = await prisma.doctor.count({
    where: {
      AND: andConditions,
    },
  });

  return {
    data: allDoctors,
    meta: {
      page: page,
      limit: limit,
      total: totalDoctorCount,
      totalPages: Math.ceil(totalDoctorCount / limit),
    },
  };
};


const updateDoctorProfile = async (payload : IUpdateDoctorProfilePayload, user : IRequestUser) => {
	const existingDoctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const updatedDoctor = await prisma.doctor.update({
		where: { id: existingDoctor.id },
		data: payload,
	});

	return updatedDoctor;

}


const getAvailableDoctorByTodaysSchedule = async (query: IQuery) => {

	const {limit,page,skip,sortBy,sortOrder} = buildQuery(query)

	const now = new Date();
	const startOfToday = startOfDay(now);
	const startOfTomorrow = addDays(startOfToday, 1);


	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ verificationStatus: DoctorVerificationStatus.APPROVED },
		{
			schedule: {
				some: {
					isDeleted: false,
					status: ScheduleStatus.PUBLISHED,
					availableSlots: { gt: 0 },
					startDateTime: {
						gte: startOfToday,
						lt: startOfTomorrow,
						gt: now,
					},
				} } },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	const availableDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
			schedule: {
				where: {
					isDeleted: false,
					status: ScheduleStatus.PUBLISHED,
					availableSlots: { gt: 0 },
					startDateTime: {
						gte: startOfToday,
						lt: startOfTomorrow,
						gt: now,
					},
				},
				orderBy: { [sortBy] : sortOrder },
				select: {
					id: true,
					startDateTime: true,
					endDateTime: true,
					availableSlots: true,
					totalSlots: true,
				},
			},
		},
	});

	const totalAvailableDoctorCount = await prisma.doctor.count({
		where: { AND: andConditions },
	});

	return {
		data: availableDoctors,
		meta: {
			page,
			limit,
			total: totalAvailableDoctorCount,
			totalPages: Math.ceil(totalAvailableDoctorCount / limit),
		},
	};
}


const getAllDoctorsListPublic = async (query: IQuery) => {

	const {limit,page,skip,sortBy,sortOrder} = buildQuery(query)

	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ verificationStatus: DoctorVerificationStatus.APPROVED },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
				{ qualifications: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	const allDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	const totalDoctorCount = await prisma.doctor.count({
		where: { AND: andConditions },
	});

	return {
		data: allDoctors,
		meta: {
			page,
			limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit),
		},
	};
}


const getSingleDoctorPublicProfile = async (doctorId: string) => {

	const doctor = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
			isDeleted: false,
			verificationStatus: DoctorVerificationStatus.APPROVED,
		},
		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found");
	}

	return doctor;
}


export const DoctorServices = {
  applyAsDoctor,
  applyAsDoctorEmailVerify,
  approveDoctor,
  getAllDoctors,
  updateDoctorProfile,
  getAvailableDoctorByTodaysSchedule,
  getAllDoctorsListPublic,
  getSingleDoctorPublicProfile,
};

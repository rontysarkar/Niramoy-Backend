import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { DoctorServices } from "./doctor.service";
import { doctorWithUserSchema } from "./doctor.validation";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const zodResult = doctorWithUserSchema.safeParse(JSON.parse(req?.body?.data));
  if (!zodResult.success) {
    const message = `${zodResult.error.issues[0].path[0] as string} ${zodResult.error.issues[0].message}`;
    throw new Error(message);
  }
  const payload = zodResult.data;

  const files = req.files as {
    resume?: Express.Multer.File[];
    additionalFiles?: Express.Multer.File[];
  };

  const resumeFile = files?.resume?.[0];
  const additionalFiles = files?.additionalFiles || [];
  if (!resumeFile) {
    throw new Error("Resume is Required");
  }

  const result = await DoctorServices.applyAsDoctor(
    payload,
    resumeFile,
    additionalFiles,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "doctor email verification otp send",
    data: result,
  });
});

const applyAsDoctorVerifyEmail = catchAsync(
  async (req: Request, res: Response) => {
    const { email, otp } = req.body;
    const result = await DoctorServices.applyAsDoctorEmailVerify(email, otp);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Email Verified Successfully",
      data: result,
    });
  },
);

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const result = await DoctorServices.approveDoctor(payload, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: `Application ${result.verificationStatus} Successfully`,
    data: result,
  });
});

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
  
  const {data,meta} = await DoctorServices.getAllDoctors(req.query);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: `Doctors Retrieved Successfully`,
    data: data,
    meta:meta,
  });
});




export const DoctorController = {
  applyAsDoctor,
  applyAsDoctorVerifyEmail,
  approveDoctor,
  getAllDoctors
};

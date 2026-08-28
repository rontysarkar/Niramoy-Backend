import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { DoctorServices } from "./doctor.service";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const payload = req?.body?.data;
  const files = req.files as {
    resume?: Express.Multer.File[];
    additionalFiles?: Express.Multer.File[];
  };

  const resumeFile = files?.resume?.[0];
  const additionalFiles = files?.additionalFiles || [];
  if (!resumeFile) {
    throw new Error("Resume is Required");
  }

  const result = await DoctorServices.applyAsDoctor(payload,resumeFile,additionalFiles);


  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "doctor",
    data: null,
  });
});

export const DoctorController = {
  applyAsDoctor,
};

import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  
   const files = req.files as { 
      resume?: Express.Multer.File[]; 
      additionalFiles?: Express.Multer.File[]; 
    };

    const resumeFile = files?.resume?.[0]
    if(!resumeFile){
      throw new Error("Resume is Required");
    }

    console.log("Resume File: -- ",resumeFile)

    const additionalFiles = files?.additionalFiles || [];
    console.log("AdditionalFIles:---",additionalFiles)

  

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

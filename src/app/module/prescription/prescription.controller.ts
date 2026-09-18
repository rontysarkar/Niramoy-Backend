import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { PrescriptionService } from "./prescription.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const createPrescription = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const result = await PrescriptionService.createPrescription(payload, user);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Prescription created successfully",
    data: result,
  });
});

const getSinglePrescription = catchAsync(
  async (req: Request, res: Response) => {
    const { prescriptionId } = req.params;
    const user = req.user!;
    const result = await PrescriptionService.getSinglePrescription(
      prescriptionId as string,
      user,
    );
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Prescription fetched successfully",
      data: result,
    });
  },
);

export const PrescriptionController = {
  createPrescription,
  getSinglePrescription,
};

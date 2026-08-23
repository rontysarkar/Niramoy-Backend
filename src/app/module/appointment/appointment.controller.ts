import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Book Appointment",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const query = req?.query;
    const { redirectUrl, executePaymentResult } =
      await AppointmentService.bookAppointmentCallback(query);
    console.log("Executed Payment Controller : ", executePaymentResult);
    res.redirect(redirectUrl);
  },
);

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
};

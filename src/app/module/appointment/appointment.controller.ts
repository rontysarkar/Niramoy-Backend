import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const result = await AppointmentService.bookAppointment(payload, user);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointment Payment Initiated Successfully",
    data: result,
  });
});

const payAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;

  const result = await AppointmentService.payAppointment(payload, user);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointment Payment Initiated Successfully",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const query = req?.query;
    const { redirectUrl } =
      await AppointmentService.bookAppointmentCallback(query);

    res.redirect(redirectUrl);
  },
);

const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const result = await AppointmentService.cancelAppointment(payload, req.user!);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointment Cancel Successfully",
    data: result,
  });
});

const getPatientAppointments = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await AppointmentService.getPatientAppointments(req.query, user);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Patient Appointments Retrieved Successfully",
    data: result,
  });
});

const getDoctorAppointments = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const query = req.query;
  const result = await AppointmentService.getDoctorAppointments(query, user);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Doctor Appointments Retrieved Successfully",
    data: result,
  });
});

const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.getAllAppointments(req.query);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "All Appointments Retrieved Successfully",
    data: result,
  });
});

const getAppointmentDetails = catchAsync(async (req: Request, res: Response) => {
  const appointmentId = req?.params?.appointmentId;
  const user = req.user!;
  const result = await AppointmentService.getAppointmentDetails(appointmentId as string, user);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointment Details Retrieved Successfully",
    data: result,
  });
});

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment,
  getPatientAppointments,
  getDoctorAppointments,
  getAllAppointments,
  getAppointmentDetails,
};

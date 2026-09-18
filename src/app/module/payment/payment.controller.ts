import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { PaymentServices } from "./payment.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
  const query = req.query;
  const user = req.user!;

  const { data, meta } = await PaymentServices.getMyPayments(query, user);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "My Payments retrieved successfully",
    data,
    meta,
  });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const query = req.query;

  const { data, meta } = await PaymentServices.getAllPayments(query);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "All Payments retrieved successfully",
    data,
    meta,
  });
});

const getPaymentById = catchAsync(async (req: Request, res: Response) => {
  const paymentId = req.params?.paymentId;
  const user = req.user!;
  const result = await PaymentServices.getPaymentById(
    paymentId as string,
    user,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Payment retrieved successfully",
    data: result,
  });
});

export const PaymentController = {
  getMyPayments,
  getAllPayments,
  getPaymentById,
};

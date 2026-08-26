import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { IRequestUser } from "../auth/auth.interface";

const bookAppointment = async (payload: any, user: IRequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("Bkash Id Token Messing");
    }

    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
      },
    });

    const createPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authorization: bkashIdToken,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: user.email,
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
          amount: "1200",
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );

    const createPaymentResult = await createPaymentResponse.json();

    await tx.payment.create({
      data: {
        amount: 1200,
        paymentId: createPaymentResult.paymentID,
        merchantInvoiceNumber: createPaymentResult?.merchantInvoiceNumber,
        appointmentId: appointment.id,
        gatewayResponse: createPaymentResult,
        payerReference: user.email,
      },
    });

    return {
      bkashUrl: createPaymentResult?.bkashURL,
    };
  });

  return transactionResult;
};

const payAppointment = async (payload: any, user: IRequestUser) => {
  const appointmentId = payload?.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
  });

  if (!existingAppointment) {
    throw new Error("Appointment Dose not Exists");
  }

  if (existingAppointment?.status !== "PENDING") {
    throw new Error("Appointment did Not Pending");
  }

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("Bkash Id Token Messing");
  }

  const createPaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        authorization: bkashIdToken,
        "x-app-key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email,
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: "1200",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: existingAppointment?.id,
      }),
    },
  );

  const createPaymentResult = await createPaymentResponse.json();

  await prisma.payment.update({
    where: {
      appointmentId: existingAppointment.id,
    },
    data: {
      merchantInvoiceNumber: createPaymentResult?.merchantInvoiceNumber,
      gatewayResponse: createPaymentResult,
      paymentId: createPaymentResult?.paymentID,
    },
  });

  return {
    bkashUrl: createPaymentResult?.bkashURL,
  };
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new Error("Bkash Id Token Messing");
    }
    const { paymentID, status } = query;
    if (!paymentID) {
      throw new Error("Payment Id Messing");
    }
    if (!status) {
      throw new Error("Status Messing");
    }

    const executePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authorization: bkashIdToken,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: paymentID,
        }),
      },
    );

    const executePaymentResult = await executePaymentResponse.json();

    if (status === "success") {
      await tx.appointment.update({
        where: {
          id: executePaymentResult?.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
        },
      });

      await tx.payment.update({
        where: {
          paymentId: paymentID,
        },
        data: {
          status: PaymentStatus.PAID,
          trxId: executePaymentResult?.trxID,
          paidAt: executePaymentResult?.paymentExecuteTime,
          gatewayResponse: executePaymentResult,
        },
      });

      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
      };
    } else if (status === "failure") {
      await tx.payment.update({
        where: {
          paymentId: paymentID,
        },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: executePaymentResult,
        },
      });

      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
      };
    } else if (status === "cancel") {
      await tx.payment.update({
        where: {
          paymentId: paymentID,
        },
        data: {
          status: PaymentStatus.CANCELLED,
          gatewayResponse: executePaymentResult,
        },
      });
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
      };
    } else {
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
      };
    }
  });

  return transactionResult;
};

const cancelAppointment = async (payload: any) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload?.appointmentId;

    const existingAppointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        payment: true,
      },
    });

    if (!existingAppointment) {
      throw new Error("Appointment Dose not exists");
    }

    if (
      existingAppointment.status === "ONGOING" ||
      existingAppointment.status === "COMPLETED"
    ) {
      throw new Error(
        "Appointment already Ongoing or Completed, Now Your Cant't Cancel",
      );
    }

    if (existingAppointment.status === "CANCELLED") {
      throw new Error("Appointment Already Canceled");
    }

    // When Appointment Pending ????

    const updatedAppointment = await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status: "CANCELLED",
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("Bkash Id Token Messing");
    }

    const refundPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authorization: bkashIdToken,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: existingAppointment?.payment?.paymentId,
          trxID: existingAppointment?.payment?.trxId,
          amount: existingAppointment.payment?.amount,
          sku: "Test",
          reason: "Appointment Cancel",
        }),
      },
    );

    const refundPaymentResult = await refundPaymentResponse.json();

    const updatedPayment = await prisma.payment.update({
      where: {
        id: existingAppointment?.payment?.id,
      },
      data: {
        refundAmount: refundPaymentResult?.amount,
        refundTrxId: refundPaymentResult?.refundTrxID,
        refundAt: refundPaymentResult?.completedTime,
        refundReason: "Appointment Canceled",
        gatewayResponse: refundPaymentResult,
        status: "REFUNDED",
      },
    });

    return {
      appointment: updatedAppointment,
      payment: updatedPayment,
    };
  });
  return transactionResult;
};

export const AppointmentService = {
  bookAppointment,
  payAppointment,
  bookAppointmentCallback,
  cancelAppointment,
};

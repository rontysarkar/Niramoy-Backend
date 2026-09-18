import { PaymentWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../interface";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { buildQuery } from "../../utils/buildQuery";
import { IRequestUser } from "../auth/auth.interface";
import httpStatus from "http-status";

const getMyPayments = async (query: IQuery, user: IRequestUser) => {
  const { limit, page, skip, sortBy, sortOrder } = buildQuery(query);

  const patient = await prisma.patient.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient not found");
  }

  const andConditions: PaymentWhereInput[] = [
    {
      appointment: {
        patientId: patient.id,
      },
    },
  ];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        {
          appointment: {
            doctor: {
              name: {
                contains: query.searchTerm,
                mode: "insensitive",
              },
            },
          },
        },
      ],
    });
  }

  const payments = await prisma.payment.findMany({
    where: {
      AND: andConditions,
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: skip,
    take: limit,
  });

  const total = await prisma.payment.count({
    where: {
      AND: andConditions,
    },
  });

  return {
    data: payments,
    meta: {
      total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAllPayments = async (query: IQuery) => {
  const { limit, page, skip, sortBy, sortOrder } = buildQuery(query);

  const andConditions: PaymentWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        {
          appointment: {
            doctor: {
              name: {
                contains: query.searchTerm,
                mode: "insensitive",
              },
            },
          },
        },
      ],
    });
  }

  const payments = await prisma.payment.findMany({
    where: {
      AND: andConditions,
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: skip,
    take: limit,
  });

  const total = await prisma.payment.count({
    where: {
      AND: andConditions,
    },
  });

  return {
    data: payments,
    meta: {
      total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getPaymentById = async (paymentId: string, user: IRequestUser) => {
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },

    include: {
      appointment: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
  }

  if (
    user.role === "PATIENT" &&
    payment.appointment.patient.userId !== user.userId
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not the owner of this payment",
    );
  }

  return payment;
};

export const PaymentServices = {
  getMyPayments,
  getAllPayments,
    getPaymentById,
};

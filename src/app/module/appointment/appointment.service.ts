import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import {
  AppointmentStatus,
  PaymentStatus,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";
import {
  IBookAppointmentPayload,
  ICancelAppointmentPayload,
  IPayAppointmentPayload,
  IUpdateAppointmentStatusPayload,
} from "./appointment.interface";
import httpStatus from "http-status";
import { transporter } from "../../lib/nodemailer";
import PDFDocument from "pdfkit";
import { IQuery } from "../../interface";
import { buildQuery } from "../../utils/buildQuery";
import { AppointmentWhereInput } from "../../../generated/prisma/models";

const bookAppointment = async (
  payload: IBookAppointmentPayload,
  user: IRequestUser,
) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient) {
      throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: payload.scheduleId },
      include: { doctor: true },
    });

    if (!schedule || schedule.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status !== ScheduleStatus.PUBLISHED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Published Yet",
      );
    }

    const now = new Date();

    if (!isSameDay(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Available Today",
      );
    }

    if (!isBefore(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Has Already Started",
      );
    }

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        scheduleId: schedule.id,
        // status : { not : AppointmentStatus.CANCELLED }
      },
    });

    if (existingAppointment?.status === AppointmentStatus.PENDING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Pending Appointment. Please Pay For That",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Confirmed Appointment.",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.ONGOING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Ongoing Appointment",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
      );
    }

    if (schedule.availableSlots === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Fully Booked",
      );
    }

    if (!schedule.doctor.consultationFee) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Doctor Has Not Set A Consultation Fee Yet",
      );
    }

    const amount = schedule.doctor.consultationFee.toString();

    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

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
          amount: amount,
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );

    const createPaymentResult = await createPaymentResponse.json();

    await tx.payment.create({
      data: {
        amount: amount,
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

const payAppointment = async (
  payload: IPayAppointmentPayload,
  user: IRequestUser,
) => {
  const appointmentId = payload?.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
    include: {
      doctor: true,
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

  if (
    existingAppointment?.doctor?.consultationFee === null ||
    existingAppointment?.doctor?.consultationFee === undefined
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Doctor Has Not Set A Consultation Fee Yet",
    );
  }

  const amount = existingAppointment?.doctor?.consultationFee?.toString();

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
        amount: amount,
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
      const existingAppointment = await tx.appointment.findUnique({
        where: {
          id: executePaymentResult?.merchantInvoiceNumber,
        },
        include: {
          schedule: true,
          patient: true,
          doctor: true,
        },
      });

      if (!existingAppointment) {
        throw new AppError(
          httpStatus.NOT_FOUND,
          "Appointment Not Found For This Payment",
        );
      }

      const availableSlots = existingAppointment?.schedule?.availableSlots;

      const bookedSlots =
        existingAppointment?.schedule?.totalSlots - availableSlots;

      const serialNumber = bookedSlots + 1;
      const joiningTime = addMinutes(
        existingAppointment?.schedule?.startDateTime,
        (serialNumber - 1) * Number(config.appointment_time_slot),
      );

      await tx.appointment.update({
        where: {
          id: executePaymentResult?.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
          serialNumber: serialNumber,
          joiningTime: joiningTime,
        },
      });

      await tx.schedule.update({
        where: {
          id: existingAppointment?.scheduleId,
        },
        data: {
          availableSlots: {
            decrement: 1,
          },
        },
      });

      await tx.payment.update({
        where: {
          appointmentId: executePaymentResult?.merchantInvoiceNumber,
          paymentId: paymentID,
        },
        data: {
          status: PaymentStatus.PAID,
          trxId: executePaymentResult?.trxID,
          paidAt: executePaymentResult?.paymentExecuteTime,
          gatewayResponse: executePaymentResult,
        },
      });

      const pdfDocument = new PDFDocument({ margin: 50 });

      const pdfChunks: Buffer[] = [];

      pdfDocument.on("data", (chunk) => pdfChunks.push(chunk));

      const pdfReadyPromise = new Promise<Buffer>((resolve) => {
        pdfDocument.on("end", () => {
          resolve(Buffer.concat(pdfChunks));
        });
      });

      pdfDocument
        .fontSize(20)
        .text("Niramoy Healthcare System", { align: "center" });
      pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
      pdfDocument.moveDown(2);

      pdfDocument
        .fontSize(12)
        .text(`Patient Name: ${existingAppointment?.patient?.name}`);
      pdfDocument.text(`Patient Email: ${existingAppointment?.patient?.email}`);
      pdfDocument.moveDown();

      pdfDocument.text(`Doctor Name: ${existingAppointment.doctor?.name}`);
      pdfDocument.text(
        `Specialization: ${existingAppointment.doctor?.specialization}`,
      );
      pdfDocument.moveDown();

      pdfDocument.text(
        `Appointment Date: ${existingAppointment?.schedule?.startDateTime.toDateString()}`,
      );
      pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
      pdfDocument.text(`Your Serial Number: ${serialNumber}`);
      pdfDocument.text(
        `Meeting Link: ${existingAppointment?.schedule?.meetingLink}`,
      );
      pdfDocument.moveDown();

      pdfDocument.text(`Amount Paid: ${executePaymentResult.amount} BDT`);
      pdfDocument.text(`Payment Method: bKash`);
      pdfDocument.text(`Transaction Id: ${executePaymentResult.trxID}`);
      pdfDocument.text(`Paid At: ${executePaymentResult.paymentExecuteTime}`);

      pdfDocument.end();

      const pdfBuffer = await pdfReadyPromise;

      await transporter.sendMail({
        from: config.email_sender,
        to: existingAppointment?.patient?.email,
        subject: "Your Appointment Invoice - Niramoy Healthcare System",
        text: "Thank you for booking an appointment. Please find your invoice attached.",
        attachments: [
          {
            filename: "invoice.pdf",
            content: pdfBuffer,
          },
        ],
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

const cancelAppointment = async (
  payload: ICancelAppointmentPayload,
  user: IRequestUser,
) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload?.appointmentId;

    const existingAppointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
        patient: {
          email: user.email,
        },
      },
      include: {
        payment: true,
        schedule: true,
      },
    });

    if (!existingAppointment) {
      throw new AppError(httpStatus.NOT_FOUND, "Appointment does not exist");
    }

    if (
      existingAppointment.status === "ONGOING" ||
      existingAppointment.status === "COMPLETED"
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Appointment already Ongoing or Completed, Now Your Cant't Cancel",
      );
    }

    if (existingAppointment.status === "CANCELLED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Appointment Already Canceled",
      );
    }

    // When Appointment Pending ????

    const updatedAppointment = await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
    });

    await prisma.schedule.update({
      where: {
        id: existingAppointment?.scheduleId,
      },
      data: {
        availableSlots: {
          increment: 1,
        },
      },
    });

    const now = new Date();
    const startDaeTime = existingAppointment?.schedule?.startDateTime;

    const returnCutOffTime = subHours(startDaeTime, 1);

    const isEligibleForRefund = isBefore(now, returnCutOffTime);

    if (!isEligibleForRefund) {
      const bkashIdToken = await getBkashIdToken();

      if (!bkashIdToken) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Bkash Id Token Missing",
        );
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

      await prisma.payment.update({
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
    }

    const paymentInfo = await prisma.payment.findUnique({
      where: {
        appointmentId: existingAppointment?.id,
      },
    });

    return {
      appointment: updatedAppointment,
      payment: paymentInfo,
    };
  });
  return transactionResult;
};

const updateAppointmentStatus = async (
  appointmentId: string,
  payload: IUpdateAppointmentStatusPayload,
  user: IRequestUser,
) => {
  const existingDoctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!existingDoctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found");
  }

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
      doctorId: existingDoctor.id,
    },
  });

  if (!existingAppointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
  }

  if (existingAppointment.status === AppointmentStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Appointment is already cancelled",
    );
  }

  if (existingAppointment.status === AppointmentStatus.COMPLETED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Appointment is already completed",
    );
  }

  if (existingAppointment.status === AppointmentStatus.CONFIRMED) {
    if (payload.status !== AppointmentStatus.ONGOING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You can only update status to ONGOING from CONFIRMED",
      );
    }
  }

  if (existingAppointment.status === AppointmentStatus.ONGOING) {
    if (payload.status !== AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You can only update status to COMPLETED from ONGOING",
      );
    }
  }

  const updatedAppointment = await prisma.appointment.update({
    where: {
      id: appointmentId,
    },
    data: {
      status: payload.status,
    },
  });

  return updatedAppointment;
};


const getPatientAppointments = async(query:IQuery,User:IRequestUser)=>{

    const {limit,page,skip,sortBy,sortOrder} = buildQuery(query)

    const patient = await prisma.patient.findUnique({
        where : { userId : User.userId }
    })

    if(!patient){
        throw new AppError(httpStatus.NOT_FOUND,"Patient Profile Not Found")
    }

    const andCondition : AppointmentWhereInput[] = [
      {
        patient
      }
    ]

    if(query?.status){
      andCondition.push({
        status : query.status as AppointmentStatus
      })
    }
    
    const appointments = await prisma.appointment.findMany({
        where : {
          AND : andCondition
        },
        orderBy : {
          [sortBy] : sortOrder
        },
        skip,
        take : limit,
        include:{
          doctor : {select : {name:true,email:true,specialization:true,consultationFee:true}},
          schedule:true,
          payment:true
        }
    })    

    const total = await prisma.appointment.count({
      where : {
        AND : andCondition
      }
    })

    return {
      data : appointments,
      meta : {
        page,
        limit,
        total,
        totalPages : Math.ceil(total/Number(limit)),
      } 
    }


}

const getDoctorAppointments = async(query:IQuery,User:IRequestUser)=>{

  const {limit,page,skip,sortBy,sortOrder} = buildQuery(query)

  const doctor = await prisma.doctor.findUnique({
      where : { userId : User.userId }
  })

  if(!doctor){
      throw new AppError(httpStatus.NOT_FOUND,"Doctor Profile Not Found")
  }

  const andCondition : AppointmentWhereInput[] = [
    {
      doctorId : doctor.id  
    }
  ]

  if(query?.status){
    andCondition.push({
      status : query.status as AppointmentStatus
    })
  }
  
  const appointments = await prisma.appointment.findMany({
      where : {
        AND : andCondition
      },
      orderBy : {
        [sortBy] : sortOrder
      },
      skip,
      take : limit,
      include:{
        patient : {select : {name:true,email:true,contactNumber:true}},
        schedule:true,
        payment:true
      }
  })

  const total = await prisma.appointment.count({
    where : {
      AND : andCondition
    }
  })

  return {
    data : appointments,
    meta : {
      page,
      limit,
      total,
      totalPages : Math.ceil(total/Number(limit)),
    } 
  }
}

const getAllAppointments = async(query:IQuery)=>{

    const {limit,page,skip,sortBy,sortOrder} = buildQuery(query)

    const andCondition : AppointmentWhereInput[] = []

    if(query?.status){
      andCondition.push({
        status : query.status as AppointmentStatus
      })
    }

    if(query?.searchTerm){
      andCondition.push({
        OR : [
          {
            doctor : {
              name : {
                contains : query.searchTerm,
                mode : "insensitive"
              }
            }
          },
          {
            patient : {
              name : {
                contains : query.searchTerm,
                mode : "insensitive"
              }
            }
          }
        ]
      })
    }

    const appointments = await prisma.appointment.findMany({
        where : {
          AND : andCondition
        },
        orderBy : {
          [sortBy] : sortOrder
        },
        skip,
        take : limit,
        include:{
          doctor : {select : {name:true,email:true,specialization:true,consultationFee:true}},
          patient : {select : {name:true,email:true,contactNumber:true}},
          schedule:true,
          payment:true
        }
    })    

    const total = await prisma.appointment.count({
      where : {
        AND : andCondition
      }
    })  

    return {
      data : appointments,
      meta : {
        page,
        limit,
        total,
        totalPages : Math.ceil(total/Number(limit)),
      } 
    } 
}

const getAppointmentDetails = async(appointmentId:string,User:IRequestUser)=>{

    const appointment = await prisma.appointment.findUnique({
        where : {
            id : appointmentId
        },
        include:{
          doctor : {select : {name:true,email:true,specialization:true,consultationFee:true,userId:true }},
          patient : {select : {name:true,email:true,contactNumber:true,userId:true}},
          schedule:true,
          payment:true
        }
    })

    if(!appointment){
      throw new AppError(httpStatus.NOT_FOUND,"Appointment Not Found")
    }

    if(User.role === "PATIENT" && appointment.patient?.userId !== User.userId){
      throw new AppError(httpStatus.FORBIDDEN,"You Are Not Authorized To Access This Appointment")
    }

    if(User.role === "DOCTOR" && appointment.doctor?.userId !== User.userId){
      throw new AppError(httpStatus.FORBIDDEN,"You Are Not Authorized To Access This Appointment")
    }

    return appointment
}



export const AppointmentService = {
  bookAppointment,
  payAppointment,
  bookAppointmentCallback,
  cancelAppointment,
  updateAppointmentStatus,
  getPatientAppointments,
  getDoctorAppointments,
  getAllAppointments,
  getAppointmentDetails
};

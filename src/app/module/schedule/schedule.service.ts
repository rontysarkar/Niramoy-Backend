import {
  addDays,
  differenceInMinutes,
  isAfter,
  isSameDay,
  startOfDay,
} from "date-fns";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { IRequestUser } from "../auth/auth.interface";
import { ICreateSchedulePayload } from "./schedule.interface";
import httpStatus from "http-status";

const createSchedule = async (
  payload: ICreateSchedulePayload,
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

  if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time And End Date Time Must be On The Same Day",
    );
  }

  if (isAfter(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time Cannot be After End Date Time",
    );
  }

  const startOfTheDay = startOfDay(payload.startDateTime);
  const startOfTheNextDay = addDays(startOfTheDay, 1);

  const existingSchedule = await prisma.schedule.findFirst({
    where: {
      doctorId: existingDoctor.id,
      isDeleted: false,
      startDateTime: {
        gte: startOfTheDay,
        lt: startOfTheNextDay,
      },
    },
  });

  if (existingSchedule) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You Have Already Schedule of this Day",
    );
  }

  const durationInMinutes = differenceInMinutes(
    payload.startDateTime,
    payload.endDateTime,
  );

  const MINUTES_ALLOCATED_PER_SLOT = 20;

  const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

  if (totalSlots < 1) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long Fit To One Slot`,
    );
  }

  const schedule = await prisma.schedule.create({
    data: {
      meetingLink: payload.meetingLink,
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      totalSlots: totalSlots,
      availableSlots: totalSlots,
      doctorId: existingDoctor.id,
    },
  });

  return schedule;
};

export const ScheduleServices = {
  createSchedule,
};

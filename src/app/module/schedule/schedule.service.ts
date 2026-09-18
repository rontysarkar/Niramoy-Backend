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
import {
  ICreateSchedulePayload,
  IUpdateSchedulePayload,
} from "./schedule.interface";
import httpStatus from "http-status";
import { IQuery } from "../../interface";
import { buildQuery } from "../../utils/buildQuery";
import { ScheduleWhereInput } from "../../../generated/prisma/models";
import { ScheduleStatus } from "../../../generated/prisma/enums";

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
    payload.endDateTime,
    payload.startDateTime,
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
    include: {
      doctor: {
        select: {
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return schedule;
};

const getMySchedules = async (query: IQuery, user: IRequestUser) => {
  const existingDoctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!existingDoctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found");
  }

  const { limit, page, skip, sortBy, sortOrder } = buildQuery(query);

  const andConditions: ScheduleWhereInput[] = [
    {
      doctorId: existingDoctor.id,
    },
    {
      isDeleted: false,
    },
  ];

  if (query?.status) {
    andConditions.push({
      status: query.status,
    });
  }

  const schedule = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },
    take: limit,
    skip,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedule,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAllSchedules = async (query: IQuery) => {
  const { limit, page, skip, sortBy, sortOrder } = buildQuery(query);

  const andConditions: ScheduleWhereInput[] = [];

  if (query?.searchTerm) {
    andConditions.push({
      doctor: {
        OR: [
          {
            name: {
              contains: query?.searchTerm,
              mode: "insensitive",
            },
          },
          {
            email: { contains: query.searchTerm, mode: "insensitive" },
          },
          {
            specialization: { contains: query.searchTerm, mode: "insensitive" },
          },
        ],
      },
    });
  }

  const allSchedules = await prisma.schedule.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      doctor: true,
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: allSchedules,
    meta: {
      limit,
      page,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getScheduleById = async (scheduleId: string) => {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          specialization: true,
          userId: true,
        },
      },
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
  }

  return schedule;
};

const updateSchedule = async (
  scheduleId: string,
  payload: IUpdateSchedulePayload,
  user: IRequestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId, doctorId: doctor.id },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    schedule.totalSlots !== schedule.availableSlots
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Schedule Once Published And Appointment Booked Cannot Be Updated",
    );
  }

  payload.meetingLink = payload.meetingLink || schedule.meetingLink;
  payload.startDateTime = payload.startDateTime || schedule.startDateTime;
  payload.endDateTime = payload.endDateTime || schedule.endDateTime;

  if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time And End Date Time Must Be On The Same Day",
    );
  }
  if (isAfter(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time Cannot Be After End Date Time",
    );
  }

  //startDateTime = 2026-08-25T13:30:00.436Z => 1:30 PM
  const startOfTheDay = startOfDay(payload.startDateTime); // 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z
  const startOfNextDay = addDays(startOfTheDay, 1); // 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

  const existingScheduleOnThisDate = await prisma.schedule.findFirst({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      startDateTime: {
        gte: startOfTheDay,
        lt: startOfNextDay,
      },
    },
  });

  if (existingScheduleOnThisDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You Already Have A Schedule For This Date",
    );
  }

  const durationInMinutes = differenceInMinutes(
    payload.endDateTime,
    payload.startDateTime,
  );

  const MINUTES_ALLOCATED_PER_SLOT = 20;

  const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

  if (totalSlots < 1) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long To Fit One Slot`,
    );
  }

  const updatedSchedule = await prisma.schedule.update({
    where: {
      id: schedule.id,
    },
    data: {
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      meetingLink: payload.meetingLink,
      totalSlots,
      availableSlots: totalSlots,
      doctorId: doctor.id,
    },
    include: {
      doctor: {
        select: {
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return updatedSchedule;
};

const publishSchedule = async (scheduleId: string, user: IRequestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId, doctorId: doctor.id },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
  }

  if (schedule.status === ScheduleStatus.PUBLISHED) {
    throw new AppError(httpStatus.CONFLICT, "Schedule Is Already Published");
  }

  const publishedSchedule = await prisma.schedule.update({
    where: { id: schedule.id },
    data: { status: ScheduleStatus.PUBLISHED },
  });

  return publishedSchedule;
};

const deleteSchedule = async (scheduleId: string, user: IRequestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId, doctorId: doctor.id },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    schedule.totalSlots !== schedule.availableSlots
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Schedule Once Published And Appointment Booked Cannot Be Deleted",
    );
  }

  const deletedSchedule = await prisma.schedule.update({
    where: { id: schedule.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return deletedSchedule;
};

const getTodaysSchedules = async (query: IQuery) => {
  const { limit, page, skip, sortBy, sortOrder } = buildQuery(query);

  if (!query.doctorId) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Doctor Id Must Be Provided In Query",
    );
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: query.doctorId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const now = new Date();
  const startOfToday = startOfDay(now);
  const startOfTomorrow = addDays(startOfToday, 1);

  const andConditions: ScheduleWhereInput[] = [
    {
      doctorId: query.doctorId,
    },
    {
      isDeleted: false,
    },
    {
      status: ScheduleStatus.PUBLISHED,
    },
    {
      startDateTime: {
        gte: startOfToday,
        lt: startOfTomorrow,
        gt: now,
      },
    },
    {
      availableSlots: { gt: 0 },
    },
  ];

  const schedules = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip,
    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const ScheduleServices = {
  createSchedule,
  getMySchedules,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  publishSchedule,
  deleteSchedule,
  getTodaysSchedules,
};

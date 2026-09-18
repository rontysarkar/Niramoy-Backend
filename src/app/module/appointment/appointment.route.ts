import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  AppointmentController.bookAppointment,
);
router.post(
  "/pay-appointment",
  auth(Role.PATIENT),
  AppointmentController.payAppointment,
);
router.post(
  "/cancel-appointment",
  auth(Role.PATIENT,Role.ADMIN,Role.DOCTOR,Role.SUPER_ADMIN),
  AppointmentController.cancelAppointment,
);
router.get(
  "/book-appointment/payment/callback",
  AppointmentController.bookAppointmentCallback,
);

router.get(
  "/patient-appointments",
  auth(Role.PATIENT),
  AppointmentController.getPatientAppointments,
);

router.get(
  "/doctor-appointments",
  auth(Role.DOCTOR),
  AppointmentController.getDoctorAppointments,
);

router.get(
  "/all-appointments",
  auth(Role.ADMIN,Role.SUPER_ADMIN),
  AppointmentController.getAllAppointments,
);

router.get(
  "/appointment/:appointmentId",
  auth(Role.PATIENT,Role.DOCTOR,Role.ADMIN,Role.SUPER_ADMIN),
  AppointmentController.getAppointmentDetails,
);  

export const AppointmentRoutes = router;

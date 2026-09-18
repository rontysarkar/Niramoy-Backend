import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";
import { validateRequest } from "../../middleware/validateRequest";
import {
  applyAsDoctorVerifyEmailSchema,
  approveDoctorPayloadSchema,
  UpdateDoctorProfileValidationZodSchema,
} from "./doctor.validation";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/apply-as-doctor",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "additionalFiles", maxCount: 5 },
  ]),
  DoctorController.applyAsDoctor,
);
router.post(
  "/apply-as-doctor/verify-email",
  validateRequest(applyAsDoctorVerifyEmailSchema),
  DoctorController.applyAsDoctorVerifyEmail,
);

router.post(
  "/approve-doctor",
  validateRequest(approveDoctorPayloadSchema),
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.approveDoctor,
);
router.get(
  "/all-doctors",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.getAllDoctors,
);

router.patch(
  "/update-my-profile",
  auth(Role.DOCTOR),
  validateRequest(UpdateDoctorProfileValidationZodSchema),
  DoctorController.updateDoctorProfile,
);

// Public doctor-discovery routes (no auth) — meant for patients browsing before login.
router.get(
  "/public/available-today",
  DoctorController.getAvailableDoctorByTodaysSchedule,
);

router.get("/public/all-doctors", DoctorController.getAllDoctorsListPublic);

router.get("/public/:doctorId", DoctorController.getSingleDoctorPublicProfile);

export const DoctorRoutes = router;

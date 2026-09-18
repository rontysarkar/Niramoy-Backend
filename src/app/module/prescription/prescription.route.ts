import { Router } from "express";
import { PrescriptionController } from "./prescription.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { CreatePrescriptionValidationZodSchema } from "./prescription.validation";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post("/create-prescription",validateRequest(CreatePrescriptionValidationZodSchema),auth(Role.DOCTOR),PrescriptionController.createPrescription);
router.get("/prescriptions/:prescriptionId",auth(Role.ADMIN,Role.DOCTOR,Role.PATIENT,Role.SUPER_ADMIN), PrescriptionController.getSinglePrescription);
export const PrescriptionRoutes = router;
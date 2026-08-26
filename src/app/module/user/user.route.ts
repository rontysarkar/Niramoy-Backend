import { Router } from "express";
import { upload } from "../../lib/multer";
import { UserController } from "./user.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.patch(
	"/profile-image",
	auth(Role.ADMIN, Role.SUPER_ADMIN, Role.PATIENT, Role.DOCTOR),
	upload.single("profileImage"),
	UserController.profileImageUpdate,
);

export const UserRoutes = router;

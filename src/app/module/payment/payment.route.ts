import { Router } from "express";
import { PaymentController } from "./payment.controller";

const router = Router();

router.get("/my-payments", PaymentController.getMyPayments);
router.get("/all-payments", PaymentController.getAllPayments);
router.get("/:paymentId", PaymentController.getPaymentById);

export const PaymentRoutes = router;

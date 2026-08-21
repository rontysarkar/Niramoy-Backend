import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { redisClient } from "./app/lib/redis";
import crypto from "crypto";
import { UserRoutes } from "./app/module/user/user.route";
import { getBkashIdToken } from "./app/lib/bkash";
import { AppointmentRoutes } from "./app/module/appointment/appointment.route";

const app: Application = express();

app.use(
  cors({
    origin: config.frontend_url,
    credentials: true,
  }),
);


// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/user", UserRoutes);
app.use("/api/v1/appointment",AppointmentRoutes);

// Basic route
app.get("/", async (req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Welcome to Niramoy Healthcare System Backend",
  });
});

// testing route
app.get("/test", async (req: Request, res: Response) => {
  try {
    

      const result = await getBkashIdToken();
      console.log(result)

    res.status(200).json({
      success: true,
      message: "Get Successfully",
      data: null,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error",
    });
  }
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;

// add
